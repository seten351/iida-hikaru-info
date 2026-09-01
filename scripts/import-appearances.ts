import {
  applyAppearanceImport,
  planAppearanceImport,
} from "../src/server/appearances/import-service";
import { appearanceImportData } from "./appearance-import-data";

const apply = process.argv.slice(2).includes("--apply");

async function main() {
  const plan = await planAppearanceImport(appearanceImportData);

  console.log(
    JSON.stringify({
      level: "info",
      message: apply ? "appearance import plan" : "appearance import dry-run",
      mode: apply ? "apply" : "dry-run",
      counts: plan.counts,
      items: plan.items,
    }),
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write these changes.");
    return;
  }

  const appliedCount = await applyAppearanceImport(appearanceImportData, plan);
  console.log(`Applied ${appliedCount} appearance records.`);
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "appearance import failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
