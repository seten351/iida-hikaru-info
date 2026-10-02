import {
  getReceptionEndDay, getReceptionFields, getReceptionStartDay, getReceptionStatus,
  getReceptionStatusLabel, getReceptionUrgency, isReceptionFinished, isSalesInformation,
  type Deadline, type ReceptionInformationType, type ReceptionStatus,
} from "@/domain/deadline";
import { compareDeadlines, getReceptionCalendarLabels, getStartingReceptionPreview } from "./deadlines";

export type DeadlineListView = "active" | "ending" | "starting" | "finished" | "all";
const finishedStatuses: ReceptionStatus[] = ["expired", "closed", "sold_out", "cancelled"];
const tokyoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
const dayDistance = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const unique = (items: Deadline[]) => [...new Map(items.map(item => [item.id, item])).values()];

export function parseDeadlineListView(value: string | string[] | undefined, status?: ReceptionStatus | null): DeadlineListView {
  const first = Array.isArray(value) ? value[0] : value;
  if (["active", "ending", "starting", "finished", "all"].includes(first ?? "")) return first as DeadlineListView;
  return status && finishedStatuses.includes(status) ? "finished" : "active";
}

function compareStarts(a: Deadline, b: Deadline) {
  const aDay = getReceptionStartDay(a), bDay = getReceptionStartDay(b);
  if (aDay !== bDay) return aDay ? bDay ? aDay.localeCompare(bDay) : -1 : 1;
  const time = (item: Deadline) => item.startsAt ? Date.parse(item.startsAt) : Infinity;
  return time(a) - time(b) || a.id.localeCompare(b.id);
}

export function getDeadlineListItems(items: Deadline[], now: Date, view: DeadlineListView): Deadline[] {
  const filtered = unique(items).filter(item => {
    const finished = isReceptionFinished(item, now);
    if (view === "all") return true;
    if (view === "finished") return finished;
    if (finished) return false;
    if (view === "ending") return getReceptionEndDay(item) !== null;
    if (view === "starting") return ["not_open", "start_today"].includes(getReceptionStatus(item, now));
    return true;
  });
  return filtered.sort(view === "starting" ? compareStarts : view === "finished" ? (a, b) => compareDeadlines(b, a) : compareDeadlines);
}

export function groupDeadlineListItems(items: Deadline[], now: Date) {
  type Key = "ending" | "starting" | "open" | "unknown" | "finished";
  const labels: Record<Key, string> = { ending: "締切・販売終了予定", starting: "開始予定", open: "受付中・販売中", unknown: "状態未確認", finished: "終了・完売・中止" };
  const groups = new Map<Key, Deadline[]>((Object.keys(labels) as Key[]).map(key => [key, []]));
  for (const item of unique(items)) {
    const status = getReceptionStatus(item, now);
    const key: Key = isReceptionFinished(item, now) ? "finished"
      : status === "not_open" || status === "start_today" ? "starting"
        : getReceptionEndDay(item) ? "ending" : status === "open" ? "open" : "unknown";
    groups.get(key)!.push(item);
  }
  return [...groups].filter(([, group]) => group.length).map(([key, group]) => ({ key, label: labels[key], items: group.sort(key === "starting" ? compareStarts : key === "finished" ? (a, b) => compareDeadlines(b, a) : compareDeadlines) }));
}

export function getReceptionPresentation(item: Deadline, now: Date) {
  const status = getReceptionStatus(item, now);
  const urgency = getReceptionUrgency(item, now);
  const sales = isSalesInformation(item);
  const stateLabel = status === "unknown" ? "状態未確認" : status === "not_open" ? (sales ? "販売開始予定" : "受付開始予定") : getReceptionStatusLabel({ ...item, saleMode: "initial" }, now);
  const urgencyLabel = !isReceptionFinished(item, now) && (urgency === "soon" || urgency === "today")
    ? urgency === "today" ? (sales ? "本日販売終了" : "本日締切") : (sales ? "終了間近" : "締切間近") : null;
  return { status, stateLabel, urgencyLabel: urgencyLabel && !stateLabel.includes(urgencyLabel) ? urgencyLabel : null,
    resaleLabel: item.saleMode === "resale" ? "再販" : null,
    nextBoundary: (["not_open", "start_today"].includes(status) ? "start" : "end") as "start" | "end" };
}

