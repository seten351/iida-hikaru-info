import "server-only";
import { createHash } from "node:crypto";
import { closeWriterDb } from "../src/db/client";
import { deadlineImportData } from "./deadline-import-data";
import { planDeadlineImport } from "./deadline-import-plan";
import { AdminWriteValidationError, parseAdminWriteInput } from "../src/server/admin/write-input";
import { confirmAdminWrite, validateAdminWritePreview } from "../src/server/admin/write-service";
import { readDeadlineRecords } from "../src/server/deadlines/record-reader";
import { parseDeadlineImportArgs, readDeadlineOperationFile, runDeadlineOperation } from "./deadline-operation";

async function main() {
  try {
    const options = parseDeadlineImportArgs(process.argv.slice(2));
    const { apply } = options;
    if (options.inputPath) {
      await runDeadlineOperation(await readDeadlineOperationFile(options.inputPath), options, {
        readRecords: readDeadlineRecords,
        validatePreview: validateAdminWritePreview,
        confirm: confirmAdminWrite,
        log: console.log,
      });
      return;
    }

    const items = deadlineImportData.map((item) => {
      const parsed = parseAdminWriteInput({ kind: "deadline", operation: "create", expectedVersion: null, ...item });
      if (parsed.kind !== "deadline" || parsed.operation !== "create") {
        throw new AdminWriteValidationError(`Invalid deadline import item: ${item.fields.id}`);
      }
      return { fields: parsed.fields, source: parsed.source };
    });
    const existing = await readDeadlineRecords();
    const plan = planDeadlineImport(items, existing);

    console.log(
      `Deadline import ${apply ? "apply" : "dry-run"}: ${plan.filter((x) => x.operation === "create").length} create, ${plan.filter((x) => x.operation === "update").length} update, ${plan.filter((x) => x.operation === "unchanged").length} unchanged, ${plan.filter((x) => x.operation === "hidden").length} hidden, ${plan.filter((x) => x.operation === "duplicate").length} duplicate.`,
    );
    for (const entry of plan) {
      const id = entry.item.fields.id;
      if (entry.operation === "duplicate") {
        throw new AdminWriteValidationError(`[DUPLICATE REJECTED] ${id} matches ${entry.deadlineId}: ${entry.reason}`);
      }
      if (entry.operation === "hidden") {
        console.log(`SKIP hidden ${id} (explicit restore required)`);
      } else if (entry.operation === "unchanged") {
        console.log(`UNCHANGED ${id}`);
      } else {
        console.log(
          `${apply ? "APPLY" : "DRY-RUN"} ${entry.operation} ${id}${entry.operation === "update" ? ` [version ${entry.expectedVersion}]` : ""}`,
        );
      }
    }
    const validated = [];
    // Preview every mutation before any apply, including DB references and identity ownership.
    for (const entry of plan) {
      if (entry.operation !== "create" && entry.operation !== "update") continue;
      const input = entry.operation === "create"
        ? { kind: "deadline" as const, operation: "create" as const, expectedVersion: null, fields: entry.item.fields, source: entry.item.source }
        : { kind: "deadline" as const, operation: "update" as const, deadlineId: entry.deadlineId, expectedVersion: entry.expectedVersion, fields: entry.item.fields, source: entry.item.source };
      await validateAdminWritePreview(input);
      validated.push({ entry, input });
    }
    if (!apply) return;

    for (const { entry, input } of validated) {
      const key = `deadline-import-${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 40)}`;
      const result = await confirmAdminWrite(input, key);
      if (result.status !== "approved") throw new Error("Admin write was not approved.");
      console.log(`✔ ${entry.operation}d ${entry.item.fields.id}`);
    }
  } finally {
    await closeWriterDb();
  }
}

main().catch((error) => {
  if (error instanceof AdminWriteValidationError) {
    console.error("Deadline import failed:", error.message);
  } else {
    console.error("Deadline import failed due to an unexpected error. Database details are hidden.");
  }
  process.exitCode = 1;
});
