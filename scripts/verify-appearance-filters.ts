import assert from "node:assert/strict";

import {
  validateAppearanceImportItems,
  type Appearance,
} from "../src/domain/appearance";
import {
  createAppearanceFilterHref,
  filterAppearanceCards,
  getAppearanceFilterOptions,
  parseAppearanceFilters,
} from "../src/lib/appearance-filters";
import {
  appearanceHistoryPageSize,
  createAppearanceHistoryPageHref,
  getAppearanceHistoryPage,
  paginateAppearanceHistory,
} from "../src/lib/appearance-pagination";
import { appearanceSeriesSearchAliases } from "../src/lib/appearance-series-search-aliases";
import {
  buildAppearanceCards,
  formatAppearanceStart,
  groupAppearanceCards,
} from "../src/lib/appearances";
import { appearanceImportData } from "./appearance-import-data";
import { appearanceSeriesData } from "./appearance-series-data";

const seriesNames = new Map<string, string>(
  appearanceSeriesData.map((series) => [series.id, series.displayName]),
);

const appearances: Appearance[] = appearanceImportData.map((item) => ({
  ...item,
  startsAtPrecision: "exact",
  startsOn: null,
  seriesName: item.seriesId === null ? null : seriesNames.get(item.seriesId) ?? null,
  sourceUrls: [item.sourceUrl],
  collectedAt: "2026-09-02T00:00:00+09:00",
}));

function filtersFor(
  cards: ReturnType<typeof buildAppearanceCards>,
  values: Record<string, string | undefined>,
) {
  return parseAppearanceFilters(values, getAppearanceFilterOptions(cards));
}

const cards = buildAppearanceCards(appearances);
const options = getAppearanceFilterOptions(cards);

const gameAppearance: Appearance = {
  ...appearances[0],
  id: "game-category-verification",
  title: "ゲーム出演検証",
  seriesId: null,
  seriesName: null,
  eventGroupId: null,
  eventTitle: null,
  sessionLabel: null,
  category: "ゲーム",
};
const otherAppearance: Appearance = {
  ...gameAppearance,
  id: "other-category-verification",
  title: "その他出演検証",
  category: "その他",
};
const cardsWithAllCategories = buildAppearanceCards([
  ...appearances,
  gameAppearance,
  otherAppearance,
]);
const optionsWithAllCategories = getAppearanceFilterOptions(cardsWithAllCategories);

validateAppearanceImportItems(
  [{
    ...appearanceImportData[0],
    id: "game-category-validation",
    title: "ゲーム出演検証",
    seriesId: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
    category: "ゲーム",
    startsAtPrecision: "exact",
    startsOn: null,
  }],
  appearanceSeriesData,
);
assert.deepEqual(optionsWithAllCategories.categories, [
  "テレビ",
  "ラジオ",
  "配信",
  "イベント",
  "ゲーム",
  "その他",
]);
const game = filterAppearanceCards(
  cardsWithAllCategories,
  parseAppearanceFilters({ category: "ゲーム" }, optionsWithAllCategories),
);
assert.equal(game.length, 1);
assert.equal(game[0].category, "ゲーム");
assert.equal(
  filterAppearanceCards(
    cardsWithAllCategories,
    parseAppearanceFilters({ q: "ゲーム出演" }, optionsWithAllCategories),
  )[0]?.id,
  "appearance:game-category-verification",
);
assert.equal(
  createAppearanceFilterHref("/", "", {
    q: "",
    series: null,
    category: "ゲーム",
    year: null,
  }),
  "/?page=1&category=%E3%82%B2%E3%83%BC%E3%83%A0",
);

assert.equal(appearances.length, 120);
assert.equal(cards.length, 97);

const noFilters = filtersFor(cards, {});
assert.equal(filterAppearanceCards(cards, noFilters).length, 97);

