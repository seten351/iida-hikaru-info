import assert from "node:assert/strict";
import test from "node:test";

import type { Appearance } from "../src/domain/appearance";
import { getAppearanceSchedule } from "../src/lib/appearance-schedule";
import { buildAppearanceCards } from "../src/lib/appearances";

function dateAppearance(id: string, startsOn: string, eventGroupId: string | null = null): Appearance {
  return {
    id,
    startsAtPrecision: "date",
    startsAt: null,
    startsOn,
    title: id,
    seriesId: null,
    seriesName: null,
    eventGroupId,
    eventTitle: eventGroupId === null ? null : "複数日イベント",
    sessionLabel: eventGroupId === null ? null : id,
    category: "イベント",
    sourceUrls: ["https://example.com/announcement"],
    sourceUrl: "https://example.com/announcement",
    publishedAtPrecision: "date",
    publishedAt: null,
    publishedOn: "2026-01-01",
    collectedAt: "2026-01-01T00:00:00+09:00",
  };
}

function exactAppearance(id: string, startsAt: string): Appearance {
  return {
    ...dateAppearance(id, "2026-01-01"),
    startsAtPrecision: "exact",
    startsAt,
    startsOn: null,
  };
}

function unknownAppearance(id: string): Appearance {
  return {
    ...dateAppearance(id, "2026-01-01"),
    startsAtPrecision: "unknown",
    startsOn: null,
  };
}

const now = new Date("2026-09-15T03:00:00Z");

test("month calendars are Sunday-first and retain blank cells", () => {
  const cards = buildAppearanceCards([dateAppearance("leap", "2028-02-29")]);
  const fourRows = getAppearanceSchedule(cards, now, "month", { month: "2026-02" }).calendar!;
  const fiveRows = getAppearanceSchedule(cards, now, "month", { month: "2021-02" }).calendar!;
  const sixRows = getAppearanceSchedule(cards, now, "month", { month: "2026-08" }).calendar!;
  const leap = getAppearanceSchedule(cards, now, "month", { month: "2028-02" }).calendar!;

  assert.equal(fourRows.weeks.length, 4);
  assert.equal(fourRows.weeks[0][0]?.date, "2026-02-01");
  assert.equal(fiveRows.weeks.length, 5);
  assert.equal(sixRows.weeks.length, 6);
  assert.equal(sixRows.weeks[0][0], null);
  assert.equal(sixRows.weeks[0][6]?.date, "2026-08-01");
  assert.equal(leap.endDay, "2028-02-29");
  assert.equal(leap.weeks.flat().find((day) => day?.date === "2028-02-29")?.items[0]?.id, "appearance:leap");
});

test("weeks normalize to Sunday and calendars include empty days", () => {
  const calendar = getAppearanceSchedule([], now, "week", { week: "2026-09-16" }).calendar!;
  assert.equal(calendar.period, "2026-09-13");
  assert.equal(calendar.startDay, "2026-09-13");
  assert.equal(calendar.endDay, "2026-09-19");
  assert.equal(calendar.weeks.length, 1);
  assert.equal(calendar.weeks[0].length, 7);
  assert.ok(calendar.weeks[0].every((day) => day !== null && day.items.length === 0));
  assert.equal(calendar.initialSelectedDay, "2026-09-15");
});

test("selected periods project only that day’s sessions and omit unknown starts", () => {
  const cards = buildAppearanceCards([
    dateAppearance("first", "2026-08-04", "multi"),
    dateAppearance("second", "2026-08-18", "multi"),
    exactAppearance("tokyo-boundary", "2026-08-31T15:00:00Z"),
    unknownAppearance("unknown"),
  ]);
  const schedule = getAppearanceSchedule(cards, now, "month", { month: "2026-08" });
  const first = schedule.calendar!.weeks.flat().find((day) => day?.date === "2026-08-04")!;
  const second = schedule.calendar!.weeks.flat().find((day) => day?.date === "2026-08-18")!;

  assert.deepEqual(schedule.days.map((day) => day.date), ["2026-08-04", "2026-08-18"]);
  assert.deepEqual(first!.items[0].sessions.map((session) => session.id), ["first"]);
  assert.deepEqual(second!.items[0].sessions.map((session) => session.id), ["second"]);
  assert.equal(schedule.days.some((day) => day.items.some((card) => card.id === "appearance:unknown")), false);
  assert.equal(schedule.days.some((day) => day.date === "2026-09-01"), false);
});

test("invalid period parameters fall back to the Tokyo current period", () => {
  const month = getAppearanceSchedule([], new Date("2026-09-30T14:59:59Z"), "month", { month: ["2026-02-30", "2025-01"] });
  const week = getAppearanceSchedule([], now, "week", { week: "2026-09-31" });
  const yearNinetyNine = getAppearanceSchedule([], now, "month", { month: "0099-02" }).calendar!;

  assert.equal(month.calendar?.period, "2026-09");
  assert.equal(week.calendar?.period, "2026-09-13");
  assert.equal(yearNinetyNine.period, "0099-02");
  assert.equal(yearNinetyNine.previousPeriod, "0099-01");
  assert.equal(yearNinetyNine.nextPeriod, "0099-03");
});

test("unrepresentable adjacent months have no navigation period", () => {
  const firstMonth = getAppearanceSchedule([], now, "month", { month: "0001-01" }).calendar!;
  const lastMonth = getAppearanceSchedule([], now, "month", { month: "9999-12" }).calendar!;

  assert.equal(firstMonth.previousPeriod, null);
  assert.equal(firstMonth.nextPeriod, "0001-02");
  assert.equal(lastMonth.previousPeriod, "9999-11");
  assert.equal(lastMonth.nextPeriod, null);
});

test("out-of-range week queries fall back and boundary navigation is unavailable", () => {
  const currentPeriod = "2026-09-13";
  const zeroYear = getAppearanceSchedule([], now, "week", { week: "0000-01-01" }).calendar!;
  const firstYearBoundary = getAppearanceSchedule([], now, "week", { week: "0001-01-01" }).calendar!;
  const lastYearBoundary = getAppearanceSchedule([], now, "week", { week: "9999-12-31" }).calendar!;
  const firstNavigableWeek = getAppearanceSchedule([], now, "week", { week: "0001-01-07" }).calendar!;
  const lastNavigableWeek = getAppearanceSchedule([], now, "week", { week: "9999-12-20" }).calendar!;

  assert.equal(getAppearanceSchedule([], now, "month", { month: "0000-01" }).calendar?.period, "2026-09");
  assert.equal(zeroYear.period, currentPeriod);
  assert.equal(firstYearBoundary.period, currentPeriod);
  assert.equal(lastYearBoundary.period, currentPeriod);
  assert.equal(firstNavigableWeek.period, "0001-01-07");
  assert.equal(firstNavigableWeek.previousPeriod, null);
  assert.equal(lastNavigableWeek.period, "9999-12-19");
  assert.equal(lastNavigableWeek.nextPeriod, null);
});

test("past selections choose the first event, or their start day when empty", () => {
  const cards = buildAppearanceCards([dateAppearance("past-event", "2026-08-20")]);
  const withEvent = getAppearanceSchedule(cards, now, "month", { month: "2026-08" });
  const empty = getAppearanceSchedule([], now, "month", { month: "2026-08" });

  assert.equal(withEvent.title, "月の出演予定");
  assert.equal(withEvent.description, "日付を選ぶと、その日の出演情報を確認できます。");
  assert.equal(withEvent.calendar?.initialSelectedDay, "2026-08-20");
  assert.equal(empty.calendar?.initialSelectedDay, "2026-08-01");
});
