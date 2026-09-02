import assert from "node:assert/strict";

import type { Appearance } from "../src/domain/appearance";
import {
  createAppearanceFilterHref,
  filterAppearanceCards,
  getAppearanceFilterOptions,
  parseAppearanceFilters,
} from "../src/lib/appearance-filters";
import { appearanceSeriesSearchAliases } from "../src/lib/appearance-series-search-aliases";
import {
  buildAppearanceCards,
  groupAppearanceCards,
} from "../src/lib/appearances";
import { appearanceImportData } from "./appearance-import-data";
import { appearanceSeriesData } from "./appearance-series-data";

const seriesNames = new Map<string, string>(
  appearanceSeriesData.map((series) => [series.id, series.displayName]),
);

const appearances: Appearance[] = appearanceImportData.map((item) => ({
  ...item,
  seriesName: item.seriesId === null ? null : seriesNames.get(item.seriesId) ?? null,
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

assert.equal(appearances.length, 120);
assert.equal(cards.length, 97);

const noFilters = filtersFor(cards, {});
assert.equal(filterAppearanceCards(cards, noFilters).length, 97);

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
      new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric" }).format(
        new Date(session.startsAt),
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
assert.equal(firstGroup.isGrouped, true);
const crossYearMatches = filterAppearanceCards(
  crossYearCards,
  filtersFor(crossYearCards, { year: "2027" }),
);
assert.equal(crossYearMatches.length, 1);
assert.equal(crossYearMatches[0].sessions.length, 2);

const grouped = groupAppearanceCards(filterAppearanceCards(cards, noFilters), new Date("2026-09-02T12:00:00+09:00"));
assert.equal(grouped.latest.length, 3);

assert.equal(
  createAppearanceFilterHref("/", "utm_source=test&year=2025", {
    q: "ヒカROOM",
    series: "hikaroom",
    category: "配信",
    year: "2026",
  }),
  "/?utm_source=test&q=%E3%83%92%E3%82%ABROOM&series=hikaroom&category=%E9%85%8D%E4%BF%A1&year=2026",
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