const paginationCards = Array.from({ length: 61 }, (_, index) => ({
  ...cards[0],
  id: `pagination-card-${index + 1}`,
}));
assert.equal(appearanceHistoryPageSize, 30);
assert.deepEqual(getAppearanceHistoryPage(undefined, paginationCards.length), {
  page: 1,
  totalPages: 3,
});
assert.deepEqual(getAppearanceHistoryPage("2", paginationCards.length), {
  page: 2,
  totalPages: 3,
});
assert.deepEqual(getAppearanceHistoryPage("3", paginationCards.length), {
  page: 3,
  totalPages: 3,
});
assert.deepEqual(getAppearanceHistoryPage("0", paginationCards.length), {
  page: 1,
  totalPages: 3,
});
assert.deepEqual(getAppearanceHistoryPage("1.5", paginationCards.length), {
  page: 1,
  totalPages: 3,
});
assert.deepEqual(getAppearanceHistoryPage("999", paginationCards.length), {
  page: 3,
  totalPages: 3,
});
assert.deepEqual(getAppearanceHistoryPage("2", 0), { page: 1, totalPages: 1 });
assert.equal(paginateAppearanceHistory(paginationCards, 1).length, 30);
assert.equal(paginateAppearanceHistory(paginationCards, 2).length, 30);
assert.equal(paginateAppearanceHistory(paginationCards, 3).length, 1);
assert.deepEqual(
  paginateAppearanceHistory(paginationCards, 2).map((card) => card.id),
  paginationCards.slice(30, 60).map((card) => card.id),
);
assert.equal(
  createAppearanceHistoryPageHref("/", "q=%E3%83%86%E3%82%B9%E3%83%88&year=2026", 2),
  "/?q=%E3%83%86%E3%82%B9%E3%83%88&year=2026&page=2",
);
assert.equal(
  createAppearanceFilterHref("/", "page=3&utm_source=test", {
    q: "",
    series: null,
    category: null,
    year: null,
  }),
  "/?page=1&utm_source=test",
);

const hikaroom = filterAppearanceCards(cards, filtersFor(cards, { q: "ヒカROOM" }));
assert.ok(hikaroom.length > 0);
assert.ok(hikaroom.every((card) => card.seriesId === "hikaroom"));

const hikaroomAndDay = filterAppearanceCards(
  cards,
  filtersFor(cards, { q: "ヒカROOM DAY1" }),
);
assert.ok(hikaroomAndDay.every((card) => card.sessions.some((session) => session.sessionLabel === "DAY1")));

const gakumas = filterAppearanceCards(cards, filtersFor(cards, { q: "学マス" }));
assert.ok(gakumas.length > 0);
assert.ok(gakumas.every((card) => card.seriesId === "gakuen-idolmaster"));

const gakumasAndDay = filterAppearanceCards(
  cards,
  filtersFor(cards, { q: "学マス DAY1" }),
);
assert.ok(gakumasAndDay.length > 0);
assert.ok(gakumasAndDay.every((card) => card.seriesId === "gakuen-idolmaster"));
assert.ok(
  gakumasAndDay.every((card) =>
    card.title.includes("DAY1") ||
    card.sessions.some((session) => session.sessionLabel === "DAY1"),
  ),
);

const noSeries = filterAppearanceCards(
  cards,
  filtersFor(cards, { series: "_none" }),
);
assert.equal(noSeries.length, 2);
assert.ok(noSeries.every((card) => card.seriesId === null));

const radio = filterAppearanceCards(cards, filtersFor(cards, { category: "ラジオ" }));
assert.ok(radio.length > 0);
assert.ok(radio.every((card) => card.category === "ラジオ"));

const year2027 = filterAppearanceCards(cards, filtersFor(cards, { year: "2027" }));
assert.ok(year2027.length > 0);
assert.ok(
  year2027.every((card) =>
    card.sessions.some((session) =>
      session.startsAtPrecision === "exact" &&
      new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric" }).format(
        new Date(session.startsAt!),
      ) === "2027",
    ),
  ),
);

const invalid = filtersFor(cards, {
  series: "not-a-series",
  category: "不正なカテゴリ",
  year: "1999",
});
assert.deepEqual(invalid, { q: "", series: null, category: null, year: null });

