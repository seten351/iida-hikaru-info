import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  AdminWriteValidationError,
  parseAdminWriteInput,
  type AdminAppearanceMutationInput,
  type AdminSourceInput,
} from "../src/server/admin/write-input";
import type { AdminWriteResult } from "../src/server/admin/write-service";
import { canonicalizeSourceUrl } from "../src/server/appearances/source-foundation";
import { emptyGuestInfo, sameGuestInfo } from "../src/domain/appearance-guests";
import type { AppearanceGuestInfo } from "../src/domain/appearance-guests";

export type AppearanceImportOptions = {
  apply: boolean;
  inputPath?: string;
  reviewedHash?: string;
};

export type AppearanceSourceSnapshot = {
  sourceId: string;
  evidenceKey: string;
  active: boolean;
  isPrimary: boolean;
  canonicalUrl: string;
  sourceName: string | null;
  externalItemId: string | null;
  precision: "exact" | "date" | "unknown";
  publishedAt: string | null;
  publishedOn: string | null;
};

export type AppearanceOperationSnapshot = {
  id: string;
  version: number;
  visibilityStatus: string;
  fields: Record<string, unknown>;
  guestInfo: AppearanceGuestInfo;
  publication: {
    precision: "exact" | "date" | "unknown";
    publishedAt: string | null;
    publishedOn: string | null;
  };
  sourceLinks: AppearanceSourceSnapshot[];
};

type OperationDependencies = {
  readAppearance: (appearanceId: string) => Promise<AppearanceOperationSnapshot | null>;
  validatePreview: (input: AdminAppearanceMutationInput) => Promise<unknown>;
  confirm: (input: AdminAppearanceMutationInput, key: string) => Promise<AdminWriteResult>;
  log: (value: string) => void;
};

export function parseAppearanceImportArgs(args: readonly string[]): AppearanceImportOptions {
  const options: AppearanceImportOptions = { apply: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!["--apply", "--input", "--reviewed-hash"].includes(argument)) {
      throw new AdminWriteValidationError("Unknown appearance import argument.");
    }
    if (seen.has(argument)) throw new AdminWriteValidationError(`Duplicate argument: ${argument}`);
    seen.add(argument);
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    const value = args[++index];
    if (!value?.trim() || value.startsWith("--")) {
      throw new AdminWriteValidationError(`Missing value: ${argument}`);
    }
    if (argument === "--input") options.inputPath = value;
    else options.reviewedHash = value;
  }
  if (!options.inputPath) throw new AdminWriteValidationError("--input is required.");
  if (options.reviewedHash && !options.apply) {
    throw new AdminWriteValidationError("--reviewed-hash requires --apply.");
  }
  if (options.apply && !options.reviewedHash) {
    throw new AdminWriteValidationError("--apply requires --reviewed-hash from the reviewed dry-run.");
  }
  if (options.reviewedHash && !/^[a-f0-9]{64}$/.test(options.reviewedHash)) {
    throw new AdminWriteValidationError("Invalid reviewed hash.");
  }
  return options;
}

export async function readAppearanceOperationFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new AdminWriteValidationError("Cannot read appearance input JSON. Check the file and JSON syntax.");
  }
}

export function normalizeAppearanceOperation(value: unknown): AdminAppearanceMutationInput {
  const input = parseAdminWriteInput(value);
  if (input.kind !== "appearance") {
    throw new AdminWriteValidationError("Appearance input must have kind: appearance.");
  }
  if (
    input.operation === "update" &&
    input.fields.guestInfo !== undefined &&
    input.evidenceSources?.length !== undefined &&
    input.evidenceSources.length === 0
  ) {
    throw new AdminWriteValidationError("Guest information changes require at least one evidence source.");
  }
  if (input.operation === "update" && input.fields.guestInfo !== undefined && !input.evidenceSources) {
    throw new AdminWriteValidationError("Guest information changes require evidenceSources.");
  }
  return input;
}

export function appearanceOperationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalizeAppearanceOperation(value))).digest("hex");
}

function sourceSnapshot(source: AdminSourceInput): AppearanceSourceSnapshot {
  return {
    sourceId: `src_${createHash("sha256").update(canonicalizeSourceUrl(source.canonicalUrl)).digest("hex").slice(0, 32)}`,
    evidenceKey: source.evidenceKey,
    active: true,
    isPrimary: false,
    canonicalUrl: source.canonicalUrl,
    sourceName: source.sourceName,
    externalItemId: source.externalItemId,
    precision: source.precision,
    publishedAt: source.publishedAt,
    publishedOn: source.publishedOn,
  };
}

