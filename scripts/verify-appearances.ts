import assert from "node:assert/strict";

import { asc, count, eq, inArray } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { appearancesTable } from "../src/db/schema";
import {
  validateAppearanceImportItems,
  type Appearance,
} from "../src/domain/appearance";
import {
  formatPublication,
  groupAppearances,
} from "../src/lib/appearances";
import { appearanceImportData } from "./appearance-import-data";

const allowSamples = process.argv.slice(2).includes("--allow-samples");

function fixture(
  id: string,
  publication: Pick<
    Appearance,
    "publishedAtPrecision" | "publishedAt" | "publishedOn" | "collectedAt"
  >,
): Appearance {
  return {
    id,
    startsAt: "2026-10-01T18:00:00+09:00",
    title: id,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
    category: "イベント",
    sourceUrl: "https://x.com/iidahikaroom/status/2056344052958638140",
    ...publication,
  };
}

async function main() {
  validateAppearanceImportItems(appearanceImportData);

  const rows = await getDb()
    .select({
      id: appearancesTable.id,
      startsAt: appearancesTable.startsAt,
      title: appearancesTable.title,
      eventGroupId: appearancesTable.eventGroupId,
      eventTitle: appearancesTable.eventTitle,
      sessionLabel: appearancesTable.sessionLabel,
      category: appearancesTable.category,
      sourceUrl: appearancesTable.sourceUrl,
      publishedAtPrecision: appearancesTable.publishedAtPrecision,
      publishedAt: appearancesTable.publishedAt,
      publishedOn: appearancesTable.publishedOn,
      sourceName: appearancesTable.sourceName,
      sourceItemId: appearancesTable.sourceItemId,
      collectedAt: appearancesTable.collectedAt,
      createdAt: appearancesTable.createdAt,
    })
    .from(appearancesTable)
    .where(
      inArray(
        appearancesTable.id,
        appearanceImportData.map((item) => item.id),
      ),
    )
    .orderBy(asc(appearancesTable.id));

  const actual = rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    title: row.title,
    eventGroupId: row.eventGroupId,
    eventTitle: row.eventTitle,
    sessionLabel: row.sessionLabel,
    category: row.category,
    sourceUrl: row.sourceUrl,
    publishedAtPrecision: row.publishedAtPrecision,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedOn: row.publishedOn,
    sourceName: row.sourceName,
    sourceItemId: row.sourceItemId,
  }));
  const expected = [...appearanceImportData]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      ...item,
      startsAt: new Date(item.startsAt).toISOString(),
      publishedAt:
        item.publishedAt === null ? null : new Date(item.publishedAt).toISOString(),
    }));

  assert.deepEqual(actual, expected);
  assert.ok(rows.every((row) => row.collectedAt !== null));
  assert.ok(rows.every((row) => row.createdAt !== null));
  assert.ok(
    rows.every(
      (row) => row.collectedAt!.getTime() === row.createdAt!.getTime(),
    ),
    "Existing records must retain their original first-collection time.",
  );
  assert.ok(
    rows.every(
      (row) =>
        row.publishedAtPrecision === "exact" &&
        row.publishedAt !== null &&
        row.publishedOn === null,
    ),
    "Existing records must migrate as exact publication timestamps.",
  );

  const [sampleRows] = await getDb()
    .select({ value: count() })
    .from(appearancesTable)
    .where(eq(appearancesTable.sourceName, "sample"));
  if (!allowSamples) {
    assert.equal(sampleRows.value, 0, "Sample appearance records still exist.");
  }

  const appearances: Appearance[] = rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    title: row.title,
    eventGroupId: row.eventGroupId,
    eventTitle: row.eventTitle,
    sessionLabel: row.sessionLabel,
    category: row.category,
    sourceUrl: row.sourceUrl,
    publishedAtPrecision: row.publishedAtPrecision,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedOn: row.publishedOn,
    collectedAt: row.collectedAt!.toISOString(),
  }));
  const grouped = groupAppearances(
    appearances,
    new Date("2026-09-01T00:00:00+09:00"),
  );

  assert.deepEqual(grouped.latest.map((item) => item.id), [
    "hagoromo6-geisho-ui-2",
    "hikaroom-birthday-party-2026",
  ]);
  assert.equal(grouped.upcoming.length, 1);
  assert.equal(grouped.past.length, 1);

  const sameDayFixtures = [
    fixture("unknown", {
      publishedAtPrecision: "unknown",
      publishedAt: null,
      publishedOn: null,
      collectedAt: "2026-08-10T09:00:00+09:00",
    }),
    fixture("date", {
      publishedAtPrecision: "date",
      publishedAt: null,
      publishedOn: "2026-08-10",
      collectedAt: "2026-08-10T08:00:00+09:00",
    }),
    fixture("exact", {
      publishedAtPrecision: "exact",
      publishedAt: "2026-08-10T07:00:00+09:00",
      publishedOn: null,
      collectedAt: "2026-08-10T07:01:00+09:00",
    }),
  ];
  const precisionGroups = groupAppearances(
    sameDayFixtures,
    new Date("2026-09-01T12:00:00+09:00"),
  );
  assert.deepEqual(precisionGroups.latest.map((item) => item.id), [
    "appearance:exact",
    "appearance:date",
    "appearance:unknown",
  ]);
  assert.equal(
    formatPublication(sameDayFixtures[1]),
    "2026年8月10日（日付のみ）",
  );
  assert.match(formatPublication(sameDayFixtures[0]), /^日時不明（サイト掲載 /);
  assert.doesNotMatch(formatPublication(sameDayFixtures[1]), /00:00/);

  const groupedFixtures: Appearance[] = [
    {
      ...fixture("day-two", {
        publishedAtPrecision: "date",
        publishedAt: null,
        publishedOn: "2026-08-10",
        collectedAt: "2026-08-10T10:00:00+09:00",
      }),
      startsAt: "2026-10-12T17:00:00+09:00",
      eventGroupId: "two-day-event",
      eventTitle: "連日イベント",
      sessionLabel: "DAY2",
    },
    {
      ...fixture("day-one", {
        publishedAtPrecision: "exact",
        publishedAt: "2026-08-10T18:00:00+09:00",
        publishedOn: null,
        collectedAt: "2026-08-10T18:01:00+09:00",
      }),
      startsAt: "2026-10-11T17:00:00+09:00",
      eventGroupId: "two-day-event",
      eventTitle: "連日イベント",
      sessionLabel: "DAY1",
    },
  ];
  const groupedFixtureCards = groupAppearances(
    groupedFixtures,
    new Date("2026-09-01T12:00:00+09:00"),
  );
  assert.equal(groupedFixtureCards.latest[0].publication.publishedAtPrecision, "exact");
  assert.deepEqual(
    groupedFixtureCards.upcoming[0].sessions.map((item) => item.sessionLabel),
    ["DAY1", "DAY2"],
  );

  console.log(
    `Verified ${rows.length} real records: ${grouped.latest.length} latest, ${grouped.upcoming.length} upcoming, ${grouped.past.length} past, ${sampleRows.value} samples.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
