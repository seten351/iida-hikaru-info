import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { Appearance } from "../src/domain/appearance";
import { sameGuestInfo } from "../src/domain/appearance-guests";
import { AppearanceCalendar } from "../src/app/appearance-calendar";
import { AppearanceCard } from "../src/app/appearance-card";
import { getCalendarGuestMarker } from "../src/app/appearance-guest-info";
import { HomeHighlights } from "../src/app/home-highlights";
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

test("all public presentations show only confirmed guest roles and other guest names", () => {
  for (const isHikaruGuest of [false, null, true] as const) {
    for (const guestNames of [[], ["青木さん", "佐藤さん"]]) {
      const card = buildAppearanceCards([
        appearance("role", { guestInfo: { isHikaruGuest, guestNames } }),
      ])[0];
      const calendar = getAppearanceSchedule([card], new Date("2026-10-10T00:00:00+09:00"), "month", { month: "2026-10" }).calendar!;
      const markups = [
        renderToStaticMarkup(<AppearanceCard item={card} />),
        renderToStaticMarkup(<AppearanceCard item={card} agenda />),
        renderToStaticMarkup(<LatestAppearanceList items={[card]} />),
        renderToStaticMarkup(<HomeHighlights latest={[card]} deadlines={[]} now="2026-10-01T00:00:00+09:00" filters={noFilters} isFiltering={false} />),
        renderToStaticMarkup(<AppearanceCalendar calendar={calendar} availableYears={["2026"]} onPeriodChange={() => {}} emptyMessage="空" />),
      ];
      for (const markup of markups) {
        assert.equal(markup.includes("ゲスト出演"), isHikaruGuest === true);
        assert.equal(markup.includes("ゲスト：青木さん・佐藤さん"), guestNames.length > 0);
        assert.doesNotMatch(markup, /通常出演|ゲストではない|未確認|ゲストあり|ゲスト情報あり/);
      }
    }
  }
});

test("false and null produce identical public markup while preserving distinct stored roles", () => {
  for (const guestNames of [[], ["青木さん"]]) {
    const confirmed = { isHikaruGuest: false, guestNames };
    const unconfirmed = { isHikaruGuest: null, guestNames };
    assert.equal(sameGuestInfo(confirmed, unconfirmed), false);
    const makeCard = (info: typeof confirmed | typeof unconfirmed) => buildAppearanceCards([
      appearance("role", { guestInfo: info }),
    ])[0];
    assert.equal(
      renderToStaticMarkup(<AppearanceCard item={makeCard(confirmed)} />),
      renderToStaticMarkup(<AppearanceCard item={makeCard(unconfirmed)} />),
    );
    const grouped = buildAppearanceCards([
      appearance("first", { eventGroupId: "group", eventTitle: "複数公演", sessionLabel: "昼公演", guestInfo: confirmed }),
      appearance("second", { eventGroupId: "group", eventTitle: "複数公演", sessionLabel: "夜公演", guestInfo: unconfirmed }),
    ])[0];
    const markup = renderToStaticMarkup(<AppearanceCard item={grouped} />);
    assert.doesNotMatch(markup, /公演ごとのゲスト情報/);
    assert.equal((markup.match(/ゲスト：青木さん/g) ?? []).length, guestNames.length);
    assert.deepEqual(grouped.sessions.map(session => session.guestInfo?.isHikaruGuest), [false, null]);
  }
});

test("calendar summaries combine visible roles and unique guest names across sessions", () => {
  const cards = buildAppearanceCards([
    appearance("one", { guestInfo: { isHikaruGuest: true, guestNames: ["青木さん"] } }),
    appearance("two", { guestInfo: { isHikaruGuest: false, guestNames: ["青木さん", "佐藤さん"] } }),
    appearance("three", { guestInfo: { isHikaruGuest: null, guestNames: [] } }),
  ]);
  assert.equal(getCalendarGuestMarker(cards.flatMap(card => card.sessions)), "ゲスト出演・ゲスト：青木さん・佐藤さん");
  assert.equal(getCalendarGuestMarker([]), null);
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

  assert.match(markup, /ゲスト出演・ゲスト：青木さん/);
  assert.ok(markup.includes(`aria-label="${day.label}、出演情報2件、締切0件、配信、ゲスト出演・ゲスト：青木さん`));
  assert.doesNotMatch(markup, /class="appearance-calendar__count"/);
});