function previewAfter(input: AdminAppearanceMutationInput, current: AppearanceOperationSnapshot | null) {
  if (input.operation === "hide" || input.operation === "restore") {
    if (!current) throw new AdminWriteValidationError("Target appearance was not found.");
    return {
      ...structuredClone(current),
      version: current.version + 1,
      visibilityStatus: input.operation === "hide" ? "hidden" : "public",
    };
  }
  if (input.operation !== "create" && input.operation !== "update") {
    throw new AdminWriteValidationError("Unsupported appearance operation.");
  }

  const base = current ? structuredClone(current) : null;
  const fields = input.fields;
  const requestedGuestInfo: AppearanceGuestInfo = "guestInfo" in fields && fields.guestInfo !== undefined
    ? fields.guestInfo
    : base?.guestInfo ?? emptyGuestInfo();
  const guestInfo = input.operation === "create" ? fields.guestInfo ?? emptyGuestInfo() : requestedGuestInfo;
  const guestInfoChanged = input.operation === "create" || !sameGuestInfo(
    guestInfo,
    base?.guestInfo,
  );
  const evidenceSources = input.operation === "update" && guestInfoChanged && "evidenceSources" in input
    ? input.evidenceSources ?? []
    : [];
  const sourceLinks = base?.sourceLinks ?? [];
  for (const evidence of evidenceSources) {
    const addition = sourceSnapshot(evidence);
    const existingIndex = sourceLinks.findIndex((link) =>
      canonicalizeSourceUrl(link.canonicalUrl) === canonicalizeSourceUrl(addition.canonicalUrl) && link.evidenceKey === addition.evidenceKey,
    );
    if (existingIndex === -1) sourceLinks.push(addition);
    else if (!sourceLinks[existingIndex].active) {
      sourceLinks[existingIndex] = {
        ...addition,
        sourceId: sourceLinks[existingIndex].sourceId,
        isPrimary: sourceLinks[existingIndex].isPrimary,
      };
    }
  }
  return {
    id: fields.id,
    version: (base?.version ?? 0) + 1,
    visibilityStatus: base?.visibilityStatus ?? "public",
    fields: { ...fields, guestInfo },
    guestInfo,
    publication: base?.publication ?? {
      precision: input.operation === "create" ? input.source.precision : "unknown",
      publishedAt: input.operation === "create" ? input.source.publishedAt : null,
      publishedOn: input.operation === "create" ? input.source.publishedOn : null,
    },
    sourceLinks: input.operation === "create"
      ? [{ ...sourceSnapshot(input.source), isPrimary: true }]
      : sourceLinks,
  };
}

/** Single-appearance operation adapter. Admin write remains the source of truth for validation and persistence. */
export async function runAppearanceOperation(
  value: unknown,
  options: Pick<AppearanceImportOptions, "apply" | "reviewedHash">,
  dependencies: OperationDependencies,
) {
  const input = normalizeAppearanceOperation(value);
  const hash = appearanceOperationHash(input);
  const appearanceId = input.operation === "create" ? input.fields.id : input.appearanceId;

  if (options.apply) {
    if (options.reviewedHash !== hash) {
      throw new AdminWriteValidationError("Reviewed hash does not match normalized input. Run and review dry-run again.");
    }
    // confirmAdminWrite checks idempotency before the expected version, so an approved
    // dry-run can be retried safely after an ambiguous connection failure.
    const result = await dependencies.confirm(input, `appearance-import-${hash.slice(0, 40)}`);
    dependencies.log(JSON.stringify({ mode: "apply", inputHash: hash, ...result }, null, 2));
    if (result.status !== "approved") {
      throw new AdminWriteValidationError(`Appearance operation ${result.status}: ${result.message}`);
    }
    return result;
  }

  const current = input.operation === "create" ? null : await dependencies.readAppearance(appearanceId);
  if (input.operation !== "create" && !current) {
    throw new AdminWriteValidationError("Target appearance was not found.");
  }
  await dependencies.validatePreview(input);
  dependencies.log(JSON.stringify({
    mode: "dry-run",
    operation: input.operation,
    appearanceId,
    currentVersion: current?.version ?? null,
    expectedVersion: input.expectedVersion,
    before: current,
    after: previewAfter(input, current),
    normalizedInput: input,
    inputHash: hash,
  }, null, 2));
}
