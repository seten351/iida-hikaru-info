import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { count, eq, inArray, sql } from "drizzle-orm";

import { closeWriterDb, getWriterDb } from "../src/db/client";
import {
  appearanceProposalsTable,
  appearanceRevisionsTable,
  appearanceSeriesProposalsTable,
  appearanceSeriesRevisionsTable,
  appearanceSeriesTable,
  appearanceSourceLinksTable,
  appearancesTable,
  contentManagementStateTable,
  proposalSourceLinksTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "../src/db/schema";
import {
  confirmAdminWrite,
  rejectAdminWrite,
  validateAdminWritePreview,
  type AdminWriteResult,
} from "../src/server/admin/write-service";
import type {
  AdminAppearanceMutationInput,
  AdminSourceMutationInput,
  AdminWriteInput,
} from "../src/server/admin/write-input";

function key() {
  return randomUUID();
}

function approved(result: AdminWriteResult) {
  if (result.status !== "approved") throw new Error(result.message);
  return result;
}

async function main() {
  assert.equal(
    process.env.PHASE_2B_TEST_DATABASE,
    "1",
    "Refusing to run without PHASE_2B_TEST_DATABASE=1.",
  );
  assert.match(
    process.env.PHASE_2B_TEST_BRANCH_ID ?? "",
    /^br-/,
    "PHASE_2B_TEST_BRANCH_ID must identify the isolated Neon branch.",
  );

  const db = getWriterDb();
  const [originalState] = await db.select().from(contentManagementStateTable)
    .where(eq(contentManagementStateTable.id, "singleton"));
  assert.equal(originalState.contentMode, "bootstrap");
  const fingerprint = async () => {
    const result = await db.execute(sql`select md5(jsonb_build_array(
      (select jsonb_agg(to_jsonb(t) order by id) from appearances t),
      (select jsonb_agg(to_jsonb(t) order by id) from appearance_series t),
      (select jsonb_agg(to_jsonb(t) order by id) from appearance_proposals t),
      (select jsonb_agg(to_jsonb(t) order by id) from appearance_series_proposals t),
      (select jsonb_agg(to_jsonb(t) order by appearance_id, version) from appearance_revisions t),
      (select jsonb_agg(to_jsonb(t) order by series_id, version) from appearance_series_revisions t),
      (select jsonb_agg(to_jsonb(t) order by id) from source_items t),
      (select jsonb_agg(to_jsonb(t) order by id) from source_identities t),
      (select jsonb_agg(to_jsonb(t) order by appearance_id, source_id, evidence_key) from appearance_source_links t),
      (select jsonb_agg(to_jsonb(t) order by proposal_id, source_id, evidence_key) from proposal_source_links t),
      (select to_jsonb(t) from content_management_state t where id = 'singleton')
    )::text) as fingerprint`);
    return result.rows;
  };
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const prefix = `phase2b-${suffix}`;
  const appearanceA = `${prefix}-a`;
  const appearanceB = `${prefix}-b`;
  const seriesId = `${prefix}-series`;
  const rejectedSeriesId = `${prefix}-rejected`;
  const urlA = `https://example.com/${prefix}/source-a`;
  const urlB = `https://example.com/${prefix}/source-b`;
  const urlC = `https://example.com/${prefix}/source-c`;
  const rollbackUrl = `https://example.com/${prefix}/rollback`;
  const proposalIds = new Set<string>();

  const baseline = await Promise.all([
    db.select({ value: count() }).from(appearancesTable),
    db.select({ value: count() }).from(appearanceSeriesTable),
    db.select({ value: count() }).from(sourceItemsTable),
    db.select({ value: count() }).from(appearanceRevisionsTable),
    db.select({ value: count() }).from(appearanceProposalsTable),
    db.select({ value: count() }).from(appearanceSeriesProposalsTable),
  ]).then((rows) => rows.map((row) => row[0].value));

  const remember = (result: AdminWriteResult) => {
    result.proposalIds.forEach((id) => proposalIds.add(id));
    return result;
  };

  try {
    const createSeries: AdminWriteInput = {
      kind: "series",
      operation: "create",
      seriesId,
      expectedVersion: null,
      displayName: `Phase 2B ${suffix}`,
    };
    await validateAdminWritePreview(createSeries);
    const beforeRefusal = await fingerprint();
    const refusedInputs: AdminWriteInput[] = [
      createSeries,
      { kind: "appearance", operation: "hide", appearanceId: "missing", expectedVersion: 1 },
      { kind: "source", operation: "primary", targets: [{ appearanceId: "missing", expectedVersion: 1 }], source: { sourceId: "missing", evidenceKey: "default" } },
    ];
    for (const input of refusedInputs) {
      await assert.rejects(confirmAdminWrite(input, key()), /activation/);
      await assert.rejects(rejectAdminWrite(input, key()), /activation/);
    }
    assert.deepEqual(await fingerprint(), beforeRefusal);
    // Only this ephemeral integration fixture simulates a completed activation.
    const fixtureActivatedAt = new Date();
    await db.update(contentManagementStateTable).set({
      contentMode: "admin",
      adminActivatedAt: fixtureActivatedAt,
      legacyImportLockedAt: fixtureActivatedAt,
    })
      .where(eq(contentManagementStateTable.id, "singleton"));
    await validateAdminWritePreview(createSeries);
    let confirmAfterTransition: Promise<unknown> | undefined;
    await db.transaction(async (tx) => {
      await tx.update(contentManagementStateTable).set({
        contentMode: "bootstrap",
        adminActivatedAt: null,
        legacyImportLockedAt: null,
      })
        .where(eq(contentManagementStateTable.id, "singleton"));
      // Confirm races a transaction holding the state lock and must see its committed mode.
      confirmAfterTransition = assert.rejects(confirmAdminWrite(createSeries, key()), /activation/);
    });
    await confirmAfterTransition;
    assert.deepEqual(await fingerprint(), beforeRefusal);
    await db.update(contentManagementStateTable).set({
      contentMode: "admin",
      adminActivatedAt: fixtureActivatedAt,
      legacyImportLockedAt: fixtureActivatedAt,
    })
      .where(eq(contentManagementStateTable.id, "singleton"));
    const seriesKey = key();
    const seriesCreated = approved(remember(await confirmAdminWrite(createSeries, seriesKey)));
    assert.deepEqual(seriesCreated.targets, [{ id: seriesId, version: 1 }]);
    const seriesReplay = approved(remember(await confirmAdminWrite(createSeries, seriesKey)));
    assert.equal(seriesReplay.replayed, true);

    const sourceA = {
      canonicalUrl: urlA,
      sourceName: `admin-${prefix}`,
      externalItemId: "source-a",
      evidenceKey: "default",
      precision: "unknown" as const,
      publishedAt: null,
      publishedOn: null,
    };
    const createAppearance = (
      id: string,
      title: string,
      sourceUrl: string,
      externalItemId: string,
    ): Extract<AdminAppearanceMutationInput, { operation: "create" }> => ({
      kind: "appearance",
      operation: "create",
      expectedVersion: null,
      fields: {
        id,
        startsAt: "2027-01-02T12:00:00+09:00",
        title,
        seriesId,
        eventGroupId: `${prefix}-group`,
        eventTitle: `Phase 2B event ${suffix}`,
        sessionLabel: id.endsWith("-a") ? "day" : "night",
        category: "イベント",
      },
      source: {
        ...sourceA,
        canonicalUrl: sourceUrl,
        externalItemId,
      },
    });
    for (const input of [
      createAppearance(appearanceA, "Phase 2B A", urlA, "source-a"),
      createAppearance(appearanceB, "Phase 2B B", urlB, "source-b"),
    ]) {
      await validateAdminWritePreview(input);
      approved(remember(await confirmAdminWrite(input, key())));
    }

    const updateA = (title: string): AdminAppearanceMutationInput => ({
      kind: "appearance",
      operation: "update",
      appearanceId: appearanceA,
      expectedVersion: 1,
      fields: {
        ...createAppearance(appearanceA, title, urlA, "source-a").fields,
        title,
      },
    });
    const concurrent = await Promise.all([
      confirmAdminWrite(updateA("Phase 2B A first"), key()),
      confirmAdminWrite(updateA("Phase 2B A second"), key()),
    ]);
    concurrent.forEach(remember);
    assert.equal(concurrent.filter((result) => result.status === "approved").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "superseded").length, 1);

    const versionsAfterRace = await db
      .select({ id: appearancesTable.id, version: appearancesTable.version })
      .from(appearancesTable)
      .where(inArray(appearancesTable.id, [appearanceA, appearanceB]));
    const versions = new Map(versionsAfterRace.map((row) => [row.id, row.version]));
    assert.equal(versions.get(appearanceA), 2);
    assert.equal(versions.get(appearanceB), 1);

    const sourceBatch: AdminSourceMutationInput = {
      kind: "source",
      operation: "append",
      targets: [
        { appearanceId: appearanceA, expectedVersion: 2 },
        { appearanceId: appearanceB, expectedVersion: 1 },
      ],
      source: {
        canonicalUrl: urlC,
        sourceName: `admin-${prefix}`,
        externalItemId: "shared-source",
        evidenceKey: "shared",
        precision: "date",
        publishedAt: null,
        publishedOn: "2027-01-01",
      },
    };
    await validateAdminWritePreview(sourceBatch);
    const batchKey = key();
    const batch = approved(remember(await confirmAdminWrite(sourceBatch, batchKey)));
    assert.equal(batch.targets.length, 2);
    const batchReplay = approved(remember(await confirmAdminWrite(sourceBatch, batchKey)));
    assert.equal(batchReplay.replayed, true);

    const [sharedSource] = await db
      .select({ id: sourceItemsTable.id })
      .from(sourceItemsTable)
      .where(eq(sourceItemsTable.canonicalUrl, urlC));
    assert.ok(sharedSource);
    const primaryInput: AdminSourceMutationInput = {
      kind: "source",
      operation: "primary",
      targets: [
        { appearanceId: appearanceA, expectedVersion: 3 },
        { appearanceId: appearanceB, expectedVersion: 2 },
      ],
      source: { sourceId: sharedSource.id, evidenceKey: "shared" },
    };
    await validateAdminWritePreview(primaryInput);
    approved(remember(await confirmAdminWrite(primaryInput, key())));

    const replaceInput: AdminSourceMutationInput = {
      kind: "source",
      operation: "replace",
      targets: [{ appearanceId: appearanceA, expectedVersion: 4 }],
      source: {
        canonicalUrl: `https://example.com/${prefix}/replacement`,
        sourceName: `admin-${prefix}`,
        externalItemId: "replacement",
        evidenceKey: "replacement",
        precision: "exact",
        publishedAt: "2027-01-01T00:00:00Z",
        publishedOn: null,
      },
    };
    await validateAdminWritePreview(replaceInput);
    approved(remember(await confirmAdminWrite(replaceInput, key())));

    const [beforeRollback] = await db
      .select({ version: appearancesTable.version })
      .from(appearancesTable)
      .where(eq(appearancesTable.id, appearanceA));
    const rollbackInput: AdminSourceMutationInput = {
      kind: "source",
      operation: "append",
      targets: [{ appearanceId: appearanceA, expectedVersion: beforeRollback.version }],
      source: {
        canonicalUrl: rollbackUrl,
        sourceName: `admin-${prefix}`,
        externalItemId: "shared-source",
        evidenceKey: "rollback",
        precision: "unknown",
        publishedAt: null,
        publishedOn: null,
      },
    };
    await assert.rejects(confirmAdminWrite(rollbackInput, key()));
    const [[rolledBackSource], [afterRollback]] = await Promise.all([
      db.select({ value: count() }).from(sourceItemsTable).where(eq(sourceItemsTable.canonicalUrl, rollbackUrl)),
      db.select({ version: appearancesTable.version }).from(appearancesTable).where(eq(appearancesTable.id, appearanceA)),
    ]);
    assert.equal(rolledBackSource.value, 0);
    assert.equal(afterRollback.version, beforeRollback.version);

    const hideInput: AdminAppearanceMutationInput = {
      kind: "appearance",
      operation: "hide",
      appearanceId: appearanceA,
      expectedVersion: afterRollback.version,
    };
    approved(remember(await confirmAdminWrite(hideInput, key())));
    const restoreInput: AdminAppearanceMutationInput = {
      ...hideInput,
      operation: "restore",
      expectedVersion: hideInput.expectedVersion + 1,
    };
    approved(remember(await confirmAdminWrite(restoreInput, key())));

    const rename: AdminWriteInput = {
      kind: "series",
      operation: "update",
      seriesId,
      expectedVersion: 1,
      displayName: `Phase 2B renamed ${suffix}`,
    };
    approved(remember(await confirmAdminWrite(rename, key())));
    const duplicateName: AdminWriteInput = {
      kind: "series",
      operation: "create",
      seriesId: rejectedSeriesId,
      expectedVersion: null,
      displayName: rename.displayName,
    };
    const rejected = remember(await confirmAdminWrite(duplicateName, key()));
    assert.equal(rejected.status, "rejected");

    const [state] = await db
      .select()
      .from(contentManagementStateTable)
      .where(eq(contentManagementStateTable.id, "singleton"));
    assert.equal(state.contentMode, "admin");
    assert.equal(state.adminActivatedAt?.getTime(), fixtureActivatedAt.getTime());
    assert.equal(state.legacyImportLockedAt?.getTime(), fixtureActivatedAt.getTime());

    const [invariants] = await db.execute<{
      primary_violations: number;
      mirror_violations: number;
      bad_admin_revisions: number;
      unlinked_admin_revisions: number;
      canonical_identity_violations: number;
    }>(sql`
      select
        (select count(*)::int from appearances a where a.id in (${appearanceA}, ${appearanceB}) and (
          select count(*) from appearance_source_links l
          where l.appearance_id = a.id and l.active and l.is_primary
        ) <> 1) as primary_violations,
        (select count(*)::int
          from appearances a
          join appearance_source_links l on l.appearance_id = a.id and l.active and l.is_primary
          join source_items s on s.id = l.source_id
          join source_identities i on i.id = l.source_identity_id
          where a.id in (${appearanceA}, ${appearanceB})
            and (a.source_url is distinct from s.canonical_url
              or a.source_name is distinct from i.source_name
              or a.source_item_id is distinct from i.external_item_id
              or a.published_at is distinct from l.published_at
              or a.published_on is distinct from l.published_on
              or a.published_at_precision is distinct from l.published_at_precision)
        ) as mirror_violations,
        (select count(*)::int from appearance_revisions
          where appearance_id in (${appearanceA}, ${appearanceB})
            and actor_type = 'admin'
            and snapshot_schema_version <> 2
        ) as bad_admin_revisions,
        (select count(*)::int from appearance_revisions
          where appearance_id in (${appearanceA}, ${appearanceB})
            and actor_type = 'admin'
            and proposal_id is null
        ) as unlinked_admin_revisions,
        (select count(*)::int from source_items s
          where s.canonical_url like ${`https://example.com/${prefix}/%`}
            and (
              select count(*) from source_identities i
              where i.source_id = s.id and i.is_canonical
            ) <> 1
        ) as canonical_identity_violations
    `).then((result) => result.rows);
    assert.deepEqual(invariants, {
      primary_violations: 0,
      mirror_violations: 0,
      bad_admin_revisions: 0,
      unlinked_admin_revisions: 0,
      canonical_identity_violations: 0,
    });

    const ids = [...proposalIds];
    const [appearanceStatuses, seriesStatuses] = await Promise.all([
      db
        .select({ status: appearanceProposalsTable.status })
        .from(appearanceProposalsTable)
        .where(inArray(appearanceProposalsTable.id, ids)),
      db
        .select({ status: appearanceSeriesProposalsTable.status })
        .from(appearanceSeriesProposalsTable)
        .where(inArray(appearanceSeriesProposalsTable.id, ids)),
    ]);
    const statuses = [...appearanceStatuses, ...seriesStatuses].map(
      (proposal) => proposal.status,
    );
    assert.ok(statuses.includes("approved"));
    assert.ok(statuses.includes("rejected"));
    assert.ok(statuses.includes("superseded"));
  } finally {
    await db.update(contentManagementStateTable).set({
      contentMode: originalState.contentMode,
      adminActivatedAt: originalState.adminActivatedAt,
      legacyImportLockedAt: originalState.legacyImportLockedAt,
    })
      .where(eq(contentManagementStateTable.id, "singleton"));
    const appearanceIds = [appearanceA, appearanceB];
    const sourceRows = await db
      .select({ id: sourceItemsTable.id })
      .from(sourceItemsTable)
      .where(sql`${sourceItemsTable.canonicalUrl} like ${`https://example.com/${prefix}/%`}`);
    const sourceIds = sourceRows.map((row) => row.id);
    await db.transaction(async (tx) => {
      await tx.delete(appearanceRevisionsTable).where(inArray(appearanceRevisionsTable.appearanceId, appearanceIds));
      if (proposalIds.size) {
        const ids = [...proposalIds];
        await tx.delete(proposalSourceLinksTable).where(inArray(proposalSourceLinksTable.proposalId, ids));
        await tx.delete(appearanceProposalsTable).where(inArray(appearanceProposalsTable.id, ids));
        await tx.delete(appearanceSeriesRevisionsTable).where(inArray(appearanceSeriesRevisionsTable.proposalId, ids));
        await tx.delete(appearanceSeriesProposalsTable).where(inArray(appearanceSeriesProposalsTable.id, ids));
      }
      await tx.delete(appearanceSourceLinksTable).where(inArray(appearanceSourceLinksTable.appearanceId, appearanceIds));
      await tx.delete(appearancesTable).where(inArray(appearancesTable.id, appearanceIds));
      if (sourceIds.length) {
        await tx.delete(sourceIdentitiesTable).where(inArray(sourceIdentitiesTable.sourceId, sourceIds));
        await tx.delete(sourceItemsTable).where(inArray(sourceItemsTable.id, sourceIds));
      }
      await tx.delete(appearanceSeriesRevisionsTable).where(eq(appearanceSeriesRevisionsTable.seriesId, seriesId));
      await tx.delete(appearanceSeriesProposalsTable).where(
        sql`${appearanceSeriesProposalsTable.targetSeriesId} in (${seriesId}, ${rejectedSeriesId})`,
      );
      await tx.delete(appearanceSeriesTable).where(eq(appearanceSeriesTable.id, seriesId));
    });
  }

  const after = await Promise.all([
    db.select({ value: count() }).from(appearancesTable),
    db.select({ value: count() }).from(appearanceSeriesTable),
    db.select({ value: count() }).from(sourceItemsTable),
    db.select({ value: count() }).from(appearanceRevisionsTable),
    db.select({ value: count() }).from(appearanceProposalsTable),
    db.select({ value: count() }).from(appearanceSeriesProposalsTable),
  ]).then((rows) => rows.map((row) => row[0].value));
  assert.deepEqual(after, baseline);
  console.log("Phase 2B integration verification passed and fixtures were removed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeWriterDb();
  });
