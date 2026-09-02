import {
  appearanceCategories,
  type AppearanceCategory,
} from "@/domain/appearance";
import type { AppearanceCard } from "@/lib/appearances";

export const appearanceFilterSearchParamKeys = [
  "q",
  "series",
  "category",
  "year",
] as const;

export type AppearanceFilters = {
  q: string;
  series: string | null;
  category: AppearanceCategory | null;
  year: string | null;
};

export type AppearanceFilterOptions = {
  series: Array<{ value: string; label: string }>;
  categories: AppearanceCategory[];
  years: string[];
};

export type AppearanceFilterNavigation = "push" | "replace";

type SearchParamValue = string | string[] | undefined;
type AppearanceSearchParams = Record<string, SearchParamValue>;

const noSeriesValue = "_none";
const searchQueryMaxLength = 100;
const whitespacePattern = /\s+/;

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTokyoYear(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP");
}

export function normalizeAppearanceQuery(value: string | undefined) {
  return (value ?? "").trim().slice(0, searchQueryMaxLength);
}

export function getAppearanceFilterOptions(
  cards: AppearanceCard[],
): AppearanceFilterOptions {
  const seriesById = new Map<string, string>();
  const categories = new Set<AppearanceCategory>();
  const years = new Set<string>();
  let hasUnassignedSeries = false;

  for (const card of cards) {
    if (card.seriesId === null || card.seriesName === null) {
      hasUnassignedSeries = true;
    } else {
      seriesById.set(card.seriesId, card.seriesName);
    }

    categories.add(card.category);
    for (const session of card.sessions) {
      years.add(formatTokyoYear(session.startsAt));
    }
  }

  const series = [...seriesById]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));

  if (hasUnassignedSeries) {
    series.push({ value: noSeriesValue, label: "シリーズなし" });
  }

  return {
    series,
    categories: appearanceCategories.filter((category) => categories.has(category)),
    years: [...years].sort((a, b) => b.localeCompare(a)),
  };
}

export function parseAppearanceFilters(
  searchParams: AppearanceSearchParams,
  options: AppearanceFilterOptions,
): AppearanceFilters {
  const series = firstSearchParam(searchParams.series);
  const category = firstSearchParam(searchParams.category);
  const year = firstSearchParam(searchParams.year);

  return {
    q: normalizeAppearanceQuery(firstSearchParam(searchParams.q)),
    series: options.series.some((option) => option.value === series)
      ? series!
      : null,
    category: options.categories.includes(category as AppearanceCategory)
      ? (category as AppearanceCategory)
      : null,
    year: options.years.includes(year ?? "") ? year! : null,
  };
}

export function hasAppearanceFilters(filters: AppearanceFilters) {
  return (
    filters.q.length > 0 ||
    filters.series !== null ||
    filters.category !== null ||
    filters.year !== null
  );
}

export function filterAppearanceCards(
  cards: AppearanceCard[],
  filters: AppearanceFilters,
) {
  const queryTerms = normalizeSearchText(filters.q)
    .split(whitespacePattern)
    .filter(Boolean);

  return cards.filter((card) => {
    if (
      filters.series !== null &&
      (card.seriesId ?? noSeriesValue) !== filters.series
    ) {
      return false;
    }

    if (filters.category !== null && card.category !== filters.category) {
      return false;
    }

    if (
      filters.year !== null &&
      !card.sessions.some(
        (session) => formatTokyoYear(session.startsAt) === filters.year,
      )
    ) {
      return false;
    }

    if (queryTerms.length === 0) {
      return true;
    }

    const searchableText = normalizeSearchText(
      [
        card.title,
        card.seriesName,
        ...card.sessions.map((session) => session.sessionLabel),
      ]
        .filter((value): value is string => value !== null)
        .join(" "),
    );

    return queryTerms.every((term) => searchableText.includes(term));
  });
}

export function createAppearanceFilterHref(
  pathname: string,
  currentSearchParams: string,
  filters: AppearanceFilters,
) {
  const searchParams = new URLSearchParams(currentSearchParams);

  for (const key of appearanceFilterSearchParamKeys) {
    searchParams.delete(key);
  }

  if (filters.q) {
    searchParams.set("q", filters.q);
  }
  if (filters.series) {
    searchParams.set("series", filters.series);
  }
  if (filters.category) {
    searchParams.set("category", filters.category);
  }
  if (filters.year) {
    searchParams.set("year", filters.year);
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function getAppearanceFilterNavigation(
  change: "query" | "facet" | "clear",
): AppearanceFilterNavigation {
  return change === "query" ? "replace" : "push";
}

export const appearanceNoSeriesValue = noSeriesValue;
