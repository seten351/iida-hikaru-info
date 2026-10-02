import type { Appearance, AppearanceCategory } from "./appearance";

export const deadlinePrecisions = ["exact", "date", "unknown"] as const;
export const deadlineStates = ["scheduled", "closed", "cancelled", "sold_out"] as const;
export const deadlineProjectTypes = ["official", "fan"] as const;
export const receptionInformationTypes = ["ticket_application", "event_registration", "streaming_sale", "made_to_order", "online_sale", "other", "unspecified"] as const;
export const receptionInformationTypeLabels = {
  ticket_application: "チケット申込", event_registration: "イベント受付", streaming_sale: "配信販売",
  made_to_order: "受注物販", online_sale: "通常通販", other: "その他", unspecified: "種別未確認",
} as const;
export const receptionPhaseOverrides = ["auto", "not_open", "open"] as const;
export const receptionSaleModes = ["initial", "resale"] as const;
export type ReceptionInformationType = typeof receptionInformationTypes[number];
export type ReceptionFields = {
  informationType: typeof receptionInformationTypes[number];
  startsAtPrecision: typeof deadlinePrecisions[number];
  startsAt: string | null;
  startsOn: string | null;
  phaseOverride: typeof receptionPhaseOverrides[number];
  saleMode: typeof receptionSaleModes[number];
};
export const receptionFieldDefaults: ReceptionFields = {
  informationType: "unspecified", startsAtPrecision: "unknown", startsAt: null, startsOn: null,
  phaseOverride: "auto", saleMode: "initial",
};
export function getReceptionFields(value: Partial<ReceptionFields>): ReceptionFields {
  return { informationType: value.informationType ?? "unspecified", startsAtPrecision: value.startsAtPrecision ?? "unknown",
    startsAt: value.startsAt ?? null, startsOn: value.startsOn ?? null,
    phaseOverride: value.phaseOverride ?? "auto", saleMode: value.saleMode ?? "initial" };
}

