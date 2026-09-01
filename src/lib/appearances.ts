import type { Appearance, AppearanceCategory } from "@/data/appearances";

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

export function groupAppearances(items: Appearance[], now: Date) {
  const timestamp = now.getTime();
  const byStartsAtAscending = (a: Appearance, b: Appearance) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

  return {
    latest: [...items]
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() -
          new Date(a.publishedAt).getTime(),
      )
      .slice(0, 3),
    upcoming: items
      .filter((item) => new Date(item.startsAt).getTime() >= timestamp)
      .sort(byStartsAtAscending),
    past: items
      .filter((item) => new Date(item.startsAt).getTime() < timestamp)
      .sort((a, b) => byStartsAtAscending(b, a)),
  };
}
