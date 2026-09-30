import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  AdminWriteValidationError,
  parseAdminWriteInput,
  type AdminSourceInput,
  type AdminSourceMutationInput,
} from "../src/server/admin/write-input";
import type { AdminWriteResult } from "../src/server/admin/write-service";
import { canonicalizeSourceUrl } from "../src/server/appearances/source-foundation";

export type PublicationImportOptions = {
  apply: boolean;
  inputPath?: string;
  reviewedHash?: string;
};

export type PublicationSourceSnapshot = {
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

export type PublicationAppearanceSnapshot = {
  id: string;
  title: string;
  category: string;
  version: number;
  visibilityStatus: string;
  publication: {
    precision: "exact" | "date" | "unknown";
    publishedAt: string | null;
    publishedOn: string | null;
  };
  sourceLinks: PublicationSourceSnapshot[];
};

type OperationDependencies = {
  readAppearance: (appearanceId: string) => Promise<PublicationAppearanceSnapshot | null>;
  hasReplay: (idempotencyKey: string) => Promise<boolean>;
  validatePreview: (input: AdminSourceMutationInput) => Promise<unknown>;
  confirm: (input: AdminSourceMutationInput, key: string) => Promise<AdminWriteResult>;
  log: (value: string) => void;
};

export function parsePublicationImportArgs(args: readonly string[]): PublicationImportOptions {
  const options: PublicationImportOptions = { apply: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!["--apply", "--input", "--reviewed-hash"].includes(argument)) {
      throw new AdminWriteValidationError("Unknown publication import argument.");
    }
    if (seen.has(argument)) {
      throw new AdminWriteValidationError(`Duplicate argument: ${argument}`);
    }
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
  if (!options.inputPath) {
    throw new AdminWriteValidationError("--input is required.");
  }
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

export async function readPublicationOperationFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new AdminWriteValidationError(
      "Cannot read publication input JSON. Check the file and JSON syntax.",
    );
  }
}

export function normalizePublicationOperation(value: unknown): AdminSourceMutationInput {
  const input = parseAdminWriteInput(value);
  if (input.kind !== "source") {
    throw new AdminWriteValidationError("Publication input must have kind: source.");
  }
  if (input.targets.length !== 1) {
    throw new AdminWriteValidationError("Publication input must target exactly one appearance.");
  }
  if (input.operation !== "primary") {
    const source = input.source as AdminSourceInput;
    const url = new URL(source.canonicalUrl);
    if (url.username || url.password) {
      throw new AdminWriteValidationError("Publication source URL must not contain credentials.");
    }
    if (
      source.precision !== "exact" &&
      source.precision !== "date" &&
      input.operation !== "append"
    ) {
      throw new AdminWriteValidationError(
        "A replacement publication source must improve precision to exact or date.",
      );
    }
  }
  return input;
}

export function publicationOperationHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizePublicationOperation(value)))
    .digest("hex");
}

function selectedPrimary(
  input: AdminSourceMutationInput,
  current: PublicationAppearanceSnapshot,
): PublicationSourceSnapshot {
  const source = input.source as { sourceId: string; evidenceKey: string };
  const selected = current.sourceLinks.find(
    (link) =>
      link.active &&
      link.sourceId === source.sourceId &&
      link.evidenceKey === source.evidenceKey,
  );
  if (!selected) {
    throw new AdminWriteValidationError("Selected active source link was not found.");
  }
  if (selected.precision === "unknown") {
    throw new AdminWriteValidationError(
      "An unknown publication source cannot be selected as primary.",
    );
  }
  return selected;
}

function assertPublicationOperationState(
  input: AdminSourceMutationInput,
  current: PublicationAppearanceSnapshot,
) {
  if (input.operation === "primary") {
    selectedPrimary(input, current);
    return;
  }
  const source = input.source as AdminSourceInput;
  if (input.operation === "append" && current.sourceLinks.some((link) =>
    link.active && link.isPrimary && link.evidenceKey === source.evidenceKey &&
    canonicalizeSourceUrl(link.canonicalUrl) === canonicalizeSourceUrl(source.canonicalUrl),
  )) {
    throw new AdminWriteValidationError(
      "An active primary source cannot be appended again. Use replace to update its publication.",
    );
  }
  if (input.operation === "append" && source.precision === "unknown") {
    const primary = current.sourceLinks.find((link) => link.active && link.isPrimary);
    if (!primary || (primary.precision !== "exact" && primary.precision !== "date")) {
      throw new AdminWriteValidationError(
        "An unknown secondary source can be appended only when the active primary publication is exact or date.",
      );
    }
  }
}

