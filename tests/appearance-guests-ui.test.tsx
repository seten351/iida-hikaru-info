import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { Appearance } from "../src/domain/appearance";
import { AppearanceCalendar } from "../src/app/appearance-calendar";
import { AppearanceCard } from "../src/app/appearance-card";
import { LatestAppearanceList } from "../src/app/latest-appearance-list";
import { getAppearanceSchedule } from "../src/lib/appearance-schedule";
import { buildAppearanceCards } from "../src/lib/appearances";
import { filterAppearanceCards } from "../src/lib/appearance-filters";

const common = {
  startsAtPrecision: "date" as const,
  startsAt: null,
  startsOn: "2026-10-10",
  title: "ゲスト回の番組",
  seriesId: null,
  seriesName: null,
  eventGroupId: null,
  eventTitle: null,
  sessionLabel: null,
  category: "配信" as const,
  sourceUrls: ["https://example.com/announcement"],
  sourceUrl: "https://example.com/announcement",
  publishedAtPrecision: "exact" as const,
  publishedAt: "2026-09-20T12:00:00+09:00",
  publishedOn: null,
  collectedAt: "2026-09-20T12:00:00+09:00",
};

function appearance(id: string, overrides: Partial<Appearance> = {}): Appearance {
  return { ...common, id, ...overrides };
}

const noFilters = { q: "", series: null, category: null, year: null } as const;

test("unconfirmed guest info leaves existing public markup unchanged", () => {
  const card = buildAppearanceCards([appearance("plain")])[0];
  const markup = renderToStaticMarkup(<AppearanceCard item={card} />);
  assert.doesNotMatch(markup, /ゲスト出演|ゲスト：|appearance-guest-info/);
});

test("cards and latest list consistently show Hikaru and multiple other guests", () => {
  const card = buildAppearanceCards([
    appearance("both", {
      guestInfo: { isHikaruGuest: true, guestNames: ["青木さん", "佐藤さん"] },
    }),
  ])[0];
  const cardMarkup = renderToStaticMarkup(<AppearanceCard item={card} />);
  const latestMarkup = renderToStaticMarkup(<LatestAppearanceList items={[card]} />);

  for (const markup of [cardMarkup, latestMarkup]) {
    assert.match(markup, /ゲスト出演/);
    assert.match(markup, /ゲスト：青木さん・佐藤さん/);
  }
});

test("grouped sessions retain per-session guest assignments after date projection", () => {
  const appearances = [
    appearance("first", {
      startsOn: "2026-10-10",
      eventGroupId: "group",
      eventTitle: "複数公演",
      sessionLabel: "昼公演",
      guestInfo: { isHikaruGuest: true, guestNames: [] },
    }),
    appearance("second", {
      startsOn: "2026-10-11",
      eventGroupId: "group",
      eventTitle: "複数公演",
      sessionLabel: "夜公演",
      guestInfo: { isHikaruGuest: false, guestNames: ["青木さん"] },
    }),
  ];
  const cards = buildAppearanceCards(appearances);
  const schedule = getAppearanceSchedule(cards, new Date("2026-10-01T00:00:00+09:00"), "month", { month: "2026-10" });
  const firstDay = schedule.calendar!.weeks.flat().find((day) => day?.date === "2026-10-10")!;
  const secondDay = schedule.calendar!.weeks.flat().find((day) => day?.date === "2026-10-11")!;

  assert.deepEqual(firstDay.items[0].sessions.map((session) => session.id), ["first"]);
  assert.deepEqual(secondDay.items[0].sessions.map((session) => session.id), ["second"]);
  const fullCard = renderToStaticMarkup(<AppearanceCard item={cards[0]} />);
  assert.match(fullCard, /昼公演/);
  assert.match(fullCard, /夜公演/);
  assert.match(fullCard, /公演ごとのゲスト情報/);
  assert.match(fullCard, /ゲスト出演/);
  assert.match(fullCard, /ゲスト：青木さん/);
});

test("guest names and the Hikaru guest label participate in keyword search", () => {
  const cards = buildAppearanceCards([
    appearance("guest-name", { guestInfo: { isHikaruGuest: false, guestNames: ["夜見れな"] } }),
    appearance("hikaru", { title: "特別番組", guestInfo: { isHikaruGuest: true, guestNames: [] } }),
    appearance("plain", { title: "通常番組" }),
  ]);

  assert.deepEqual(filterAppearanceCards(cards, { ...noFilters, q: "夜見れな" }).map((card) => card.id), ["appearance:guest-name"]);
  assert.deepEqual(filterAppearanceCards(cards, { ...noFilters, q: "ゲスト出演" }).map((card) => card.id), ["appearance:hikaru"]);
});

test("calendar displays an accessible guest marker based on all visible sessions", () => {
  const cards = buildAppearanceCards([
    appearance("one", { guestInfo: { isHikaruGuest: true, guestNames: [] } }),
    appearance("two", { title: "共演番組", guestInfo: { isHikaruGuest: false, guestNames: ["青木さん"] } }),
  ]);
  const calendar = getAppearanceSchedule(cards, new Date("2026-10-01T00:00:00+09:00"), "month", { month: "2026-10" }).calendar!;
  const day = calendar.weeks.flat().find((item) => item?.date === "2026-10-10")!;
  const markup = renderToStaticMarkup(
    <AppearanceCalendar calendar={calendar} availableYears={["2026"]} onPeriodChange={() => {}} emptyMessage="空" />,
  );

  assert.match(markup, /ゲスト情報あり/);
  assert.ok(markup.includes(`aria-label="${day.label}、出演情報2件、締切0件、配信、ゲスト情報あり`));
});
