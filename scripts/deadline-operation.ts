import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  AdminWriteValidationError,
  parseAdminWriteInput,
  type AdminDeadlineMutationInput,
} from "../src/server/admin/write-input";
import type { AdminWriteResult } from "../src/server/admin/write-service";
import type { DeadlineAdminRecord } from "../src/server/deadlines/record-reader";

export type DeadlineImportOptions = {
  apply: boolean;
  inputPath?: string;
  reviewedHash?: string;
};

export function parseDeadlineImportArgs(args: readonly string[]): DeadlineImportOptions {
  const options: DeadlineImportOptions = { apply: false };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!["--apply", "--input", "--reviewed-hash"].includes(arg)) {
      throw new AdminWriteValidationError("Unknown deadline import argument.");
    }
    if (seen.has(arg)) throw new AdminWriteValidationError(`Duplicate argument: ${arg}`);
    seen.add(arg);
    if (arg === "--apply") options.apply = true;
    else {
      const value = args[++i];
      if (!value?.trim() || value.startsWith("--")) {
        throw new AdminWriteValidationError(`Missing value: ${arg}`);
      }
      if (arg === "--input") options.inputPath = value;
      else options.reviewedHash = value;
    }
  }
  if (options.reviewedHash && (!options.inputPath || !options.apply)) {
    throw new AdminWriteValidationError("--reviewed-hash requires --input and --apply.");
  }
  if (options.inputPath && options.apply && !options.reviewedHash) {
    throw new AdminWriteValidationError("JSON apply requires --reviewed-hash from the reviewed dry-run.");
  }
  if (options.reviewedHash && !/^[a-f0-9]{64}$/.test(options.reviewedHash)) {
    throw new AdminWriteValidationError("Invalid reviewed hash.");
  }
  return options;
}

export async function readDeadlineOperationFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    // Do not expose file contents or native parser/IO error details.
    throw new AdminWriteValidationError("Cannot read deadline input JSON. Check the file and JSON syntax.");
  }
}

export function normalizeDeadlineOperation(value: unknown): AdminDeadlineMutationInput {
  const input = parseAdminWriteInput(value);
  if (input.kind !== "deadline") {
    throw new AdminWriteValidationError("Deadline input must have kind: deadline.");
  }
  return input;
}

export function deadlineOperationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalizeDeadlineOperation(value))).digest("hex");
}

function snapshot(record: DeadlineAdminRecord) {
  return {
    fields: {
      id: record.id, label: record.label, projectTitle: record.projectTitle,
      organizer: record.organizer, projectType: record.projectType, seriesId: record.seriesId,
      deadlinePrecision: record.deadlinePrecision, deadlineAt: record.deadlineAt, deadlineOn: record.deadlineOn,
      applicationUrl: record.applicationUrl, note: record.note, state: record.state, appearanceIds: record.appearanceIds,
    },
    source: record.source,
    sourceUrls: record.sourceUrls,
    sourceEvidence: record.sourceEvidence,
    visibilityStatus: record.visibilityStatus,
  };
}

type OperationDependencies = {
  readRecords: () => Promise<DeadlineAdminRecord[]>;
  validatePreview: (input: AdminDeadlineMutationInput) => Promise<unknown>;
  confirm: (input: AdminDeadlineMutationInput, key: string) => Promise<AdminWriteResult>;
  log: (value: string) => void;
};

/** Deadline-only adapter; all business validation and writes stay in Admin write. */
export async function runDeadlineOperation(
  value: unknown,
  options: Pick<DeadlineImportOptions, "apply" | "reviewedHash">,
  dependencies: OperationDependencies,
) {
  const input = normalizeDeadlineOperation(value);
  const hash = deadlineOperationHash(input);
  if (options.apply) {
    if (options.reviewedHash !== hash) {
      throw new AdminWriteValidationError("Reviewed hash does not match normalized input. Run and review dry-run again.");
    }
    // Confirm revalidates under lock and checks replay first. Preflight validation
    // here would prevent retrying an approved operation with an old version.
    const result = await dependencies.confirm(input, `deadline-import-${hash.slice(0, 40)}`);
    dependencies.log(JSON.stringify({ mode: "apply", inputHash: hash, ...result }, null, 2));
    if (result.status !== "approved") {
      throw new AdminWriteValidationError(`Deadline operation ${result.status}: ${result.message}`);
    }
    return result;
  }

  const id = input.operation === "create" ? input.fields.id : input.deadlineId;
  const current = (await dependencies.readRecords()).find(record => record.id === id);
  await dependencies.validatePreview(input);
  const before = current ? snapshot(current) : null;
  const after = input.operation === "create" || input.operation === "update"
    ? {
      fields: input.fields, source: input.source, visibilityStatus: current?.visibilityStatus ?? "public",
      sourceUrls: [input.source.canonicalUrl],
      sourceEvidence: [{ canonicalUrl: input.source.canonicalUrl, evidenceKey: input.source.evidenceKey }],
    }
    : before && { ...before, visibilityStatus: input.operation === "hide" ? "hidden" : "public" };
  dependencies.log(JSON.stringify({
    mode: "dry-run", operation: input.operation, deadlineId: id,
    currentVersion: current?.version ?? null, expectedVersion: input.expectedVersion,
    before, after, normalizedInput: input, inputHash: hash,
  }, null, 2));
}
