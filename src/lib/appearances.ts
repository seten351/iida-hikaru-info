import type { Appearance, AppearanceCategory } from "@/domain/appearance";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const updatedAtFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const categoryClassNames: Record<AppearanceCategory, string> = {
  テレビ: "category-television",
  ラジオ: "category-radio",
  配信: "category-stream",
  イベント: "category-event",
  その他: "category-other",
};

export function formatAppearanceDate(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatUpdatedAt(value: Date) {
  return updatedAtFormatter.format(value);
}

export function formatPublishedAt(value: string) {
  return updatedAtFormatter.format(new Date(value));
}

export function groupAppearances(items: Appearance[], now: Date) {
  const timestamp = now.getTime();
  const byStartsAtAscending = (a: Appearance, b: Appearance) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() ||
    a.id.localeCompare(b.id);
  const byStartsAtDescending = (a: Appearance, b: Appearance) =>
    new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime() ||
    a.id.localeCompare(b.id);
  const byPublishedAtDescending = (a: Appearance, b: Appearance) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
    a.id.localeCompare(b.id);

  return {
    latest: [...items].sort(byPublishedAtDescending).slice(0, 3),
    upcoming: items
      .filter((item) => new Date(item.startsAt).getTime() >= timestamp)
      .sort(byStartsAtAscending),
    past: items
      .filter((item) => new Date(item.startsAt).getTime() < timestamp)
      .sort(byStartsAtDescending),
  };
}
