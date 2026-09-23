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

export type AppearanceCalendarDay = AppearanceScheduleDay & {
  dayNumber: number;
  isToday: boolean;
};

export type AppearanceCalendar = {
  view: "week" | "month";
  period: string;
  startDay: string;
  endDay: string;
  today: string;
  label: string;
  weeks: (AppearanceCalendarDay | null)[][];
  initialSelectedDay: string;
  previousPeriod: string | null;
  nextPeriod: string | null;
  isCurrentPeriod: boolean;
};

export type AppearanceSchedule = {
  view: AppearanceScheduleView;
  title: string;
  description: string;
  rangeLabel: string | null;
  days: AppearanceScheduleDay[];
  calendar: AppearanceCalendar | null;
};

type SearchParamValue = string | string[] | undefined;

export type AppearanceScheduleOptions = {
  month?: SearchParamValue;
  week?: SearchParamValue;
};

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

function formatYear(year: number) {
  return String(year).padStart(4, "0");
}

function formatCalendarDay(value: Date) {
  const year = value.getUTCFullYear();
  if (year < 1 || year > 9999) return null;

  return `${formatYear(year)}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function formatCalendarMonth(year: number, month: number) {
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null;

  return `${formatYear(year)}-${String(month).padStart(2, "0")}`;
}

function createUtcDate(year: number, monthIndex: number, day: number) {
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(year, monthIndex, day);
  return value;
}

function parseCalendarDay(value: string | undefined) {
  if (value === undefined) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;

  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || year > 9999) return null;

  const date = createUtcDate(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseCalendarMonth(value: string | undefined) {
  if (value === undefined || !/^(\d{4})-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);
  return year < 1 || year > 9999 ? null : { year, month };
}

function calendarDate(day: string) {
  return parseCalendarDay(day);
}

function addDays(day: string, amount: number) {
  const value = calendarDate(day);
  if (value === null) return null;

  value.setUTCDate(value.getUTCDate() + amount);
  return formatCalendarDay(value);
}

function startOfWeek(day: string) {
  const value = calendarDate(day);
  return value === null ? null : addDays(day, -value.getUTCDay());
}

function isRepresentableWeek(period: string | null): period is string {
  if (period === null) return false;

  const startDay = calendarDate(period);
  return startDay !== null && startDay.getUTCDay() === 0 && addDays(period, 6) !== null;
}

function endOfMonth(month: string) {
  const parsed = parseCalendarMonth(month);
  if (parsed === null) return null;

  return formatCalendarDay(createUtcDate(parsed.year, parsed.month, 0));
}

function shiftMonth(month: string, amount: number) {
  const parsed = parseCalendarMonth(month);
  if (parsed === null) return null;

  const value = createUtcDate(parsed.year, parsed.month - 1 + amount, 1);
  return formatCalendarMonth(value.getUTCFullYear(), value.getUTCMonth() + 1);
}

function formatTokyoDay(value: Date) {
  const values = Object.fromEntries(
    tokyoDayFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
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
      label: dayLabelFormatter.format(calendarDate(date)!),
      items: [...cardsForDay.values()].sort(compareCardsOnDay),
    }));
}

function createCalendarDay(
  date: string,
  today: string,
  scheduledDays: Map<string, AppearanceScheduleDay>,
): AppearanceCalendarDay {
  const scheduledDay = scheduledDays.get(date);
  return {
    date,
    label: scheduledDay?.label ?? dayLabelFormatter.format(calendarDate(date)!),
    items: scheduledDay?.items ?? [],
    dayNumber: calendarDate(date)!.getUTCDate(),
    isToday: date === today,
  };
}

function createCalendar(
  view: "week" | "month",
  period: string,
  today: string,
  currentPeriod: string,
  days: AppearanceScheduleDay[],
): AppearanceCalendar {
  const scheduledDays = new Map(days.map((day) => [day.date, day]));
  const isCurrentPeriod = period === currentPeriod;

  if (view === "week") {
    const startDay = period;
    const endDay = addDays(startDay, 6)!;
    const week = Array.from({ length: 7 }, (_, index) =>
      createCalendarDay(addDays(startDay, index)!, today, scheduledDays),
    );
    const previousCandidate = addDays(startDay, -7);
    const nextCandidate = addDays(startDay, 7);

    return {
      view,
      period,
      startDay,
      endDay,
      today,
      label: `${rangeDayFormatter.format(calendarDate(startDay)!)}〜${rangeDayFormatter.format(calendarDate(endDay)!)}`,
      weeks: [week],
      initialSelectedDay:
        today >= startDay && today <= endDay
          ? today
          : days[0]?.date ?? startDay,
      previousPeriod: isRepresentableWeek(previousCandidate)
        ? previousCandidate
        : null,
      nextPeriod: isRepresentableWeek(nextCandidate) ? nextCandidate : null,
      isCurrentPeriod,
    };
  }

  const startDay = `${period}-01`;
  const endDay = endOfMonth(period)!;
  const firstDayOffset = calendarDate(startDay)!.getUTCDay();
  const daysInMonth = calendarDate(endDay)!.getUTCDate();
  const weekCount = Math.ceil((firstDayOffset + daysInMonth) / 7);
  const weeks: (AppearanceCalendarDay | null)[][] = [];

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    weeks.push(
      Array.from({ length: 7 }, (_, dayIndex) => {
        const dayNumber = weekIndex * 7 + dayIndex - firstDayOffset + 1;
        if (dayNumber < 1 || dayNumber > daysInMonth) return null;

        return createCalendarDay(
          `${period}-${String(dayNumber).padStart(2, "0")}`,
          today,
          scheduledDays,
        );
      }),
    );
  }

  return {
    view,
    period,
    startDay,
    endDay,
    today,
    label: monthLabelFormatter.format(calendarDate(startDay)!),
    weeks,
    initialSelectedDay:
      today >= startDay && today <= endDay ? today : days[0]?.date ?? startDay,
    previousPeriod: shiftMonth(period, -1),
    nextPeriod: shiftMonth(period, 1),
    isCurrentPeriod,
  };
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
  searchParams.delete("month");
  searchParams.delete("week");
  searchParams.set("view", view);
  const query = searchParams.toString();
  return `${pathname}${query ? `?${query}` : ""}#upcoming`;
}

