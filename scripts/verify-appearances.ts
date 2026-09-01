import assert from "node:assert/strict";

import { asc, count, eq, inArray } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { appearancesTable } from "../src/db/schema";
import {
  validateAppearanceImportItems,
  type Appearance,
} from "../src/domain/appearance";
import { groupAppearances } from "../src/lib/appearances";
import { appearanceImportData } from "./appearance-import-data";

const allowSamples = process.argv.slice(2).includes("--allow-samples");

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
      publishedAt: appearancesTable.publishedAt,
      sourceName: appearancesTable.sourceName,
      sourceItemId: appearancesTable.sourceItemId,
      collectedAt: appearancesTable.collectedAt,
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
    publishedAt: row.publishedAt.toISOString(),
    sourceName: row.sourceName,
    sourceItemId: row.sourceItemId,
  }));
  const expected = [...appearanceImportData]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      ...item,
      startsAt: new Date(item.startsAt).toISOString(),
      publishedAt: new Date(item.publishedAt).toISOString(),
    }));

  assert.deepEqual(actual, expected);
  assert.ok(rows.every((row) => row.collectedAt !== null));

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
    publishedAt: row.publishedAt.toISOString(),
  }));
  const grouped = groupAppearances(
    appearances,
    new Date("2026-09-01T00:00:00+09:00"),
  );

  assert.deepEqual(
    grouped.latest.map((item) => item.id),
    ["hagoromo6-geisho-ui-2", "hikaroom-birthday-party-2026"],
  );
  assert.equal(grouped.upcoming.length, 1);
  assert.equal(grouped.past.length, 1);
  assert.deepEqual(grouped.upcoming[0].sessions.map((item) => item.id), [
    "hagoromo6-geisho-ui-2-day",
    "hagoromo6-geisho-ui-2-night",
  ]);
  assert.deepEqual(grouped.past[0].sessions.map((item) => item.id), [
    "hikaroom-birthday-party-2026-day",
    "hikaroom-birthday-party-2026-night",
  ]);

  const groupingFixtures: Appearance[] = [
    {
      id: "day-two",
      startsAt: "2026-10-12T17:00:00+09:00",
      title: "連日イベント DAY2",
      eventGroupId: "two-day-event",
      eventTitle: "連日イベント",
      sessionLabel: "DAY2",
      category: "イベント",
      sourceUrl: "https://x.com/iidahikaroom/status/2056344052958638140",
      publishedAt: "2026-08-02T18:00:00+09:00",
    },
    {
      id: "day-one",
      startsAt: "2026-10-11T17:00:00+09:00",
      title: "連日イベント DAY1",
      eventGroupId: "two-day-event",
      eventTitle: "連日イベント",
      sessionLabel: "DAY1",
      category: "イベント",
      sourceUrl: "https://x.com/iidahikaroom/status/2056344052958638140",
      publishedAt: "2026-08-02T18:00:00+09:00",
    },
    {
      id: "morning",
      startsAt: "2026-09-01T10:00:00+09:00",
      title: "昼夜イベント 昼公演",
      eventGroupId: "day-night-event",
      eventTitle: "昼夜イベント",
      sessionLabel: "昼公演",
      category: "イベント",
      sourceUrl: "https://x.com/iidahikaroom/status/2056344052958638140",
      publishedAt: "2026-08-03T18:00:00+09:00",
    },
    {
      id: "night",
      startsAt: "2026-09-01T18:00:00+09:00",
      title: "昼夜イベント 夜公演",
      eventGroupId: "day-night-event",
      eventTitle: "昼夜イベント",
      sessionLabel: "夜公演",
      category: "イベント",
      sourceUrl: "https://x.com/hagoromo_6/status/2090725596485882355",
      publishedAt: "2026-08-04T18:00:00+09:00",
    },
    {
      id: "standalone",
      startsAt: "2026-09-02T12:00:00+09:00",
      title: "単独出演",
      eventGroupId: null,
      eventTitle: null,
      sessionLabel: null,
      category: "配信",
      sourceUrl: "https://x.com/iidahikaroom/status/2056344052958638140",
      publishedAt: "2026-08-05T18:00:00+09:00",
    },
    {
      id: "past-day-two",
      startsAt: "2026-08-31T18:00:00+09:00",
      title: "過去の連日イベント DAY2",
      eventGroupId: "past-two-day-event",
      eventTitle: "過去の連日イベント",
      sessionLabel: "DAY2",
      category: "イベント",
      sourceUrl: "https://x.com/iidahikaroom/status/2056344052958638140",
      publishedAt: "2026-08-01T18:00:00+09:00",
    },
    {
      id: "past-day-one",
      startsAt: "2026-08-30T18:00:00+09:00",
      title: "過去の連日イベント DAY1",
      eventGroupId: "past-two-day-event",
      eventTitle: "過去の連日イベント",
      sessionLabel: "DAY1",
      category: "イベント",
      sourceUrl: "https://x.com/iidahikaroom/status/2056344052958638140",
      publishedAt: "2026-08-01T18:00:00+09:00",
    },
    {
      id: "older-standalone",
      startsAt: "2026-08-29T18:00:00+09:00",
      title: "過去の単独出演",
      eventGroupId: null,
      eventTitle: null,
      sessionLabel: null,
      category: "配信",
      sourceUrl: "https://x.com/iidahikaroom/status/2056344052958638140",
      publishedAt: "2026-07-01T18:00:00+09:00",
    },
  ];
  const fixtureGroups = groupAppearances(
    groupingFixtures,
    new Date("2026-09-01T12:00:00+09:00"),
  );

  assert.deepEqual(fixtureGroups.upcoming.map((item) => item.id), [
    "day-night-event",
    "appearance:standalone",
    "two-day-event",
  ]);
  assert.deepEqual(fixtureGroups.past.map((item) => item.id), [
    "past-two-day-event",
    "appearance:older-standalone",
  ]);
  assert.deepEqual(
    fixtureGroups.upcoming[0].sessions.map((item) => item.sessionLabel),
    ["昼公演", "夜公演"],
  );
  assert.equal(fixtureGroups.upcoming[0].sourceUrls.length, 2);
  assert.deepEqual(
    fixtureGroups.upcoming[2].sessions.map((item) => item.sessionLabel),
    ["DAY1", "DAY2"],
  );
  assert.deepEqual(
    fixtureGroups.past[0].sessions.map((item) => item.sessionLabel),
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