export function createDeadlineListViewHref(currentSearchParams: string, view: DeadlineListView) {
  const params = new URLSearchParams(currentSearchParams);
  // Purpose and existing facets intersect; neither silently clears the other.
  params.set("receptionView", view);
  params.set("page", "1");
  return `/deadlines?${params}#deadlines`;
}

export function createDeadlineTypeHref(currentSearchParams: string, type: ReceptionInformationType | null) {
  const params = new URLSearchParams(currentSearchParams);
  if (type) params.set("receptionType", type); else params.delete("receptionType");
  params.set("page", "1");
  return `/deadlines?${params}#deadlines`;
}

export type UrgentReception = { item: Deadline; label: string; boundary: "start" | "end" };
export function getUrgentReceptions(items: Deadline[], now: Date): UrgentReception[] {
  const today = tokyoDay.format(now);
  const ranked = unique(items).flatMap(item => {
    if (isReceptionFinished(item, now)) return [];
    const end = getReceptionEndDay(item), start = getReceptionStartDay(item);
    const sales = isSalesInformation(item);
    const fields = getReceptionFields(item);
    const endDistance = end ? dayDistance(end, today) : Infinity;
    const starting = ["not_open", "start_today"].includes(getReceptionStatus(item, now));
    const startsSoon = starting && (fields.startsAtPrecision === "exact" ? Date.parse(fields.startsAt!) > now.getTime() && Date.parse(fields.startsAt!) - now.getTime() <= 86_400_000 : fields.startsAtPrecision === "date" && start === today);
    const rank = endDistance === 0 ? 0 : startsSoon ? 1 : endDistance > 0 && endDistance <= 3 ? 2 : null;
    if (rank === null) return [];
    const boundary = rank === 1 ? "start" : "end";
    const label = boundary === "start" ? (fields.startsAtPrecision === "date" ? `本日${sales ? "販売" : "受付"}開始・時刻未確認` : `まもなく${sales ? "販売" : "受付"}開始`)
      : endDistance === 0 ? (sales ? "本日販売終了" : "本日締切") : (sales ? "販売終了間近" : "締切間近");
    const day = boundary === "start" ? start! : end!;
    const exact = boundary === "start" ? fields.startsAt : item.deadlineAt;
    return [{ item, label, boundary: boundary as "start" | "end", rank, day, time: exact ? Date.parse(exact) : Infinity }];
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.day.localeCompare(b.day) || a.time - b.time || a.item.id.localeCompare(b.item.id)).slice(0, 2).map(({ item, label, boundary }) => ({ item, label, boundary }));
}

export function getDesktopReceptionPreview(items: Deadline[], now: Date) {
  const endings = getDeadlineListItems(items, now, "ending");
  const primary = endings.slice(0, 2);
  const secondary = getStartingReceptionPreview(items, now, primary);
  const selected = unique([...primary, ...secondary.slice(0, 1), ...endings, ...secondary, ...getDeadlineListItems(items, now, "active")]).slice(0, 3);
  const secondaryIds = new Set(secondary.slice(0, 1).map(item => item.id));
  const ending = selected.filter(item => !secondaryIds.has(item.id) && getReceptionEndDay(item));
  const endingIds = new Set(ending.map(item => item.id));
  return { ending, starting: selected.filter(item => !endingIds.has(item.id)) };
}

const compactDateTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
export function formatReceptionBoundaryCompact(item: Deadline, boundary: "start" | "end") {
  const fields = getReceptionFields(item);
  const exact = boundary === "start" ? fields.startsAt : item.deadlineAt;
  const day = boundary === "start" ? getReceptionStartDay(item) : getReceptionEndDay(item);
  return exact ? compactDateTime.format(new Date(exact)) : day ? `${Number(day.slice(0, 4))}/${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} 時刻未確認` : "日時未確認";
}

export function aggregateReceptionCalendarLabels(items: Deadline[], date: string) {
  const compact = { "締切": "締切", "販売終了": "販売終", "受付開始": "受付始", "販売開始": "販売始" } as const;
  const counts = new Map<string, number>();
  for (const item of unique(items)) for (const label of getReceptionCalendarLabels(item, date)) counts.set(label, (counts.get(label) ?? 0) + 1);
  return (Object.keys(compact) as Array<keyof typeof compact>).filter(label => counts.has(label)).map(label => ({ label, compactLabel: compact[label], count: counts.get(label)! }));
}
