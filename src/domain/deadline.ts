import type { Appearance, AppearanceCategory } from "./appearance";

export const deadlinePrecisions = ["exact", "date", "unknown"] as const;
export const deadlineStates = ["scheduled", "closed", "cancelled"] as const;
export const deadlineProjectTypes = ["official", "fan"] as const;

export type AdminDeadlineFields = {
  id: string;
  label: string;
  projectTitle: string;
  organizer: string;
  projectType: (typeof deadlineProjectTypes)[number];
  seriesId: string | null;
  deadlinePrecision: (typeof deadlinePrecisions)[number];
  deadlineAt: string | null;
  deadlineOn: string | null;
  applicationUrl: string | null;
  note: string | null;
  state: (typeof deadlineStates)[number];
  appearanceIds: string[];
};

export type DeadlineTarget = Pick<Appearance,
  "id" | "title" | "eventTitle" | "sessionLabel" | "category" | "seriesId" |
  "seriesName" | "startsAtPrecision" | "startsAt" | "startsOn"
>;

export type Deadline = AdminDeadlineFields & {
  seriesName: string | null;
  category: AppearanceCategory;
  targets: DeadlineTarget[];
  sourceUrls: string[];
  publication: Pick<Appearance, "publishedAtPrecision" | "publishedAt" | "publishedOn" | "collectedAt">;
};

export function normalizeDeadlineText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s\p{P}\p{S}]/gu, "");
}

/** Dates are deliberately absent: extending the same application keeps its identity. */
export function deadlineFingerprint(fields: AdminDeadlineFields) {
  return JSON.stringify([
    fields.appearanceIds.length ? [...fields.appearanceIds].sort() : normalizeDeadlineText(fields.projectTitle),
    normalizeDeadlineText(fields.label),
  ]);
}

function text(value: unknown, label: string, max: number, nullable = false): string | null {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${label}を確認してください。`);
  }
  return value.trim();
}

export function validateDeadlineFields(value: unknown): AdminDeadlineFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("締切情報が不正です。");
  const input = value as Record<string, unknown>;
  const id = text(input.id, "締切ID", 200)!;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("締切IDは小文字英数字と単一ハイフンで指定してください。");
  const precision = input.deadlinePrecision as AdminDeadlineFields["deadlinePrecision"];
  if (!deadlinePrecisions.includes(precision)) throw new Error("締切日時の精度が不正です。");
  const deadlineAt = text(input.deadlineAt, "締切日時", 100, true);
  const deadlineOn = text(input.deadlineOn, "締切日", 10, true);
  if (precision === "exact") {
    if (!deadlineAt || deadlineOn || !/(?:Z|[+-]\d{2}:\d{2})$/.test(deadlineAt) || Number.isNaN(Date.parse(deadlineAt))) {
      throw new Error("正確な締切にはタイムゾーン付き日時だけを指定してください。");
    }
    const localDay = deadlineAt.slice(0, 10);
    const parsedDay = new Date(`${localDay}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(deadlineAt) || localDay.startsWith("0000") || Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== localDay) throw new Error("締切日時の日付が不正です。");
  } else if (precision === "date") {
    if (deadlineAt || !deadlineOn || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineOn)) throw new Error("日付のみの締切にはYYYY-MM-DDだけを指定してください。");
    const parsed = new Date(`${deadlineOn}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== deadlineOn || deadlineOn.startsWith("0000")) throw new Error("締切日が不正です。");
  } else if (deadlineAt || deadlineOn) throw new Error("日時未定には締切日時を指定できません。");
  const state = input.state as AdminDeadlineFields["state"];
  const projectType = input.projectType as AdminDeadlineFields["projectType"];
  if (!deadlineStates.includes(state) || !deadlineProjectTypes.includes(projectType)) throw new Error("締切の状態・企画区分が不正です。");
  const appearanceIds = input.appearanceIds;
  if (!Array.isArray(appearanceIds) || appearanceIds.length > 100 || appearanceIds.some(id => typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) || new Set(appearanceIds).size !== appearanceIds.length) {
    throw new Error("関連出演IDを重複なく指定してください。最大100件です。");
  }
  const seriesId = text(input.seriesId, "シリーズID", 200, true);
  if (seriesId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seriesId)) throw new Error("シリーズIDが不正です。");
  if (appearanceIds.length && seriesId) throw new Error("関連出演のある締切は出演側のシリーズを使用します。");
  let applicationUrl = text(input.applicationUrl, "申し込みURL", 2048, true);
  if (applicationUrl) {
    const url = new URL(applicationUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("申し込みURLは認証情報を含まないHTTP(S)を指定してください。");
    applicationUrl = url.toString();
  }
  return {
    id, label: text(input.label, "受付名", 200)!, projectTitle: text(input.projectTitle, "対象企画", 500)!,
    organizer: text(input.organizer, "主催者", 200)!, projectType, seriesId, deadlinePrecision: precision,
    deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : null, deadlineOn,
    applicationUrl, note: text(input.note, "補足", 2000, true), state, appearanceIds: [...appearanceIds].sort(),
  };
}
