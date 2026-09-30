import type { Deadline } from "@/domain/deadline";
import type { AppearanceFilters, AppearanceFilterOptions } from "./appearance-filters";
import { appearanceNoSeriesValue } from "./appearance-filters";
import { appearanceCategoryDisplayOrder } from "@/domain/appearance";
import { appearanceSeriesSearchAliases } from "./appearance-series-search-aliases";

export type DeadlineStatus = "scheduled" | "soon" | "today" | "expired" | "closed" | "cancelled" | "unknown";
export const deadlineStatusLabels: Record<DeadlineStatus, string> = {
  scheduled: "締切予定", soon: "締切間近", today: "本日締切", expired: "締切済み",
  closed: "受付終了", cancelled: "中止", unknown: "締切日時未定",
};

const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" });
const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export function getDeadlineDay(item: Pick<Deadline, "deadlinePrecision" | "deadlineAt" | "deadlineOn">) {
  return item.deadlinePrecision === "exact" ? dayFormatter.format(new Date(item.deadlineAt!)) : item.deadlinePrecision === "date" ? item.deadlineOn : null;
}

export function getDeadlineStatus(item: Pick<Deadline, "state" | "deadlinePrecision" | "deadlineAt" | "deadlineOn">, now: Date): DeadlineStatus {
  if (item.state === "closed" || item.state === "cancelled") return item.state;
  const day = getDeadlineDay(item);
  if (!day) return "unknown";
  const today = dayFormatter.format(now);
  if (item.deadlinePrecision === "exact" ? Date.parse(item.deadlineAt!) <= now.getTime() : day < today) return "expired";
  if (day === today) return "today";
  const daysLeft = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return daysLeft <= 7 ? "soon" : "scheduled";
}

export function isDeadlineFinished(item: Pick<Deadline, "state" | "deadlinePrecision" | "deadlineAt" | "deadlineOn">, now: Date) {
  return ["expired", "closed", "cancelled"].includes(getDeadlineStatus(item, now));
}

export function formatDeadline(item: Pick<Deadline, "deadlinePrecision" | "deadlineAt" | "deadlineOn">) {
  if (item.deadlinePrecision === "exact") return `${dateTimeFormatter.format(new Date(item.deadlineAt!))}（日本時間）`;
  if (item.deadlinePrecision === "date") return `${dateFormatter.format(new Date(`${item.deadlineOn}T00:00:00+09:00`))}（時刻未確認・日本時間）`;
  return "締切日時未定";
}

export function compareDeadlines(a: Deadline, b: Deadline) {
  const aDay = getDeadlineDay(a);
  const bDay = getDeadlineDay(b);
  if (!aDay || !bDay) return aDay ? -1 : bDay ? 1 : a.id.localeCompare(b.id);
  const orderTime = (item: Deadline, day: string) => item.deadlineAt ? Date.parse(item.deadlineAt) : Date.parse(`${day}T00:00:00+09:00`) + 86_400_000;
  return aDay.localeCompare(bDay) ||
    orderTime(a, aDay) - orderTime(b, bDay) || a.id.localeCompare(b.id);
}

export function extendDeadlineFilterOptions(options: AppearanceFilterOptions, deadlines: Deadline[]): AppearanceFilterOptions {
  const categories = new Set([...options.categories, ...deadlines.map(item => item.category)]);
  const years = new Set(options.years);
  for (const item of deadlines) {
    const day = getDeadlineDay(item);
    if (day) years.add(day.slice(0, 4));
  }
  return { ...options, categories: appearanceCategoryDisplayOrder.filter(category => categories.has(category)), years: [...years].sort().reverse() };
}

export function filterDeadlines(items: Deadline[], filters: AppearanceFilters) {
  const terms = filters.q.normalize("NFKC").toLocaleLowerCase("ja-JP").split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (filters.series !== null && (item.seriesId ?? appearanceNoSeriesValue) !== filters.series) return false;
    if (filters.category !== null && item.category !== filters.category) return false;
    if (filters.year !== null && getDeadlineDay(item)?.slice(0, 4) !== filters.year) return false;
    const searchable = [item.projectTitle, item.label, item.organizer, item.seriesName, item.note,
      ...(item.seriesId ? appearanceSeriesSearchAliases[item.seriesId] ?? [] : []),
      ...item.targets.flatMap(target => [target.title, target.sessionLabel]),
    ].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ja-JP");
    return terms.every(term => searchable.includes(term));
  });
}