export function createAppearanceCalendarPeriodHref(
  pathname: string,
  currentSearchParams: string,
  view: "week" | "month",
  period: string | null,
) {
  const searchParams = new URLSearchParams(currentSearchParams);
  searchParams.delete("month");
  searchParams.delete("week");
  searchParams.set("view", view);
  if (period !== null) searchParams.set(view, period);
  const query = searchParams.toString();
  return `${pathname}${query ? `?${query}` : ""}#upcoming`;
}

export function getAppearanceSchedule(
  cards: AppearanceCard[],
  now: Date,
  view: AppearanceScheduleView,
  options: AppearanceScheduleOptions = {},
): AppearanceSchedule {
  if (view === "upcoming") {
    return {
      view,
      title: "今後の出演予定",
      description: "閲覧時点から近い順に掲載しています。",
      rangeLabel: null,
      days: [],
      calendar: null,
    };
  }

  const today = formatTokyoDay(now);
  const currentMonth = today.slice(0, 7);
  const currentWeek = startOfWeek(today);
  if (!isRepresentableWeek(currentWeek)) {
    throw new RangeError("The current Tokyo week cannot be represented.");
  }

  if (view === "week") {
    const requestedDay = parseCalendarDay(firstSearchParam(options.week));
    const requestedPeriod =
      requestedDay === null ? null : startOfWeek(formatCalendarDay(requestedDay)!);
    const period = isRepresentableWeek(requestedPeriod)
      ? requestedPeriod
      : currentWeek;
    const endDay = addDays(period, 6)!;
    const days = groupCardsByDay(cards, period, endDay);
    const calendar = createCalendar("week", period, today, currentWeek, days);

    return {
      view,
      title: calendar.isCurrentPeriod ? "今週の出演予定" : "週の出演予定",
      description: "日付を選ぶと、その日の出演情報を確認できます。",
      rangeLabel: calendar.label,
      days,
      calendar,
    };
  }

  const requestedMonth = parseCalendarMonth(firstSearchParam(options.month));
  const period =
    requestedMonth === null
      ? currentMonth
      : formatCalendarMonth(requestedMonth.year, requestedMonth.month)!;
  const endDay = endOfMonth(period)!;
  const days = groupCardsByDay(cards, `${period}-01`, endDay);
  const calendar = createCalendar("month", period, today, currentMonth, days);

  return {
    view,
    title: calendar.isCurrentPeriod ? "今月の出演予定" : "月の出演予定",
    description: "日付を選ぶと、その日の出演情報を確認できます。",
    rangeLabel: calendar.label,
    days,
    calendar,
  };
}
