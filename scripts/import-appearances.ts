import {
  applyAppearanceSeriesImport,
  applyAppearanceImport,
  planAppearanceSeriesImport,
  planAppearanceImport,
} from "../src/server/appearances/import-service";
import { closeWriterDb } from "../src/db/client";
import { assertBootstrapImportIsAllowed } from "../src/server/appearances/source-foundation";
import { appearanceImportData } from "./appearance-import-data";
import { appearanceSeriesData } from "./appearance-series-data";

const apply = process.argv.slice(2).includes("--apply");

async function main() {
  if (apply) {
    await assertBootstrapImportIsAllowed();
  }

  const seriesPlan = await planAppearanceSeriesImport(appearanceSeriesData);
  const plan = await planAppearanceImport(appearanceImportData, appearanceSeriesData);
  const cardCount = new Set(
    appearanceImportData.map(
      (item) => item.eventGroupId ?? `appearance:${item.id}`,
    ),
  ).size;

  console.log(
    JSON.stringify({
      level: "info",
      message: apply ? "appearance import plan" : "appearance import dry-run",
      mode: apply ? "apply" : "dry-run",
      records: appearanceImportData.length,
      cards: cardCount,
      series: {
        records: appearanceSeriesData.length,
        counts: seriesPlan.counts,
        items: seriesPlan.items,
      },
      counts: plan.counts,
      items: plan.items,
    }),
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write these changes.");
    return;
  }

  const appliedSeriesCount = await applyAppearanceSeriesImport(
    appearanceSeriesData,
    seriesPlan,
  );
  const appliedCount = await applyAppearanceImport(appearanceImportData, plan);
  console.log(
    `Applied ${appliedSeriesCount} series and ${appliedCount} appearance records.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "appearance import failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(closeWriterDb);
