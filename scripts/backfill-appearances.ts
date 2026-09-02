import { closeWriterDb } from "../src/db/client";
import {
  getAppearanceBackfillStatus,
  phase1DualWriteConfirmation,
  runAppearanceBackfill,
} from "../src/server/appearances/backfill-service";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const restart = args.includes("--restart");
const confirmation = `--confirm=${phase1DualWriteConfirmation}`;
const confirmDualWrite = args.includes(confirmation);
const limitArgument = args.find((argument) => argument.startsWith("--limit="));
const maxAppearances = limitArgument
  ? Number.parseInt(limitArgument.slice("--limit=".length), 10)
  : undefined;

async function main() {
  const before = await getAppearanceBackfillStatus();
  console.log(
    JSON.stringify({
      level: "info",
      message: apply ? "Phase 1B backfill plan" : "Phase 1B backfill dry-run",
      mode: apply ? "apply" : "dry-run",
      restart,
      maxAppearances,
      status: before,
    }),
  );

  if (!apply) {
    console.log(
      `Dry-run only. Re-run with --apply ${confirmation} to backfill an isolated database.`,
    );
    return;
  }
  if (!confirmDualWrite) {
    throw new Error(`Applying Phase 1B requires ${confirmation}.`);
  }

  const result = await runAppearanceBackfill({
    confirmDualWrite,
    restart,
    maxAppearances,
  });
  const after = await getAppearanceBackfillStatus();
  console.log(
    JSON.stringify({
      level: "info",
      message: "Phase 1B backfill result",
      result,
      status: after,
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Phase 1B backfill failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(closeWriterDb);
