import {
  deadlineFingerprint,
  type AdminDeadlineFields,
} from "../src/domain/deadline";
import type { AdminSourceInput } from "../src/server/admin/write-input";
import type { DeadlineImportItem } from "./deadline-import-data";

export type ExistingDeadline = AdminDeadlineFields & {
  version: number;
  visibilityStatus: "public" | "hidden";
  source: AdminSourceInput;
  sourceEvidence?: Pick<AdminSourceInput, "canonicalUrl" | "evidenceKey">[];
};

export type DeadlineImportOperation =
  | { operation: "create"; item: DeadlineImportItem; expectedVersion: null }
  | { operation: "update"; item: DeadlineImportItem; deadlineId: string; expectedVersion: number }
  | { operation: "unchanged"; item: DeadlineImportItem }
  | { operation: "hidden"; item: DeadlineImportItem; deadlineId: string }
  | { operation: "duplicate"; item: DeadlineImportItem; deadlineId: string; reason: string };

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim();
  }
}

function sameSource(left: AdminSourceInput, right: AdminSourceInput) {
  return canonicalUrl(left.canonicalUrl) === canonicalUrl(right.canonicalUrl) &&
    left.sourceName.trim().toLowerCase() === right.sourceName.trim().toLowerCase() &&
    left.externalItemId.trim() === right.externalItemId.trim() &&
    left.evidenceKey.trim().toLowerCase() === right.evidenceKey.trim().toLowerCase() &&
    left.precision === right.precision && left.publishedAt === right.publishedAt && left.publishedOn === right.publishedOn;
}

function sameFields(left: AdminDeadlineFields, right: AdminDeadlineFields) {
  return left.id === right.id && left.label === right.label && left.projectTitle === right.projectTitle &&
    left.organizer === right.organizer && left.projectType === right.projectType && left.seriesId === right.seriesId &&
    left.deadlinePrecision === right.deadlinePrecision && left.deadlineAt === right.deadlineAt &&
    left.deadlineOn === right.deadlineOn && left.applicationUrl === right.applicationUrl && left.note === right.note &&
    left.state === right.state && [...left.appearanceIds].sort().join("\0") === [...right.appearanceIds].sort().join("\0");
}

function sameSourceEvidence(left: Pick<AdminSourceInput, "canonicalUrl" | "evidenceKey">, right: Pick<AdminSourceInput, "canonicalUrl" | "evidenceKey">) {
  return canonicalUrl(left.canonicalUrl) === canonicalUrl(right.canonicalUrl) &&
    left.evidenceKey.trim().toLowerCase() === right.evidenceKey.trim().toLowerCase();
}

/** Pure planner: no database access, writes, or hidden-record restoration. */
export function planDeadlineImport(items: readonly DeadlineImportItem[], existing: readonly ExistingDeadline[]): DeadlineImportOperation[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const plan: DeadlineImportOperation[] = items.map((item): DeadlineImportOperation => {
    const current = byId.get(item.fields.id);
    if (current) {
      if (current.visibilityStatus === "hidden") return { operation: "hidden", item, deadlineId: current.id };
      return sameFields(current, item.fields) && sameSource(current.source, item.source)
        ? { operation: "unchanged", item }
        : { operation: "update", item, deadlineId: current.id, expectedVersion: current.version };
    }

    return { operation: "create", item, expectedVersion: null };
  });

  // Check every planned create/update against all other stored identities before
  // returning any actionable plan. This also catches updates that would collide.
  for (let index = 0; index < plan.length; index += 1) {
    const entry = plan[index]!;
    if (entry.operation !== "create" && entry.operation !== "update") continue;
    for (const other of existing) {
      if (other.id === entry.item.fields.id) continue;
      if ((other.sourceEvidence ?? [other.source]).some(source => sameSourceEvidence(source, entry.item.source))) {
        plan[index] = { operation: "duplicate", item: entry.item, deadlineId: other.id, reason: "同じ情報元URLとevidenceKeyが登録済みです" };
        break;
      }
      if (deadlineFingerprint(other) === deadlineFingerprint(entry.item.fields)) {
        plan[index] = { operation: "duplicate", item: entry.item, deadlineId: other.id, reason: "同じ対象企画・受付段階・関連出演が登録済みです" };
        break;
      }
    }
  }

  // Detect conflicting entries in the import itself, including duplicate IDs.
  for (let index = 0; index < plan.length; index += 1) {
    const entry = plan[index]!;
    if (entry.operation === "duplicate") continue;
    for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
      const prior = items[priorIndex]!;
      const sameId = prior.fields.id === entry.item.fields.id;
      const sameFingerprint = deadlineFingerprint(prior.fields) === deadlineFingerprint(entry.item.fields);
      const sameEvidence = sameSourceEvidence(prior.source, entry.item.source);
      const identityCollision = prior.source.sourceName.trim().toLowerCase() === entry.item.source.sourceName.trim().toLowerCase() &&
        prior.source.externalItemId.trim() === entry.item.source.externalItemId.trim() &&
        canonicalUrl(prior.source.canonicalUrl) !== canonicalUrl(entry.item.source.canonicalUrl);
      if (sameId || sameFingerprint || sameEvidence || identityCollision) {
        const reason = sameId
          ? "同じ締切IDがimportデータ内で重複しています"
          : identityCollision
            ? "同じsource identityに異なる情報元URLがimportデータ内で指定されています"
            : sameEvidence
            ? "同じ情報元URLとevidenceKeyがimportデータ内で重複しています"
            : "同じ対象企画・受付段階・関連出演がimportデータ内で重複しています";
        plan[index] = { operation: "duplicate", item: entry.item, deadlineId: prior.fields.id, reason };
        break;
      }
    }
  }

  return plan;
}