export type AdminDeadlineFields = Partial<ReceptionFields> & {
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

export function validateDeadlineFields(value: unknown, extended = false): AdminDeadlineFields {
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
  if (!deadlineStates.includes(state) || (!extended && state === "sold_out") || !deadlineProjectTypes.includes(projectType)) throw new Error("締切の状態・企画区分が不正です。");
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
  const fields: AdminDeadlineFields = {
    id, label: text(input.label, "受付名", 200)!, projectTitle: text(input.projectTitle, "対象企画", 500)!,
    organizer: text(input.organizer, "主催者", 200)!, projectType, seriesId, deadlinePrecision: precision,
    deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : null, deadlineOn,
    applicationUrl, note: text(input.note, "補足", 2000, true), state, appearanceIds: [...appearanceIds].sort(),
  };
  if (!extended) return fields; // Never add defaults to v1's canonical JSON/hash.
  const informationType = input.informationType as ReceptionFields["informationType"];
  const startsAtPrecision = input.startsAtPrecision as ReceptionFields["startsAtPrecision"];
  const phaseOverride = input.phaseOverride as ReceptionFields["phaseOverride"];
  const saleMode = input.saleMode as ReceptionFields["saleMode"];
  if (!receptionInformationTypes.includes(informationType) || !receptionPhaseOverrides.includes(phaseOverride) || !receptionSaleModes.includes(saleMode)) throw new Error("受付・販売の種別・状態・再販区分が不正です。");
  if (!("startsAt" in input) || !("startsOn" in input)) throw new Error("開始日時の全項目を指定してください。");
  // Reuse the precision validator without converting date-only values to timestamps.
  const start = validateDeadlineFields({ ...fields, state: "scheduled", deadlinePrecision: startsAtPrecision, deadlineAt: input.startsAt, deadlineOn: input.startsOn });
  const result = { ...fields, informationType, startsAtPrecision, startsAt: start.deadlineAt, startsOn: start.deadlineOn, phaseOverride, saleMode };
  const startDay = getReceptionStartDay(result);
  const endDay = getReceptionEndDay(result);
  if ((startDay && endDay && startDay > endDay) || (result.startsAt && result.deadlineAt && Date.parse(result.startsAt) > Date.parse(result.deadlineAt))) throw new Error("開始は終了以前に指定してください。");
  if ((saleMode === "resale" || state === "sold_out") && !isSalesInformation(result)) throw new Error("完売・再販は販売種別に指定してください。");
  return result;
}

type ReceptionTiming = Pick<AdminDeadlineFields, "state" | "deadlinePrecision" | "deadlineAt" | "deadlineOn"> & Partial<ReceptionFields>;
const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
export function getReceptionDay(precision: typeof deadlinePrecisions[number], at: string | null, on: string | null) {
  return precision === "exact" && at ? dayFormatter.format(new Date(at)) : precision === "date" ? on : null;
}
export function getReceptionStartDay(item: Partial<ReceptionFields>) {
  const fields = getReceptionFields(item);
  return getReceptionDay(fields.startsAtPrecision, fields.startsAt, fields.startsOn);
}
export function getReceptionEndDay(item: Pick<AdminDeadlineFields, "deadlinePrecision" | "deadlineAt" | "deadlineOn">) {
  return getReceptionDay(item.deadlinePrecision, item.deadlineAt, item.deadlineOn);
}
export function isSalesInformation(item: Partial<ReceptionFields>) {
  return ["streaming_sale", "made_to_order", "online_sale"].includes(item.informationType ?? "unspecified");
}
export type ReceptionStatus = "not_open" | "open" | "start_today" | "end_today" | "expired" | "closed" | "sold_out" | "cancelled" | "unknown";
export type ReceptionUrgency = "scheduled" | "soon" | "today" | "expired" | "unknown";
export function getReceptionUrgency(item: Pick<AdminDeadlineFields, "deadlinePrecision" | "deadlineAt" | "deadlineOn">, now: Date): ReceptionUrgency {
  const day = getReceptionEndDay(item);
  if (!day) return "unknown";
  const today = dayFormatter.format(now);
  if (item.deadlineAt ? Date.parse(item.deadlineAt) <= now.getTime() : day < today) return "expired";
  if (day === today) return "today";
  // Calendar arithmetic is only a day distance, never a synthetic event timestamp.
  const days = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 7 ? "soon" : "scheduled";
}
export function getReceptionStatus(item: ReceptionTiming, now: Date): ReceptionStatus {
  if (item.state !== "scheduled") return item.state;
  const today = dayFormatter.format(now);
  const fields = getReceptionFields(item);
  const startDay = getReceptionStartDay(fields);
  const endDay = getReceptionEndDay(item);
  if (getReceptionUrgency(item, now) === "expired") return "expired";
  if (fields.startsAt ? Date.parse(fields.startsAt) > now.getTime() : startDay && startDay > today) return "not_open";
  const hasStarted = Boolean(fields.startsAt || (startDay && startDay < today));
  // A prior confirmation of "not open" cannot freeze a known start forever.
  if (fields.phaseOverride === "open" || (fields.phaseOverride === "not_open" && !hasStarted)) return fields.phaseOverride;
  if (endDay === today && item.deadlinePrecision === "date") return "end_today";
  if (startDay === today && fields.startsAtPrecision === "date") return "start_today";
  if (hasStarted) return "open";
  return "unknown";
}
export function isReceptionFinished(item: ReceptionTiming, now: Date) {
  return ["expired", "closed", "sold_out", "cancelled"].includes(getReceptionStatus(item, now));
}
export function getReceptionStatusLabel(item: ReceptionTiming, now: Date) {
  const sales = isSalesInformation(item);
  const status = getReceptionStatus(item, now);
  const fields = getReceptionFields(item);
  if (fields.informationType === "unspecified" && fields.startsAtPrecision === "unknown" && fields.phaseOverride === "auto" && item.state === "scheduled") {
    const urgencyLabels: Record<ReceptionUrgency, string> = { scheduled: "締切予定", soon: "締切間近", today: "本日締切", expired: "締切済み", unknown: "締切日時未定" };
    return urgencyLabels[getReceptionUrgency(item, now)];
  }
  const labels: Record<ReceptionStatus, string> = {
    not_open: sales ? "販売前" : "受付前", open: sales ? "販売中" : "受付中",
    start_today: sales ? "本日販売開始・時刻未確認" : "本日受付開始・時刻未確認",
    end_today: sales ? "本日販売終了・時刻未確認" : "本日締切・時刻未確認",
    expired: sales ? "販売終了" : "締切済み", closed: sales ? "販売終了" : "受付終了",
    sold_out: "完売", cancelled: "中止", unknown: "状態未確認",
  };
  const label = labels[status];
  return item.saleMode === "resale" ? (status === "not_open" ? "再販予定" : `再販・${label}`) : label;
}

/** Confirmed phases only supplement uncertain dates, never contradict exact dates. */
export function validateReceptionPhase(item: ReceptionTiming, now: Date) {
  const phase = item.phaseOverride ?? "auto";
  if (phase === "auto" || item.state !== "scheduled") return;
  const startDay = getReceptionStartDay(item);
  const today = dayFormatter.format(now);
  const future = item.startsAt ? Date.parse(item.startsAt) > now.getTime() : Boolean(startDay && startDay > today);
  const started = item.startsAt ? Date.parse(item.startsAt) <= now.getTime() : Boolean(startDay && startDay < today);
  if ((phase === "open" && (future || getReceptionUrgency(item, now) === "expired")) || (phase === "not_open" && started)) throw new Error("確認済み状態と開始・終了日時が矛盾しています。");
}
