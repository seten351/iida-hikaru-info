import "server-only";

import { eq, sql } from "drizzle-orm";

import { getWriterDb } from "@/db/client";
import {
  appearanceRevisionsTable,
  appearanceSeriesRevisionsTable,
  contentManagementStateTable,
} from "@/db/schema";
import { adminActivationConfirmationPhrase } from "@/lib/admin-constants";
import type { WriterTransaction } from "@/server/appearances/source-foundation";

import { verifyAdminActivationReauthProof } from "./reauth-proof";

export class AdminActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminActivationError";
  }
}

type ContentState = {
  contentMode: "bootstrap" | "admin";
  adminActivatedAt: Date | null;
  legacyImportLockedAt: Date | null;
};

export type AdminActivationState = "ready" | "activated" | "inconsistent";

export function classifyAdminActivationState(state: ContentState): AdminActivationState {
  if (
    state.contentMode === "bootstrap" &&
    state.adminActivatedAt === null &&
    state.legacyImportLockedAt === null
  ) {
    return "ready";
  }
  if (
    state.contentMode === "admin" &&
    state.adminActivatedAt !== null &&
    state.legacyImportLockedAt !== null &&
    state.adminActivatedAt.getTime() === state.legacyImportLockedAt.getTime()
  ) {
    return "activated";
  }
  return "inconsistent";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRevisionSnapshots(
  appearanceRows: Array<{
    appearanceId: string;
    version: number;
    snapshotSchemaVersion: number;
    snapshot: unknown;
    proposalId: string | null;
    actorType: string;
  }>,
  seriesRows: Array<{
    seriesId: string;
    version: number;
    snapshotSchemaVersion: number;
    snapshot: unknown;
    proposalId: string | null;
    actorType: string;
  }>,
) {
  for (const row of appearanceRows) {
    const snapshot = row.snapshot;
    const appearance = isRecord(snapshot) && isRecord(snapshot.appearance)
      ? snapshot.appearance
      : null;
    const visibility = isRecord(snapshot) && isRecord(snapshot.visibility)
      ? snapshot.visibility
      : null;
    const sourceLinks = isRecord(snapshot) && Array.isArray(snapshot.sourceLinks)
      ? snapshot.sourceLinks
      : null;
    if (
      !isRecord(snapshot) ||
      !appearance ||
      appearance.id !== row.appearanceId ||
      typeof appearance.startsAt !== "string" ||
      typeof appearance.title !== "string" ||
      typeof appearance.category !== "string" ||
      typeof appearance.publishedAtPrecision !== "string" ||
      !visibility ||
      visibility.version !== row.version ||
      !["public", "hidden"].includes(String(visibility.status)) ||
      !sourceLinks ||
      sourceLinks.some(
        (link) =>
          !isRecord(link) ||
          typeof link.sourceId !== "string" ||
          typeof link.canonicalUrl !== "string" ||
          typeof link.evidenceKey !== "string" ||
          typeof link.active !== "boolean" ||
          typeof link.isPrimary !== "boolean" ||
          (row.snapshotSchemaVersion === 2 &&
            (typeof link.sourceType !== "string" ||
              typeof link.createdAt !== "string" ||
              typeof link.updatedAt !== "string")),
      ) ||
      ![1, 2].includes(row.snapshotSchemaVersion) ||
      (row.snapshotSchemaVersion === 2 && !("series" in snapshot)) ||
      (row.actorType === "admin" &&
        (row.snapshotSchemaVersion !== 2 || row.proposalId === null))
    ) {
      throw new AdminActivationError("appearance revision invariant failed.");
    }
  }
  for (const row of seriesRows) {
    const snapshot = row.snapshot;
    if (
      !isRecord(snapshot) ||
      snapshot.id !== row.seriesId ||
      snapshot.version !== row.version ||
      typeof snapshot.displayName !== "string" ||
      row.snapshotSchemaVersion !== 1 ||
      (row.actorType === "admin" && row.proposalId === null)
    ) {
      throw new AdminActivationError("series revision invariant failed.");
    }
  }
}

async function assertActivationCheckpoint(tx: WriterTransaction) {
  // Run the same deferred invariant function that protects Phase 1C writes.
  await tx.execute(sql`select phase1c_assert_appearance_invariants(id) from appearances`);

  const result = await tx.execute<{
    migrations: number;
    appearances: number;
    cards: number;
    series: number;
    appearance_proposals: number;
    series_proposals: number;
    bad_checkpoint: number;
    bad_primary: number;
    bad_canonical_identity: number;
    bad_event_group: number;
    bad_appearance_revision_chain: number;
    bad_series_revision_chain: number;
    bad_admin_artifacts: number;
    bad_publication_precision: number;
  }>(sql`
    select
      (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
      (select count(*)::int from appearances) as appearances,
      (select count(distinct coalesce(event_group_id, 'appearance:' || id))::int from appearances) as cards,
      (select count(*)::int from appearance_series) as series,
      (select count(*)::int from appearance_proposals) as appearance_proposals,
      (select count(*)::int from appearance_series_proposals) as series_proposals,
      (select count(*)::int from appearance_backfill_checkpoints
        where id <> 'phase-1b' or completed_at is null or dual_write_confirmed_at is null
          or processed_count <> 120 or last_appearance_id is distinct from (select max(id) from appearances)) as bad_checkpoint,
      (select count(*)::int from appearances a where
        (select count(*) from appearance_source_links l
          where l.appearance_id = a.id and l.active and l.is_primary) <> 1) as bad_primary,
      (select count(*)::int from source_items s where
        (select count(*) from source_identities i
          where i.source_id = s.id and i.is_canonical) <> 1) as bad_canonical_identity,
      (select count(*)::int from (
        select event_group_id
        from appearances
        where event_group_id is not null
        group by event_group_id
        having count(distinct event_title) <> 1
          or count(distinct category) <> 1
          or count(distinct coalesce(series_id, '<null>')) <> 1
          or count(*) <> count(distinct session_label)
      ) violations) as bad_event_group,
      (select count(*)::int from appearances a where
        not exists (select 1 from appearance_revisions r where r.appearance_id = a.id and r.version = 1 and r.snapshot_schema_version = 1)
        or not exists (select 1 from appearance_revisions r where r.appearance_id = a.id and r.version = a.version)
        or (select count(*) from appearance_revisions r where r.appearance_id = a.id) <> a.version
        or (select max(version) from appearance_revisions r where r.appearance_id = a.id) <> a.version
      ) as bad_appearance_revision_chain,
      (select count(*)::int from appearance_series s where
        not exists (select 1 from appearance_series_revisions r where r.series_id = s.id and r.version = 1 and r.snapshot_schema_version = 1)
        or not exists (select 1 from appearance_series_revisions r where r.series_id = s.id and r.version = s.version)
        or (select count(*) from appearance_series_revisions r where r.series_id = s.id) <> s.version
        or (select max(version) from appearance_series_revisions r where r.series_id = s.id) <> s.version
      ) as bad_series_revision_chain,
      ((select count(*) from appearance_proposals where origin = 'admin')
        + (select count(*) from appearance_revisions where actor_type = 'admin')
        + (select count(*) from appearance_series_proposals)
        + (select count(*) from appearance_series_revisions where actor_type = 'admin'))::int as bad_admin_artifacts,
      ((select count(*) from appearances where
        (published_at_precision = 'timestamp' and (published_at is null or published_on is not null))
        or (published_at_precision = 'date' and (published_at is not null or published_on is null))
        or (published_at_precision = 'unknown' and (published_at is not null or published_on is not null)))
        + (select count(*) from appearance_source_links where
          (published_at_precision = 'timestamp' and (published_at is null or published_on is not null))
          or (published_at_precision = 'date' and (published_at is not null or published_on is null))
          or (published_at_precision = 'unknown' and (published_at is not null or published_on is not null))))::int as bad_publication_precision
  `);
  const checkpoint = result.rows[0];
  if (
    !checkpoint ||
    Number(checkpoint.migrations) < 9 ||
    Number(checkpoint.appearances) !== 120 ||
    Number(checkpoint.cards) !== 97 ||
    Number(checkpoint.series) !== 31 ||
    Number(checkpoint.appearance_proposals) !== 0 ||
    Number(checkpoint.series_proposals) !== 0 ||
    Number(checkpoint.bad_checkpoint) !== 0 ||
    Number(checkpoint.bad_primary) !== 0 ||
    Number(checkpoint.bad_canonical_identity) !== 0 ||
    Number(checkpoint.bad_event_group) !== 0 ||
    Number(checkpoint.bad_appearance_revision_chain) !== 0 ||
    Number(checkpoint.bad_series_revision_chain) !== 0 ||
    Number(checkpoint.bad_admin_artifacts) !== 0 ||
    Number(checkpoint.bad_publication_precision) !== 0
  ) {
    throw new AdminActivationError("Phase 1/2 activation checkpoint failed.");
  }

  const [appearanceRows, seriesRows] = await Promise.all([
    tx.select().from(appearanceRevisionsTable),
    tx.select().from(appearanceSeriesRevisionsTable),
  ]);
  assertRevisionSnapshots(appearanceRows, seriesRows);
}

export type ActivateAdminInput = {
  confirmation: string;
  proof: string;
  sessionId: string;
  sessionSecret: string;
  writeEnabled: boolean;
  now?: Date;
};

export async function activateAdminContent(input: ActivateAdminInput) {
  return getWriterDb().transaction(async (tx) => {
    if (
      !input.writeEnabled ||
      input.confirmation !== adminActivationConfirmationPhrase ||
      !verifyAdminActivationReauthProof(
        input.proof,
        input.sessionSecret,
        input.sessionId,
        input.now,
      )
    ) {
      throw new AdminActivationError("Activation authorization failed.");
    }

    const [state] = await tx
      .select()
      .from(contentManagementStateTable)
      .where(eq(contentManagementStateTable.id, "singleton"))
      .for("update");
    if (!state) throw new AdminActivationError("Content state is missing.");
    const classification = classifyAdminActivationState(state);
    if (classification === "inconsistent") {
      throw new AdminActivationError("Content state is inconsistent.");
    }
    if (classification === "activated") {
      return { status: "already-activated" as const, activatedAt: state.adminActivatedAt! };
    }

    await assertActivationCheckpoint(tx);
    const [activated] = await tx
      .update(contentManagementStateTable)
      .set({
        contentMode: "admin",
        adminActivatedAt: sql`transaction_timestamp()`,
        legacyImportLockedAt: sql`transaction_timestamp()`,
        updatedAt: sql`transaction_timestamp()`,
      })
      .where(eq(contentManagementStateTable.id, "singleton"))
      .returning({ activatedAt: contentManagementStateTable.adminActivatedAt });
    if (!activated?.activatedAt) {
      throw new AdminActivationError("Content state update failed.");
    }
    return { status: "activated" as const, activatedAt: activated.activatedAt };
  });
}

export async function readAdminActivationState() {
  const [state] = await getWriterDb()
    .select()
    .from(contentManagementStateTable)
    .where(eq(contentManagementStateTable.id, "singleton"));
  if (!state) throw new AdminActivationError("Content state is missing.");
  return { state, classification: classifyAdminActivationState(state) };
}
