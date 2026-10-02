import { getReceptionFields, getReceptionStatus, getReceptionStartDay, getReceptionEndDay, getReceptionUrgency, isReceptionFinished, isSalesInformation, receptionInformationTypeLabels, type Deadline } from "@/domain/deadline";
import type { AppearanceFilters, AppearanceFilterOptions } from "./appearance-filters";
import { appearanceNoSeriesValue } from "./appearance-filters";
import { appearanceCategoryDisplayOrder } from "@/domain/appearance";
import { comparePublications } from "./appearances";
import { appearanceSeriesSearchAliases } from "./appearance-series-search-aliases";

export type DeadlineStatus = "scheduled" | "soon" | "today" | "expired" | "closed" | "cancelled" | "sold_out" | "unknown";
export const deadlineStatusLabels: Record<DeadlineStatus, string> = {
  scheduled: "締切予定", soon: "締切間近", today: "本日締切", expired: "締切済み",
  closed: "受付終了", cancelled: "中止", sold_out: "完売", unknown: "締切日時未定",
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric", weekday: "short" });
const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const getDeadlineDay = getReceptionEndDay;

// Compatibility wrapper: legacy callers retain deadline urgency labels.
export function getDeadlineStatus(item: Pick<Deadline, "state" | "deadlinePrecision" | "deadlineAt" | "deadlineOn">, now: Date): DeadlineStatus {
  if (item.state === "closed" || item.state === "cancelled" || item.state === "sold_out") return item.state;
  return getReceptionUrgency(item, now);
}
export const isDeadlineFinished = isReceptionFinished;

function formatDateOnly(day: string) {
  // This Date is only a UTC calendar formatting carrier, never a saved or displayed datetime.
  const [year, month, date] = day.split("-").map(Number);
  const carrier = new Date(0);
  carrier.setUTCFullYear(year, month - 1, date);
  return `${dateFormatter.format(carrier)}（時刻未確認・日本時間）`;
}
export function formatReceptionStart(item: Deadline) {
  const fields = getReceptionFields(item);
  if (fields.startsAtPrecision === "exact") return `${dateTimeFormatter.format(new Date(fields.startsAt!))}（日本時間）`;
  if (fields.startsAtPrecision === "date") return formatDateOnly(fields.startsOn!);
  return "開始日時未確認";
}
export function getReceptionCalendarLabels(item: Deadline, date: string) {
  return [
    ...(getReceptionStartDay(item) === date ? [isSalesInformation(item) ? "販売開始" : "受付開始"] : []),
    ...(getReceptionEndDay(item) === date ? [isSalesInformation(item) ? "販売終了" : "締切"] : []),
  ];
}

export function formatDeadline(item: Pick<Deadline, "deadlinePrecision" | "deadlineAt" | "deadlineOn">) {
  if (item.deadlinePrecision === "exact") return `${dateTimeFormatter.format(new Date(item.deadlineAt!))}（日本時間）`;
  if (item.deadlinePrecision === "date") return formatDateOnly(item.deadlineOn!);
  return "締切日時未定";
}

export function compareDeadlines(a: Deadline, b: Deadline) {
  const aDay = getDeadlineDay(a);
  const bDay = getDeadlineDay(b);
  if (!aDay || !bDay) return aDay ? -1 : bDay ? 1 : a.id.localeCompare(b.id);
  const orderTime = (item: Deadline) => item.deadlinePrecision === "exact" ? Date.parse(item.deadlineAt!) : Number.POSITIVE_INFINITY;
  return aDay.localeCompare(bDay) ||
    orderTime(a) - orderTime(b) || a.id.localeCompare(b.id);
}

export function getUpcomingDeadlinePreview(items: Deadline[], now: Date) {
  return items.filter((item) => !isDeadlineFinished(item, now) && (getDeadlineDay(item) !== null || !isSalesInformation(item))).sort(compareDeadlines).slice(0, 3);
}

/** Secondary home shelf: forthcoming starts first, then open sales with an unknown end. */
export function getStartingReceptionPreview(items: Deadline[], now: Date, primary = getUpcomingDeadlinePreview(items, now)) {
  const selected = new Set(primary.map(item => item.id));
  return items.filter(item => {
    if (selected.has(item.id) || isReceptionFinished(item, now)) return false;
    const status = getReceptionStatus(item, now);
    return status === "not_open" || status === "start_today" || (status === "open" && getReceptionEndDay(item) === null);
  }).sort((a, b) => {
    const upcoming = (item: Deadline) => ["not_open", "start_today"].includes(getReceptionStatus(item, now));
    if (upcoming(a) !== upcoming(b)) return upcoming(a) ? -1 : 1;
    const aDay = getReceptionStartDay(a), bDay = getReceptionStartDay(b);
    if (aDay !== bDay) {
      if (!aDay || !bDay) return aDay ? -1 : 1;
      return upcoming(a) ? aDay.localeCompare(bDay) : bDay.localeCompare(aDay);
    }
    const aStart = getReceptionFields(a).startsAt, bStart = getReceptionFields(b).startsAt;
    if (aStart && bStart) {
      const timeDifference = Date.parse(aStart) - Date.parse(bStart);
      if (timeDifference) return upcoming(a) ? timeDifference : -timeDifference;
    }
    return comparePublications(a.publication, b.publication) || a.id.localeCompare(b.id);
  }).slice(0, 3);
}

export function createDeadlineDetailHref(id: string) {
  return `/deadlines#deadline-${encodeURIComponent(id)}`;
}

export function extendDeadlineFilterOptions(options: AppearanceFilterOptions, deadlines: Deadline[]): AppearanceFilterOptions {
  const categories = new Set([...options.categories, ...deadlines.map(item => item.category)]);
  const years = new Set(options.years);
  for (const item of deadlines) {
    const day = getDeadlineDay(item) ?? getReceptionStartDay(item);
    if (day) years.add(day.slice(0, 4));
  }
  return { ...options, categories: appearanceCategoryDisplayOrder.filter(category => categories.has(category)), years: [...years].sort().reverse() };
}

export function filterReceptionStatus(items: Deadline[], filters: Pick<AppearanceFilters, "receptionStatus">, now: Date) {
  return items.filter(item => !filters.receptionStatus || getReceptionStatus(item, now) === filters.receptionStatus);
}

export function filterDeadlines(items: Deadline[], filters: AppearanceFilters, now = new Date()) {
  const terms = filters.q.normalize("NFKC").toLocaleLowerCase("ja-JP").split(/\s+/).filter(Boolean);
  return filterReceptionStatus(items, filters, now).filter(item => {
    if (filters.series !== null && (item.seriesId ?? appearanceNoSeriesValue) !== filters.series) return false;
    if (filters.category !== null && item.category !== filters.category) return false;
    if (filters.year !== null && (getDeadlineDay(item) ?? getReceptionStartDay(item))?.slice(0, 4) !== filters.year) return false;
    if (filters.receptionType && getReceptionFields(item).informationType !== filters.receptionType) return false;
    const searchable = [receptionInformationTypeLabels[getReceptionFields(item).informationType], item.projectTitle, item.label, item.organizer, item.seriesName, item.note,
      ...(item.seriesId ? appearanceSeriesSearchAliases[item.seriesId] ?? [] : []),
      ...item.targets.flatMap(target => [target.title, target.sessionLabel]),
    ].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ja-JP");
    return terms.every(term => searchable.includes(term));
  });
}
