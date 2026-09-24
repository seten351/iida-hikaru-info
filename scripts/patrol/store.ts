import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getWriterDb } from "../../src/db/client";
import {
  appearanceProposalsTable, appearanceSourceLinksTable, appearancesTable,
  contentManagementStateTable, proposalSourceLinksTable, sourceItemsTable,
} from "../../src/db/schema";
import { inferSourceType, type WriterTransaction } from "../../src/server/appearances/source-foundation";
import { candidateId, type PatrolCandidate } from "./types";

const COLLECTOR_KEY = "appearance-patrol-v1";

export type KnownAppearance = { id: string; title: string; sourceUrl?: string };
export type QueuedCandidate = { id: string; candidate: PatrolCandidate; notified: boolean };
export type PatrolStore = {
  known: () => Promise<KnownAppearance[]>;
  enqueue: (candidate: PatrolCandidate) => Promise<void>;
  pending: () => Promise<QueuedCandidate[]>;
  markRegistered: (ids: string[]) => Promise<void>;
  markNotified: (ids: string[]) => Promise<void>;
};

async function requireActivatedState(tx: WriterTransaction) {
  const [state] = await tx.select().from(contentManagementStateTable)
    .where(eq(contentManagementStateTable.id, "singleton")).for("share");
  if (!state || state.contentMode !== "admin" || !state.adminActivatedAt || !state.legacyImportLockedAt || state.adminActivatedAt.getTime() !== state.legacyImportLockedAt.getTime()) {
    throw new Error("Patrol persistence requires completed Admin activation.");
  }
}

/** Also protects CLI invocations; Actions concurrency alone cannot do that. */
export async function withPatrolLock<T>(run: () => Promise<T>): Promise<T> {
  return getWriterDb().transaction(async (tx) => {
    const result = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${COLLECTOR_KEY}, 0)) as locked`);
    if (result.rows[0]?.locked !== true) throw new Error("Another patrol is already running.");
    return run();
  });
}

export function createPatrolStore(): PatrolStore {
  const db = getWriterDb();
  return {
    async known() {
      return db.select({ id: appearancesTable.id, title: appearancesTable.title, sourceUrl: sourceItemsTable.canonicalUrl })
        .from(appearancesTable)
        .leftJoin(appearanceSourceLinksTable, and(eq(appearanceSourceLinksTable.appearanceId, appearancesTable.id), eq(appearanceSourceLinksTable.active, true)))
        .leftJoin(sourceItemsTable, eq(sourceItemsTable.id, appearanceSourceLinksTable.sourceId))
        .then(rows => rows.map(row => ({ ...row, sourceUrl: row.sourceUrl ?? undefined })));
    },
    async enqueue(candidate) {
      const id = candidateId(candidate);
      await db.transaction(async (tx) => {
        await requireActivatedState(tx);
        const inserted = await tx.insert(appearanceProposalsTable).values({
          id, origin: "collector", operation: "create", status: "pending",
          title: candidate.title, category: candidate.category, seriesId: candidate.seriesId ?? null,
          startsAtPrecision: null, startsAt: null, startsOn: null,
          matchStatus: "incomplete",
          collectorKey: COLLECTOR_KEY, extractionContentHash: id.slice(7),
          reviewNote: candidate.note,
        }).onConflictDoNothing({ target: appearanceProposalsTable.id }).returning({ id: appearanceProposalsTable.id });
        if (!inserted.length) return;
        const sourceId = `src_${createHash("sha256").update(candidate.sourceUrl).digest("hex").slice(0, 32)}`;
        const now = new Date();
        await tx.insert(sourceItemsTable).values({
          id: sourceId, canonicalUrl: candidate.sourceUrl, sourceType: inferSourceType(candidate.sourceUrl),
          firstCollectedAt: now, lastCollectedAt: now,
        }).onConflictDoNothing({ target: sourceItemsTable.canonicalUrl });
        const [source] = await tx.select({ id: sourceItemsTable.id }).from(sourceItemsTable).where(eq(sourceItemsTable.canonicalUrl, candidate.sourceUrl));
        await tx.insert(proposalSourceLinksTable).values({
          // Discovery evidence is not a verified primary announcement.
          proposalId: id, sourceId: source.id, evidenceKey: "patrol", isPrimary: false,
          publishedAtPrecision: candidate.publishedAt ? "exact" : candidate.publishedOn ? "date" : null,
          publishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : null,
          publishedOn: candidate.publishedOn ?? null,
          reviewMetadata: { schemaVersion: 1, candidate, notifiedAt: null },
        });
      });
    },
    async pending() {
      const rows = await db.select({ id: appearanceProposalsTable.id, status: appearanceProposalsTable.status, metadata: proposalSourceLinksTable.reviewMetadata })
        .from(appearanceProposalsTable)
        .innerJoin(proposalSourceLinksTable, eq(proposalSourceLinksTable.proposalId, appearanceProposalsTable.id))
        .where(and(eq(appearanceProposalsTable.collectorKey, COLLECTOR_KEY), eq(appearanceProposalsTable.status, "pending"), eq(proposalSourceLinksTable.evidenceKey, "patrol")))
        .orderBy(asc(appearanceProposalsTable.createdAt), asc(appearanceProposalsTable.id));
      return rows.map(row => {
        const metadata = row.metadata;
        if (metadata?.schemaVersion !== 1 || !metadata.candidate) throw new Error("Invalid saved patrol candidate.");
        const candidate = metadata.candidate as PatrolCandidate;
        if (candidateId(candidate) !== row.id) throw new Error("Saved patrol candidate hash mismatch.");
        return { id: row.id, candidate, notified: typeof metadata.notifiedAt === "string" };
      });
    },
    async markRegistered(ids) {
      if (!ids.length) return;
      await db.transaction(async tx => {
        await requireActivatedState(tx);
        await tx.update(appearanceProposalsTable).set({
          status: "superseded", reviewNote: "最新DBで登録済みの情報と一致したため、補助巡回の候補を解決しました。",
          reviewedAt: new Date(), updatedAt: new Date(),
        }).where(and(inArray(appearanceProposalsTable.id, ids), eq(appearanceProposalsTable.collectorKey, COLLECTOR_KEY), eq(appearanceProposalsTable.status, "pending")));
      });
    },
    async markNotified(ids) {
      if (!ids.length) return;
      await db.transaction(async tx => {
        await requireActivatedState(tx);
        await tx.update(proposalSourceLinksTable).set({
          reviewMetadata: sql`jsonb_set(${proposalSourceLinksTable.reviewMetadata}, '{notifiedAt}', to_jsonb(now()::text))`, updatedAt: new Date(),
        }).where(and(inArray(proposalSourceLinksTable.proposalId, ids), eq(proposalSourceLinksTable.evidenceKey, "patrol")));
      });
    },
  };
}
