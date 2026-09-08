import type { AppearanceCard } from "@/lib/appearances";
import {
  compareAppearanceStartsAscending,
  getAppearanceStartDay,
} from "@/lib/appearances";

export const appearanceScheduleViews = ["upcoming", "week", "month"] as const;

export type AppearanceScheduleView = (typeof appearanceScheduleViews)[number];

export type AppearanceScheduleDay = {
  date: string;
  label: string;
  items: AppearanceCard[];
};

export type AppearanceSchedule = {
  view: AppearanceScheduleView;
  title: string;
  description: string;
  rangeLabel: string | null;
  days: AppearanceScheduleDay[];
};

type SearchParamValue = string | string[] | undefined;

const tokyoDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const rangeDayFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const monthLabelFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
});

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTokyoDay(value: Date) {
  const parts = tokyoDayFormatter.formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function calendarDate(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

function addDays(day: string, amount: number) {
  const value = calendarDate(day);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function startOfTokyoWeek(now: Date) {
  const today = formatTokyoDay(now);
  const dayOfWeek = calendarDate(today).getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDays(today, -daysSinceMonday);
}

function endOfTokyoMonth(now: Date) {
  const today = formatTokyoDay(now);
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function compareCardsOnDay(a: AppearanceCard, b: AppearanceCard) {
  return (
    compareAppearanceStartsAscending(a.sessions[0], b.sessions[0]) ||
    a.id.localeCompare(b.id)
  );
}

function groupCardsByDay(
  cards: AppearanceCard[],
  startDay: string,
  endDay: string,
) {
  const cardsByDay = new Map<string, Map<string, AppearanceCard>>();

  for (const card of cards) {
    for (const session of card.sessions) {
      const day = getAppearanceStartDay(session);
      if (day === null || day < startDay || day > endDay) continue;

      let cardsForDay = cardsByDay.get(day);
      if (cardsForDay === undefined) {
        cardsForDay = new Map();
        cardsByDay.set(day, cardsForDay);
      }

      const projectedCard = cardsForDay.get(card.id);
      if (projectedCard === undefined) {
        cardsForDay.set(card.id, { ...card, sessions: [session] });
      } else {
        projectedCard.sessions.push(session);
      }
    }
  }

  return [...cardsByDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cardsForDay]) => ({
      date,
      label: dayLabelFormatter.format(calendarDate(date)),
      items: [...cardsForDay.values()].sort(compareCardsOnDay),
    }));
}

export function parseAppearanceScheduleView(
  value: SearchParamValue,
): AppearanceScheduleView {
  const view = firstSearchParam(value);
  return appearanceScheduleViews.includes(view as AppearanceScheduleView)
    ? (view as AppearanceScheduleView)
    : "upcoming";
}

export function createAppearanceScheduleViewHref(
  pathname: string,
  currentSearchParams: string,
  view: AppearanceScheduleView,
) {
  const searchParams = new URLSearchParams(currentSearchParams);
  searchParams.set("view", view);
  const query = searchParams.toString();
  return `${pathname}${query ? `?${query}` : ""}#upcoming`;
}

export function getAppearanceSchedule(
  cards: AppearanceCard[],
  now: Date,
  view: AppearanceScheduleView,
): AppearanceSchedule {
  if (view === "upcoming") {
    return {
      view,
      title: "今後の出演予定",
      description: "閲覧時点から近い順に掲載しています。",
      rangeLabel: null,
      days: [],
    };
  }

  if (view === "week") {
    const startDay = startOfTokyoWeek(now);
    const endDay = addDays(startDay, 6);
    return {
      view,
      title: "今週の出演予定",
      description: "日本時間の今週分を日付ごとに掲載しています。",
      rangeLabel: `${rangeDayFormatter.format(calendarDate(startDay))}〜${rangeDayFormatter.format(calendarDate(endDay))}`,
      days: groupCardsByDay(cards, startDay, endDay),
    };
  }

  const today = formatTokyoDay(now);
  const startDay = `${today.slice(0, 7)}-01`;
  const endDay = endOfTokyoMonth(now);
  return {
    view,
    title: "今月の出演予定",
    description: "日本時間の今月分を日付ごとに掲載しています。",
    rangeLabel: monthLabelFormatter.format(calendarDate(startDay)),
    days: groupCardsByDay(cards, startDay, endDay),
  };
}