function sourceFromInput(source: AdminSourceInput): PublicationSourceSnapshot {
  const sourceId = `src_${createHash("sha256")
    .update(canonicalizeSourceUrl(source.canonicalUrl))
    .digest("hex")
    .slice(0, 32)}`;
  return {
    sourceId,
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

function previewAfter(
  input: AdminSourceMutationInput,
  current: PublicationAppearanceSnapshot,
): PublicationAppearanceSnapshot {
  const next = structuredClone(current);
  next.version += 1;
  if (input.operation === "primary") {
    const selected = selectedPrimary(input, current);
    next.sourceLinks = next.sourceLinks.map((link) => ({
      ...link,
      isPrimary:
        link.active &&
        link.sourceId === selected.sourceId &&
        link.evidenceKey === selected.evidenceKey,
    }));
    next.publication = {
      precision: selected.precision,
      publishedAt: selected.publishedAt,
      publishedOn: selected.publishedOn,
    };
    return next;
  }

  const source = sourceFromInput(input.source as AdminSourceInput);
  if (input.operation === "replace") {
    const existingIndex = next.sourceLinks.findIndex(
      (link) => link.sourceId === source.sourceId && link.evidenceKey === source.evidenceKey,
    );
    next.sourceLinks = next.sourceLinks.map((link) => ({
      ...link,
      active: false,
      isPrimary: false,
    }));
    if (existingIndex === -1) next.sourceLinks.push({ ...source, isPrimary: true });
    else next.sourceLinks[existingIndex] = { ...source, isPrimary: true };
    next.publication = {
      precision: source.precision,
      publishedAt: source.publishedAt,
      publishedOn: source.publishedOn,
    };
  } else {
    const existingIndex = next.sourceLinks.findIndex(
      (link) => link.sourceId === source.sourceId && link.evidenceKey === source.evidenceKey,
    );
    if (existingIndex === -1) next.sourceLinks.push(source);
    else next.sourceLinks[existingIndex] = source;
  }
  return next;
}

/** Publication-only adapter; all business validation and writes stay in Admin write. */
export async function runPublicationOperation(
  value: unknown,
  options: Pick<PublicationImportOptions, "apply" | "reviewedHash">,
  dependencies: OperationDependencies,
) {
  const input = normalizePublicationOperation(value);
  const hash = publicationOperationHash(input);
  const appearanceId = input.targets[0].appearanceId;

  if (options.apply) {
    if (options.reviewedHash !== hash) {
      throw new AdminWriteValidationError(
        "Reviewed hash does not match normalized input. Run and review dry-run again.",
      );
    }
    const key = `publication-source-${hash.slice(0, 40)}`;
    // A completed Admin write must remain replayable even if a later source
    // operation made the originally selected link inactive. For the first
    // primary/append apply, retain the source-state guards before confirm.
    const requiresCurrentState = input.operation === "primary" || input.operation === "append";
    if (requiresCurrentState && !(await dependencies.hasReplay(key))) {
      const current = await dependencies.readAppearance(appearanceId);
      if (!current) {
        throw new AdminWriteValidationError("Target appearance was not found.");
      }
      assertPublicationOperationState(input, current);
    }
    const result = await dependencies.confirm(input, key);
    dependencies.log(JSON.stringify({ mode: "apply", inputHash: hash, ...result }, null, 2));
    if (result.status !== "approved") {
      throw new AdminWriteValidationError(
        `Publication operation ${result.status}: ${result.message}`,
      );
    }
    return result;
  }

  const current = await dependencies.readAppearance(appearanceId);
  if (!current) {
    throw new AdminWriteValidationError("Target appearance was not found.");
  }
  assertPublicationOperationState(input, current);
  await dependencies.validatePreview(input);
  dependencies.log(
    JSON.stringify(
      {
        mode: "dry-run",
        operation: input.operation,
        appearanceId,
        currentVersion: current.version,
        expectedVersion: input.targets[0].expectedVersion,
        before: current,
        after: previewAfter(input, current),
        normalizedInput: input,
        inputHash: hash,
      },
      null,
      2,
    ),
  );
}