const firstGroup = cards.find((card) => card.isGrouped)!;
const crossYearCards = buildAppearanceCards([
  {
    ...appearances[0],
    id: "cross-year-one",
    startsAt: "2026-12-31T23:00:00+09:00",
    eventGroupId: "cross-year",
    eventTitle: "年またぎイベント",
    sessionLabel: "DAY1",
  },
  {
    ...appearances[0],
    id: "cross-year-two",
    startsAt: "2027-01-01T01:00:00+09:00",
    eventGroupId: "cross-year",
    eventTitle: "年またぎイベント",
    sessionLabel: "DAY2",
  },
]);
const multipleSourcesCards = buildAppearanceCards([
  {
    ...appearances[0],
    id: "multiple-sources-primary",
    eventGroupId: "multiple-sources",
    eventTitle: "複数情報元イベント",
    sessionLabel: "DAY1",
    sourceUrls: ["https://x.com/example/status/primary", "https://x.com/example/status/secondary"],
    sourceUrl: "https://x.com/example/status/primary",
  },
  {
    ...appearances[0],
    id: "multiple-sources-grouped",
    eventGroupId: "multiple-sources",
    eventTitle: "複数情報元イベント",
    sessionLabel: "DAY2",
    sourceUrls: ["https://x.com/example/status/secondary", "https://x.com/example/status/third"],
    sourceUrl: "https://x.com/example/status/secondary",
  },
]);
assert.deepEqual(multipleSourcesCards[0].sourceUrls, [
  "https://x.com/example/status/primary",
  "https://x.com/example/status/secondary",
  "https://x.com/example/status/third",
]);
assert.equal(firstGroup.isGrouped, true);
const crossYearMatches = filterAppearanceCards(
  crossYearCards,
  filtersFor(crossYearCards, { year: "2027" }),
);
assert.equal(crossYearMatches.length, 1);
assert.equal(crossYearMatches[0].sessions.length, 2);

const grouped = groupAppearanceCards(filterAppearanceCards(cards, noFilters), new Date("2026-09-02T12:00:00+09:00"));
assert.equal(grouped.latest.length, 3);

const precisionAppearances: Appearance[] = [
  {
    ...appearances[0],
    id: "same-day-exact-late",
    startsAtPrecision: "exact",
    startsAt: "2026-09-17T18:00:00+09:00",
    startsOn: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
  },
  {
    ...appearances[0],
    id: "same-day-date",
    startsAtPrecision: "date",
    startsAt: null,
    startsOn: "2026-09-17",
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
  },
  {
    ...appearances[0],
    id: "same-day-exact-early",
    startsAtPrecision: "exact",
    startsAt: "2026-09-17T09:00:00+09:00",
    startsOn: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
  },
  {
    ...appearances[0],
    id: "unknown-b",
    startsAtPrecision: "unknown",
    startsAt: null,
    startsOn: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
  },
  {
    ...appearances[0],
    id: "unknown-a",
    startsAtPrecision: "unknown",
    startsAt: null,
    startsOn: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
  },
];
const precisionCards = buildAppearanceCards(precisionAppearances);
const precisionGrouped = groupAppearanceCards(
  precisionCards,
  new Date("2026-09-17T12:00:00+09:00"),
);
assert.deepEqual(
  precisionGrouped.upcoming.map((card) => card.sessions[0].id),
  [
    "same-day-date",
    "same-day-exact-late",
    "unknown-a",
    "unknown-b",
  ],
);
assert.deepEqual(
  precisionGrouped.past.map((card) => card.sessions[0].id),
  ["same-day-exact-early"],
);
const nextDayGrouped = groupAppearanceCards(
  precisionCards,
  new Date("2026-09-18T00:00:00+09:00"),
);
assert.ok(
  nextDayGrouped.past.some(
    (card) => card.sessions[0].id === "same-day-date",
  ),
);
assert.deepEqual(
  nextDayGrouped.upcoming.map((card) => card.sessions[0].id),
  ["unknown-a", "unknown-b"],
);
assert.equal(formatAppearanceStart(precisionAppearances[0]), "2026年9月17日(木) 18:00");
assert.equal(formatAppearanceStart(precisionAppearances[1]), "2026年9月17日");
assert.equal(formatAppearanceStart(precisionAppearances[3]), "日時未定");

const mixedGroupCards = buildAppearanceCards([
  {
    ...precisionAppearances[0],
    id: "mixed-exact-late",
    eventGroupId: "mixed-group",
    eventTitle: "精度混在イベント",
    sessionLabel: "夜公演",
  },
  {
    ...precisionAppearances[1],
    id: "mixed-date",
    eventGroupId: "mixed-group",
    eventTitle: "精度混在イベント",
    sessionLabel: "日付のみ",
  },
  {
    ...precisionAppearances[2],
    id: "mixed-exact-early",
    eventGroupId: "mixed-group",
    eventTitle: "精度混在イベント",
    sessionLabel: "朝公演",
  },
  {
    ...precisionAppearances[3],
    id: "mixed-unknown",
    eventGroupId: "mixed-group",
    eventTitle: "精度混在イベント",
    sessionLabel: "詳細未定",
  },
]);
assert.deepEqual(
  mixedGroupCards[0].sessions.map((session) => session.id),
  ["mixed-date", "mixed-exact-early", "mixed-exact-late", "mixed-unknown"],
);

