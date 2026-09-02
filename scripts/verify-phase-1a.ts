import assert from "node:assert/strict";

import { and, count, eq, inArray, like, sql } from "drizzle-orm";

import { closeWriterDb, getDb, getWriterDb } from "../src/db/client";
import {
  appearanceSeriesTable,
  appearanceSourceLinksTable,
  appearancesTable,
  contentManagementStateTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "../src/db/schema";
import type { Appearance, AppearanceImportItem } from "../src/domain/appearance";
import { buildAppearanceCards } from "../src/lib/appearances";
import {
  assertBootstrapImportIsAllowed,
  canonicalizeSourceUrl,
  deriveEvidenceKey,
  dualWriteAppearance,
} from "../src/server/appearances/source-foundation";
import { applyAppearanceImport } from "../src/server/appearances/import-service";
import { publicAppearanceCondition } from "../src/server/appearances/visibility";

const testPrefix = "__phase1a_test__";
const testUrlPrefix = "https://www.raccoon-dog.co.jp/talent/__phase1a_test__";
const testAppearanceIds = [
  `${testPrefix}day1`,
  `${testPrefix}day2`,
  `${testPrefix}rollback`,
];

function hasPostgresErrorCode(error: unknown, expectedCode: string) {
  let current = error;

  while (current && typeof current === "object") {
    if ("code" in current && current.code === expectedCode) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }

  return false;
}

function fixture(
  id: string,
  sourceUrl: string,
  sourceItemId: string,
  sessionLabel: string | null,
): AppearanceImportItem {
  return {
    id,
    startsAt: "2030-01-01T18:00:00+09:00",
    title: sessionLabel === null ? "Phase 1A transaction test" : `Test ${sessionLabel}`,
    seriesId: null,
    eventGroupId: sessionLabel === null ? null : `${testPrefix}event`,
    eventTitle: sessionLabel === null ? null : "Phase 1A event",
    sessionLabel,
    category: "イベント",
    sourceUrl,
    publishedAt: null,
    publishedOn: "2029-12-01",
    publishedAtPrecision: "date",
    sourceName: "official:raccoon-dog",
    sourceItemId,
  };
}

async function cleanup() {
  const writer = getWriterDb();
  await writer.delete(appearancesTable).where(inArray(appearancesTable.id, testAppearanceIds));

  const sources = await writer
    .select({ id: sourceItemsTable.id })
    .from(sourceItemsTable)
    .where(like(sourceItemsTable.canonicalUrl, `${testUrlPrefix}%`));
  const sourceIds = sources.map((source) => source.id);

  if (sourceIds.length > 0) {
    await writer
      .delete(sourceIdentitiesTable)
      .where(inArray(sourceIdentitiesTable.sourceId, sourceIds));
    await writer.delete(sourceItemsTable).where(inArray(sourceItemsTable.id, sourceIds));
  }
}

async function readPublishedAppearances() {
  const rows = await getDb()
    .select({
      id: appearancesTable.id,
      startsAt: appearancesTable.startsAt,
      title: appearancesTable.title,
      seriesId: appearancesTable.seriesId,
      seriesName: appearanceSeriesTable.displayName,
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
    .from(appearancesTable)
    .leftJoin(
      appearanceSeriesTable,
      eq(appearancesTable.seriesId, appearanceSeriesTable.id),
    )
    .where(publicAppearanceCondition);

  return rows.map(
    (row): Appearance => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      collectedAt: row.collectedAt.toISOString(),
    }),
  );
}

async function main() {
  assert.equal(
    process.env.PHASE_1A_TEST_DATABASE,
    "1",
    "Refusing to run write tests without PHASE_1A_TEST_DATABASE=1.",
  );

  assert.equal(
    canonicalizeSourceUrl(`${testUrlPrefix}/shared/#fragment`),
    `${testUrlPrefix}/shared/`,
  );
  assert.equal(
    deriveEvidenceKey(
      fixture("evidence-day", `${testUrlPrefix}/evidence-day`, "event:day2", "DAY2"),
    ),
    "day2",
  );
  assert.equal(
    deriveEvidenceKey({
      ...fixture(
        "evidence-episode",
        `${testUrlPrefix}/evidence-episode`,
        "episode:35",
        null,
      ),
      title: "番組 第35回",
    }),
    "episode-35",
  );
  assert.equal(
    deriveEvidenceKey(
      fixture("evidence-default", `${testUrlPrefix}/evidence-default`, "default", null),
    ),
    "default",
  );
  assert.equal(
    deriveEvidenceKey(
      fixture(
        "evidence-alias",
        `${testUrlPrefix}/evidence-alias`,
        "legacy:part2",
        null,
      ),
    ),
    "part-2",
  );

  await cleanup();

  const [{ appearanceCount }] = await getDb()
    .select({ appearanceCount: count() })
    .from(appearancesTable);
  const [{ nullVisibilityCount }] = await getDb()
    .select({ nullVisibilityCount: count() })
    .from(appearancesTable)
    .where(sql`${appearancesTable.visibilityStatus} is null`);
  const [{ seriesCount }] = await getDb()
    .select({ seriesCount: count() })
    .from(appearanceSeriesTable);
  const [{ sourceCount }] = await getDb()
    .select({ sourceCount: count() })
    .from(sourceItemsTable);
  const [{ linkCount }] = await getDb()
    .select({ linkCount: count() })
    .from(appearanceSourceLinksTable);

  assert.equal(appearanceCount, 120);
  assert.equal(nullVisibilityCount, 120, "Expand migration must not backfill visibility.");
  assert.equal(seriesCount, 31);
  assert.equal(sourceCount, 0, "Expand migration must not backfill sources.");
  assert.equal(linkCount, 0, "Expand migration must not backfill links.");

  const before = await readPublishedAppearances();
  assert.equal(before.length, 120, "NULL visibility must remain publicly visible.");
  assert.equal(buildAppearanceCards(before).length, 97);

  const migrationShape = await getWriterDb().execute<{
    active_primary_indexes: number;
    mirror_triggers: number;
  }>(sql`
    select
      (select count(*)::int from pg_indexes
        where tablename = 'appearance_source_links'
          and indexdef ilike '%where%is_primary%') as active_primary_indexes,
      (select count(*)::int from pg_trigger
        where not tgisinternal
          and tgrelid in ('appearances'::regclass, 'appearance_source_links'::regclass)) as mirror_triggers
  `);
  assert.equal(migrationShape.rows[0].active_primary_indexes, 0);
  assert.equal(migrationShape.rows[0].mirror_triggers, 0);

  const sharedUrl = `${testUrlPrefix}/shared/`;
  const day1 = fixture(
    `${testPrefix}day1`,
    sharedUrl,
    `${testPrefix}shared:day1`,
    "DAY1",
  );
  const day2 = fixture(
    `${testPrefix}day2`,
    sharedUrl,
    `${testPrefix}shared:day2`,
    "DAY2",
  );

  try {
    await Promise.all([
      applyAppearanceImport([day1], {
        items: [
          {
            id: day1.id,
            sourceName: day1.sourceName,
            sourceItemId: day1.sourceItemId,
            status: "insert",
          },
        ],
        counts: { insert: 1, update: 0, unchanged: 0 },
      }),
      applyAppearanceImport([day2], {
        items: [
          {
            id: day2.id,
            sourceName: day2.sourceName,
            sourceItemId: day2.sourceItemId,
            status: "insert",
          },
        ],
        counts: { insert: 1, update: 0, unchanged: 0 },
      }),
      applyAppearanceImport([day1], {
        items: [
          {
            id: day1.id,
            sourceName: day1.sourceName,
            sourceItemId: day1.sourceItemId,
            status: "insert",
          },
        ],
        counts: { insert: 1, update: 0, unchanged: 0 },
      }),
    ]);

    const [sharedSource] = await getDb()
      .select({ id: sourceItemsTable.id })
      .from(sourceItemsTable)
      .where(eq(sourceItemsTable.canonicalUrl, canonicalizeSourceUrl(sharedUrl)));
    assert.ok(sharedSource);

    const [canonicalCount] = await getDb()
      .select({ value: count() })
      .from(sourceIdentitiesTable)
      .where(
        and(
          eq(sourceIdentitiesTable.sourceId, sharedSource.id),
          eq(sourceIdentitiesTable.isCanonical, true),
        ),
      );
    assert.equal(canonicalCount.value, 1);

    const links = await getDb()
      .select({
        appearanceId: appearanceSourceLinksTable.appearanceId,
        evidenceKey: appearanceSourceLinksTable.evidenceKey,
        active: appearanceSourceLinksTable.active,
        isPrimary: appearanceSourceLinksTable.isPrimary,
        legacySourceName: appearancesTable.sourceName,
        legacySourceItemId: appearancesTable.sourceItemId,
        legacySourceUrl: appearancesTable.sourceUrl,
        identitySourceName: sourceIdentitiesTable.sourceName,
        identityExternalItemId: sourceIdentitiesTable.externalItemId,
        canonicalUrl: sourceItemsTable.canonicalUrl,
      })
      .from(appearanceSourceLinksTable)
      .innerJoin(
        appearancesTable,
        eq(appearanceSourceLinksTable.appearanceId, appearancesTable.id),
      )
      .innerJoin(
        sourceIdentitiesTable,
        eq(appearanceSourceLinksTable.sourceIdentityId, sourceIdentitiesTable.id),
      )
      .innerJoin(
        sourceItemsTable,
        eq(appearanceSourceLinksTable.sourceId, sourceItemsTable.id),
      )
      .where(inArray(appearanceSourceLinksTable.appearanceId, [day1.id, day2.id]));

    assert.equal(links.length, 2, "Concurrent/idempotent writes must not duplicate links.");
    assert.deepEqual(
      new Set(links.map((link) => link.evidenceKey)),
      new Set(["day1", "day2"]),
    );
    assert.ok(links.every((link) => link.active && link.isPrimary));
    assert.ok(
      links.every(
        (link) =>
          link.legacySourceName === link.identitySourceName &&
          link.legacySourceItemId === link.identityExternalItemId &&
          canonicalizeSourceUrl(link.legacySourceUrl) === link.canonicalUrl,
      ),
      "Legacy mirrors must match the active primary alias and canonical source.",
    );

    await assert.rejects(
      getWriterDb().insert(sourceIdentitiesTable).values({
        id: `${testPrefix}second-canonical`,
        sourceId: sharedSource.id,
        sourceName: `${testPrefix}canonical`,
        externalItemId: "second",
        isCanonical: true,
      }),
      (error) => hasPostgresErrorCode(error, "23505"),
    );

    await assert.rejects(
      getWriterDb().insert(appearanceSourceLinksTable).values({
        appearanceId: day1.id,
        sourceId: sharedSource.id,
        evidenceKey: "",
      }),
      (error) => hasPostgresErrorCode(error, "23514"),
    );

    await getWriterDb()
      .update(appearancesTable)
      .set({ visibilityStatus: null })
      .where(eq(appearancesTable.id, day1.id));
    await getWriterDb()
      .update(appearancesTable)
      .set({ visibilityStatus: "hidden" })
      .where(eq(appearancesTable.id, day2.id));

    const visibleTestRows = await getDb()
      .select({ id: appearancesTable.id })
      .from(appearancesTable)
      .where(
        and(
          inArray(appearancesTable.id, [day1.id, day2.id]),
          publicAppearanceCondition,
        ),
      );
    assert.deepEqual(visibleTestRows.map((row) => row.id), [day1.id]);

    const rollbackUrl = `${testUrlPrefix}/rollback`;
    await assert.rejects(
      dualWriteAppearance({
        ...fixture(
          `${testPrefix}rollback`,
          rollbackUrl,
          `${testPrefix}rollback`,
          null,
        ),
        seriesId: `${testPrefix}missing-series`,
      }),
      (error) => hasPostgresErrorCode(error, "23503"),
    );
    const [rolledBackSources] = await getDb()
      .select({ value: count() })
      .from(sourceItemsTable)
      .where(eq(sourceItemsTable.canonicalUrl, canonicalizeSourceUrl(rollbackUrl)));
    assert.equal(rolledBackSources.value, 0, "A failed appearance write must be atomic.");
  } finally {
    await cleanup();
  }

  const lockedUrl = `${testUrlPrefix}/locked`;
  await getWriterDb()
    .update(contentManagementStateTable)
    .set({
      contentMode: "admin",
      adminActivatedAt: new Date(),
      legacyImportLockedAt: new Date(),
    })
    .where(eq(contentManagementStateTable.id, "singleton"));
  try {
    await assert.rejects(
      assertBootstrapImportIsAllowed(),
      /Legacy appearance import is locked/,
    );
    await assert.rejects(
      dualWriteAppearance(
        fixture(
          `${testPrefix}rollback`,
          lockedUrl,
          `${testPrefix}locked`,
          null,
        ),
      ),
      /Legacy appearance import is locked/,
    );
    const [lockedSourceCount] = await getDb()
      .select({ value: count() })
      .from(sourceItemsTable)
      .where(eq(sourceItemsTable.canonicalUrl, canonicalizeSourceUrl(lockedUrl)));
    assert.equal(lockedSourceCount.value, 0, "Locked import must fail before writing.");
  } finally {
    await getWriterDb()
      .update(contentManagementStateTable)
      .set({
        contentMode: "bootstrap",
        adminActivatedAt: null,
        legacyImportLockedAt: null,
      })
      .where(eq(contentManagementStateTable.id, "singleton"));
  }

  const after = await readPublishedAppearances();
  assert.equal(after.length, 120);
  assert.equal(buildAppearanceCards(after).length, 97);

  console.log(
    "Verified Phase 1A migration / 120 appearances / 97 cards / 31 series / NULL visibility compatibility / atomic dual-write / concurrent canonical identity creation.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeWriterDb);
