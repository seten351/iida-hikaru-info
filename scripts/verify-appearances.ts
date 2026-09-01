import assert from "node:assert/strict";

import { asc } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { appearancesTable } from "../src/db/schema";
import type { Appearance } from "../src/domain/appearance";
import { groupAppearances } from "../src/lib/appearances";
import { appearanceSeedData } from "./appearance-seed-data";

async function main() {
  const rows = await getDb()
    .select({
      id: appearancesTable.id,
      startsAt: appearancesTable.startsAt,
      title: appearancesTable.title,
      category: appearancesTable.category,
      sourceUrl: appearancesTable.sourceUrl,
      publishedAt: appearancesTable.publishedAt,
    })
    .from(appearancesTable)
    .orderBy(asc(appearancesTable.id));

  const actual: Appearance[] = rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    title: row.title,
    category: row.category,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt.toISOString(),
  }));

  const expected = [...appearanceSeedData]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      ...item,
      startsAt: new Date(item.startsAt).toISOString(),
      publishedAt: new Date(item.publishedAt).toISOString(),
    }));

  assert.deepEqual(actual, expected);

  const grouped = groupAppearances(
    actual,
    new Date("2026-09-01T00:00:00+09:00"),
  );

  assert.deepEqual(
    grouped.latest.map((item) => item.id),
    ["sample-stream-autumn", "sample-radio-night", "sample-tv-feature"],
  );
  assert.equal(grouped.upcoming.length, 4);
  assert.equal(grouped.past.length, 3);

  console.log(
    `Verified ${actual.length} records: ${grouped.latest.length} latest, ${grouped.upcoming.length} upcoming, ${grouped.past.length} past.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
