import { and, count, eq, inArray, notInArray } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { appearancesTable } from "../src/db/schema";

const expectedSampleIds = [
  "sample-stream-autumn",
  "sample-radio-night",
  "sample-tv-feature",
  "sample-fan-event",
  "sample-summer-event",
  "sample-web-interview",
  "sample-radio-summer",
];
const confirmation = "--confirm=remove-sample-appearances";
const apply = process.argv.slice(2).includes("--apply");
const confirmed = process.argv.slice(2).includes(confirmation);

async function main() {
  const [sampleCount] = await getDb()
    .select({ value: count() })
    .from(appearancesTable)
    .where(eq(appearancesTable.sourceName, "sample"));
  const [unexpectedSampleCount] = await getDb()
    .select({ value: count() })
    .from(appearancesTable)
    .where(
      and(
        eq(appearancesTable.sourceName, "sample"),
        notInArray(appearancesTable.id, expectedSampleIds),
      ),
    );
  const [realCount] = await getDb()
    .select({ value: count() })
    .from(appearancesTable)
    .where(notInArray(appearancesTable.sourceName, ["sample"]));

  console.log(
    JSON.stringify({
      level: "info",
      message: apply ? "sample removal plan" : "sample removal dry-run",
      sampleCount: sampleCount.value,
      realCount: realCount.value,
    }),
  );

  if (unexpectedSampleCount.value > 0) {
    throw new Error("Unexpected sample rows exist; refusing to delete anything.");
  }

  if (realCount.value === 0) {
    throw new Error("No real appearance records exist; refusing to remove samples.");
  }

  if (!apply) {
    console.log(
      `Dry-run only. Re-run with --apply ${confirmation} to delete only the known sample rows.`,
    );
    return;
  }

  if (!confirmed) {
    throw new Error(`Applying sample removal requires ${confirmation}.`);
  }

  const removedRows = await getDb()
    .delete(appearancesTable)
    .where(
      and(
        eq(appearancesTable.sourceName, "sample"),
        inArray(appearancesTable.id, expectedSampleIds),
      ),
    )
    .returning({ id: appearancesTable.id });

  console.log(`Removed ${removedRows.length} known sample appearance records.`);
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "sample removal failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
