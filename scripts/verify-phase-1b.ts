import assert from "node:assert/strict";

import { and, count, eq, ne, notExists, sql } from "drizzle-orm";

import { closeWriterDb, getDb, getWriterDb } from "../src/db/client";
import {
  appearanceBackfillCheckpointsTable,
  appearanceRevisionsTable,
  appearanceSourceLinksTable,
  appearancesTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "../src/db/schema";
import { buildAppearanceCards } from "../src/lib/appearances";
import {
  getAppearanceBackfillStatus,
  runAppearanceBackfill,
} from "../src/server/appearances/backfill-service";
import {
  appearanceSnapshotSchemaVersion,
  decodeAppearanceRevisionSnapshot,
} from "../src/server/appearances/revisions";
import { dualWriteAppearance } from "../src/server/appearances/source-foundation";
import { appearanceImportData } from "./appearance-import-data";

async function rowCounts() {
  const [sources] = await getDb().select({ value: count() }).from(sourceItemsTable);
  const [identities] = await getDb()
    .select({ value: count() })
    .from(sourceIdentitiesTable);
  const [links] = await getDb()
    .select({ value: count() })
    .from(appearanceSourceLinksTable);
  const [revisions] = await getDb()
    .select({ value: count() })
    .from(appearanceRevisionsTable);

  return {
    sources: sources.value,
    identities: identities.value,
    links: links.value,
    revisions: revisions.value,
  };
}

async function main() {
  assert.equal(
    process.env.PHASE_1B_TEST_DATABASE,
    "1",
    "Refusing to run write tests without PHASE_1B_TEST_DATABASE=1.",
  );

  const sortedItems = [...appearanceImportData].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  assert.equal(sortedItems.length, 120);

  const initialStatus = await getAppearanceBackfillStatus();
  assert.equal(initialStatus.appearances, 120);
  assert.equal(initialStatus.visibilityPending, 120);
  assert.equal(initialStatus.missingLinks, 120);
  assert.equal(initialStatus.initialRevisions, 0);
  assert.equal(initialStatus.checkpoint.lastAppearanceId, null);
  assert.equal(initialStatus.checkpoint.completedAt, null);

  await assert.rejects(
    runAppearanceBackfill({ confirmDualWrite: false, maxAppearances: 1 }),
    /requires --confirm=phase-1a-dual-write/,
  );

  const productionFirst = sortedItems[0];
  await dualWriteAppearance(productionFirst);
  const [productionFirstLink] = await getDb()
    .select({
      sourceId: appearanceSourceLinksTable.sourceId,
      evidenceKey: appearanceSourceLinksTable.evidenceKey,
    })
    .from(appearanceSourceLinksTable)
    .where(eq(appearanceSourceLinksTable.appearanceId, productionFirst.id));
  assert.ok(productionFirstLink);

  const markerUpdatedAt = new Date("2040-01-01T00:00:00.000Z");
  await getWriterDb()
    .update(appearanceSourceLinksTable)
    .set({ updatedAt: markerUpdatedAt })
    .where(
      and(
        eq(appearanceSourceLinksTable.appearanceId, productionFirst.id),
        eq(appearanceSourceLinksTable.sourceId, productionFirstLink.sourceId),
        eq(
          appearanceSourceLinksTable.evidenceKey,
          productionFirstLink.evidenceKey,
        ),
      ),
    );

  const firstStep = await runAppearanceBackfill({
    confirmDualWrite: true,
    maxAppearances: 1,
  });
  assert.deepEqual(firstStep, {
    processedThisRun: 1,
    linksInserted: 0,
    revisionsInserted: 0,
    completed: false,
  });
  const [preservedLink] = await getDb()
    .select({ updatedAt: appearanceSourceLinksTable.updatedAt })
    .from(appearanceSourceLinksTable)
    .where(eq(appearanceSourceLinksTable.appearanceId, productionFirst.id));
  assert.equal(
    preservedLink.updatedAt.getTime(),
    markerUpdatedAt.getTime(),
    "Backfill must not overwrite a dual-written link.",
  );

  const backfillFirst = sortedItems[1];
  let concurrentDualWrite: Promise<unknown> | null = null;
  const secondStep = await runAppearanceBackfill({
    confirmDualWrite: true,
    maxAppearances: 1,
    hooks: {
      afterAppearanceLocked: (appearanceId) => {
        assert.equal(appearanceId, backfillFirst.id);
        concurrentDualWrite = dualWriteAppearance(backfillFirst);
      },
    },
  });
  assert.deepEqual(secondStep, {
    processedThisRun: 1,
    linksInserted: 1,
    revisionsInserted: 1,
    completed: false,
  });
  assert.ok(concurrentDualWrite);
  await concurrentDualWrite;

  const [backfillFirstLinkCount] = await getDb()
    .select({ value: count() })
    .from(appearanceSourceLinksTable)
    .where(eq(appearanceSourceLinksTable.appearanceId, backfillFirst.id));
  assert.equal(backfillFirstLinkCount.value, 1);

  const partial = await runAppearanceBackfill({
    confirmDualWrite: true,
    maxAppearances: 5,
  });
  assert.equal(partial.processedThisRun, 5);
  assert.equal(partial.completed, false);
  const partialStatus = await getAppearanceBackfillStatus();
  assert.equal(partialStatus.checkpoint.processedCount, 7);
  assert.equal(partialStatus.checkpoint.lastAppearanceId, sortedItems[6].id);

  const completed = await runAppearanceBackfill({ confirmDualWrite: true });
  assert.equal(completed.processedThisRun, 113);
  assert.equal(completed.completed, true);

  const status = await getAppearanceBackfillStatus();
  assert.equal(status.appearances, 120);
  assert.equal(status.visibilityPending, 0);
  assert.equal(status.missingLinks, 0);
  assert.equal(status.initialRevisions, 120);
  assert.equal(status.checkpoint.processedCount, 120);
  assert.ok(status.checkpoint.completedAt);

  const [appearanceState] = await getDb()
    .select({
      publicCount: sql<number>`count(*) filter (where ${appearancesTable.visibilityStatus} = 'public')::int`,
      firstVisibleMatches: sql<number>`count(*) filter (where ${appearancesTable.firstVisibleAt} = ${appearancesTable.createdAt})::int`,
      visibilityChangedMatches: sql<number>`count(*) filter (where ${appearancesTable.visibilityChangedAt} = ${appearancesTable.createdAt})::int`,
      versionOneCount: sql<number>`count(*) filter (where ${appearancesTable.version} = 1)::int`,
    })
    .from(appearancesTable);
  assert.deepEqual(appearanceState, {
    publicCount: 120,
    firstVisibleMatches: 120,
    visibilityChangedMatches: 120,
    versionOneCount: 120,
  });

  const [linkState] = await getDb()
    .select({
      links: count(),
      activePrimary: sql<number>`count(*) filter (where ${appearanceSourceLinksTable.active} and ${appearanceSourceLinksTable.isPrimary})::int`,
      nullEvidence: sql<number>`count(*) filter (where ${appearanceSourceLinksTable.evidenceKey} is null)::int`,
      emptyEvidence: sql<number>`count(*) filter (where ${appearanceSourceLinksTable.evidenceKey} = '')::int`,
    })
    .from(appearanceSourceLinksTable);
  assert.deepEqual(linkState, {
    links: 120,
    activePrimary: 120,
    nullEvidence: 0,
    emptyEvidence: 0,
  });

  const invariants = await getWriterDb().execute<{
    duplicate_identities: number;
    multiple_canonical_sources: number;
    legacy_mismatches: number;
    phase1c_indexes: number;
    phase1c_triggers: number;
  }>(sql`
    select
      (select count(*)::int from (
        select source_name, external_item_id
        from source_identities
        group by source_name, external_item_id
        having count(*) > 1
      ) duplicates) as duplicate_identities,
      (select count(*)::int from (
        select source_id
        from source_identities
        where is_canonical
        group by source_id
        having count(*) > 1
      ) duplicates) as multiple_canonical_sources,
      (select count(*)::int
        from appearances a
        join appearance_source_links l
          on l.appearance_id = a.id and l.active and l.is_primary
        join source_items s on s.id = l.source_id
        join source_identities i on i.id = l.source_identity_id
        where a.source_name is distinct from i.source_name
          or a.source_item_id is distinct from i.external_item_id
          or a.source_url is distinct from s.canonical_url
          or a.published_at is distinct from l.published_at
          or a.published_on is distinct from l.published_on
          or a.published_at_precision is distinct from l.published_at_precision
      ) as legacy_mismatches,
      (select count(*)::int from pg_indexes
        where tablename = 'appearance_source_links'
          and indexdef ilike '%where%is_primary%') as phase1c_indexes,
      (select count(*)::int from pg_trigger
        where not tgisinternal
          and tgrelid in ('appearances'::regclass, 'appearance_source_links'::regclass)) as phase1c_triggers
  `);
  assert.deepEqual(invariants.rows[0], {
    duplicate_identities: 0,
    multiple_canonical_sources: 0,
    legacy_mismatches: 0,
    phase1c_indexes: 0,
    phase1c_triggers: 0,
  });

  const revisions = await getDb()
    .select({
      appearanceId: appearanceRevisionsTable.appearanceId,
      version: appearanceRevisionsTable.version,
      snapshotSchemaVersion: appearanceRevisionsTable.snapshotSchemaVersion,
      snapshot: appearanceRevisionsTable.snapshot,
    })
    .from(appearanceRevisionsTable)
    .where(eq(appearanceRevisionsTable.version, 1));
  assert.equal(revisions.length, 120);
  assert.ok(
    revisions.every(
      (revision) =>
        revision.version === 1 &&
        revision.snapshotSchemaVersion === appearanceSnapshotSchemaVersion,
    ),
  );
  const decoded = decodeAppearanceRevisionSnapshot(
    revisions[0].snapshotSchemaVersion,
    revisions[0].snapshot,
  );
  assert.equal(decoded.appearance.id, revisions[0].appearanceId);
  assert.equal(decoded.visibility.version, 1);
  assert.ok(decoded.sourceLinks.length >= 1);
  assert.throws(
    () => decodeAppearanceRevisionSnapshot(999, revisions[0].snapshot),
    /Unsupported appearance revision snapshot schema version/,
  );

  const appearances = await getDb()
    .select({
      id: appearancesTable.id,
      startsAt: appearancesTable.startsAt,
      title: appearancesTable.title,
      seriesId: appearancesTable.seriesId,
      eventGroupId: appearancesTable.eventGroupId,
      eventTitle: appearancesTable.eventTitle,
      sessionLabel: appearancesTable.sessionLabel,
      category: appearancesTable.category,
      sourceUrl: appearancesTable.sourceUrl,
      publishedAt: appearancesTable.publishedAt,
      publishedOn: appearancesTable.publishedOn,
      publishedAtPrecision: appearancesTable.publishedAtPrecision,
      collectedAt: appearancesTable.collectedAt,
    })
    .from(appearancesTable);
  assert.equal(
    buildAppearanceCards(
      appearances.map((appearance) => ({
        ...appearance,
        startsAt: appearance.startsAt.toISOString(),
        seriesName: null,
        publishedAt: appearance.publishedAt?.toISOString() ?? null,
        collectedAt: appearance.collectedAt.toISOString(),
      })),
    ).length,
    97,
  );

  const countsBeforeRerun = await rowCounts();
  const rerun = await runAppearanceBackfill({
    confirmDualWrite: true,
    restart: true,
  });
  assert.deepEqual(rerun, {
    processedThisRun: 120,
    linksInserted: 0,
    revisionsInserted: 0,
    completed: true,
  });
  assert.deepEqual(await rowCounts(), countsBeforeRerun);

  const [unlinked] = await getDb()
    .select({ value: count() })
    .from(appearancesTable)
    .where(
      notExists(
        getDb()
          .select({ appearanceId: appearanceSourceLinksTable.appearanceId })
          .from(appearanceSourceLinksTable)
          .where(eq(appearanceSourceLinksTable.appearanceId, appearancesTable.id))
          .limit(1),
      ),
    );
  assert.equal(unlinked.value, 0);

  const [unexpectedVersions] = await getDb()
    .select({ value: count() })
    .from(appearanceRevisionsTable)
    .where(ne(appearanceRevisionsTable.snapshotSchemaVersion, 1));
  assert.equal(unexpectedVersions.value, 0);

  const [checkpoint] = await getDb()
    .select()
    .from(appearanceBackfillCheckpointsTable)
    .where(eq(appearanceBackfillCheckpointsTable.id, "phase-1b"));
  assert.equal(checkpoint.processedCount, 120);
  assert.ok(checkpoint.completedAt);

  console.log(
    "Verified Phase 1B backfill / resume / rerun / 120 appearances / 97 cards / dual-write-first / backfill-first / snapshot schema v1 / no Phase 1C constraints.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeWriterDb);
