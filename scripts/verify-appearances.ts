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
    [
      "hagoromo6-geisho-ui-2-day",
      "hagoromo6-geisho-ui-2-night",
      "hikaroom-birthday-party-2026-day",
    ],
  );
  assert.equal(grouped.upcoming.length, 2);
  assert.equal(grouped.past.length, 2);

  console.log(
    `Verified ${rows.length} real records: ${grouped.latest.length} latest, ${grouped.upcoming.length} upcoming, ${grouped.past.length} past, ${sampleRows.value} samples.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