const groupSortCards = buildAppearanceCards([
  {
    ...precisionAppearances[3],
    id: "all-unknown-b",
    eventGroupId: "all-unknown-group",
    eventTitle: "全公演未定イベント",
    sessionLabel: "公演B",
  },
  {
    ...precisionAppearances[3],
    id: "all-unknown-a",
    eventGroupId: "all-unknown-group",
    eventTitle: "全公演未定イベント",
    sessionLabel: "公演A",
  },
  ...mixedGroupCards.flatMap((card) =>
    card.sessions.map((session) => ({
      ...precisionAppearances[0],
      ...session,
      eventGroupId: "mixed-group-copy",
      eventTitle: "精度混在イベントのコピー",
    })),
  ),
]);
const groupSortUpcoming = groupAppearanceCards(
  groupSortCards,
  new Date("2026-09-17T12:00:00+09:00"),
).upcoming;
assert.deepEqual(
  groupSortUpcoming.map((card) => card.id),
  ["mixed-group-copy", "all-unknown-group"],
);
assert.deepEqual(
  groupSortUpcoming[1].sessions.map((session) => session.id),
  ["all-unknown-a", "all-unknown-b"],
);

const precisionYearCards = buildAppearanceCards([
  {
    ...precisionAppearances[0],
    id: "tokyo-2027",
    startsAt: "2026-12-31T16:00:00Z",
  },
  {
    ...precisionAppearances[1],
    id: "date-2026",
    startsOn: "2026-12-31",
  },
  precisionAppearances[3],
]);
const precisionYearOptions = getAppearanceFilterOptions(precisionYearCards);
assert.deepEqual(precisionYearOptions.years, ["2027", "2026"]);
assert.deepEqual(
  filterAppearanceCards(
    precisionYearCards,
    filtersFor(precisionYearCards, { year: "2026" }),
  ).map((card) => card.sessions[0].id),
  ["date-2026"],
);
assert.equal(
  filterAppearanceCards(
    precisionYearCards,
    filtersFor(precisionYearCards, { year: "2027" }),
  )[0]?.sessions[0].id,
  "tokyo-2027",
);
assert.equal(
  filterAppearanceCards(precisionYearCards, filtersFor(precisionYearCards, {}))
    .length,
  3,
);

validateAppearanceImportItems(
  precisionAppearances.map((item, index) => ({
    ...item,
    sourceName: appearanceImportData[0].sourceName,
    sourceItemId: `precision-${index}`,
    seriesId: null,
  })),
  appearanceSeriesData,
);
assert.throws(
  () =>
    validateAppearanceImportItems(
      [{
        ...appearanceImportData[0],
        id: "invalid-date-precision",
        startsAtPrecision: "date",
        startsAt: appearanceImportData[0].startsAt,
        startsOn: "2026-09-17",
      }],
      appearanceSeriesData,
    ),
  /date startsAtPrecision requires startsOn only/,
);

assert.equal(
  createAppearanceFilterHref("/", "utm_source=test&year=2025", {
    q: "ヒカROOM",
    series: "hikaroom",
    category: "配信",
    year: "2026",
  }),
  "/?utm_source=test&page=1&q=%E3%83%92%E3%82%ABROOM&series=hikaroom&category=%E9%85%8D%E4%BF%A1&year=2026",
);

assert.ok(options.series.some((option) => option.value === "hikaroom"));

for (const [seriesId, aliases] of Object.entries(appearanceSeriesSearchAliases)) {
  assert.ok(seriesNames.has(seriesId), `${seriesId}: unknown series alias key.`);
  assert.ok(aliases.length > 0, `${seriesId}: aliases must not be empty.`);
  const normalizedAliases = aliases.map((alias) => alias.normalize("NFKC").toLocaleLowerCase("ja-JP"));
  assert.ok(aliases.every((alias) => alias.trim().length > 0), `${seriesId}: alias must not be empty.`);
  assert.equal(
    new Set(normalizedAliases).size,
    aliases.length,
    `${seriesId}: aliases must not duplicate after normalization.`,
  );

  for (const alias of aliases) {
    const matches = filterAppearanceCards(cards, filtersFor(cards, { q: alias }));
    assert.ok(matches.length > 0, `${seriesId}: ${alias} must match cards.`);
    assert.ok(
      matches.every((card) => card.seriesId === seriesId),
      `${seriesId}: ${alias} must not match another series.`,
    );
  }
}
console.log("Verified appearance filter logic and navigation behavior.");
