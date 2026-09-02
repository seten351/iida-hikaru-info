"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  createAppearanceFilterHref,
  getAppearanceFilterNavigation,
  hasAppearanceFilters,
  type AppearanceFilterOptions,
  type AppearanceFilters,
} from "@/lib/appearance-filters";

type AppearanceFiltersProps = {
  filters: AppearanceFilters;
  options: AppearanceFilterOptions;
  totalCount: number;
  matchedCount: number;
};

const queryDebounceMs = 300;

export function AppearanceFilters({
  filters,
  options,
  totalCount,
  matchedCount,
}: AppearanceFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localFilters, setLocalFilters] = useState(filters);
  const [isPending, startTransition] = useTransition();
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearQueryTimer = useCallback(() => {
    if (queryTimer.current !== null) {
      clearTimeout(queryTimer.current);
      queryTimer.current = null;
    }
  }, []);

  useEffect(() => clearQueryTimer, [clearQueryTimer]);

  const navigate = useCallback(
    (
      nextFilters: AppearanceFilters,
      change: "query" | "facet" | "clear",
    ) => {
      const href = createAppearanceFilterHref(
        pathname,
        searchParams.toString(),
        nextFilters,
      );
      const method = getAppearanceFilterNavigation(change);

      startTransition(() => {
        router[method](href, { scroll: false });
      });
    },
    [pathname, router, searchParams, startTransition],
  );

  const updateQuery = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFilters = { ...localFilters, q: event.target.value.slice(0, 100) };
    setLocalFilters(nextFilters);
    clearQueryTimer();
    queryTimer.current = setTimeout(() => {
      navigate(nextFilters, "query");
      queryTimer.current = null;
    }, queryDebounceMs);
  };

  const updateFacet = (
    key: "series" | "category" | "year",
    value: string,
  ) => {
    clearQueryTimer();
    const nextFilters = { ...localFilters, [key]: value || null } as AppearanceFilters;
    setLocalFilters(nextFilters);
    navigate(nextFilters, "facet");
  };

  const clearFilters = () => {
    clearQueryTimer();
    const nextFilters: AppearanceFilters = {
      q: "",
      series: null,
      category: null,
      year: null,
    };
    setLocalFilters(nextFilters);
    navigate(nextFilters, "clear");
  };

  const submitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearQueryTimer();
    navigate(localFilters, "query");
  };

  const active = hasAppearanceFilters(localFilters);

  return (
    <section className="appearance-filters" aria-labelledby="filters-heading">
      <div className="appearance-filters__heading">
        <div>
          <p className="eyebrow">SEARCH & FILTER</p>
          <h2 id="filters-heading">出演情報を探す</h2>
        </div>
        <p aria-live="polite" aria-atomic="true">
          {isPending ? "検索条件を更新中…" : `全${totalCount}件中 ${matchedCount}件`}
        </p>
      </div>

      <form
        className="appearance-filter-form"
        role="search"
        aria-busy={isPending}
        onSubmit={submitQuery}
      >
        <label className="appearance-filter-field appearance-filter-field--query">
          <span>フリーワード</span>
          <input
            type="search"
            value={localFilters.q}
            onChange={updateQuery}
            maxLength={100}
            placeholder="番組名・イベント名など"
          />
        </label>

        <label className="appearance-filter-field">
          <span>シリーズ</span>
          <select
            value={localFilters.series ?? ""}
            onChange={(event) => updateFacet("series", event.target.value)}
          >
            <option value="">すべて</option>
            {options.series.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="appearance-filter-field">
          <span>カテゴリ</span>
          <select
            value={localFilters.category ?? ""}
            onChange={(event) => updateFacet("category", event.target.value)}
          >
            <option value="">すべて</option>
            {options.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="appearance-filter-field">
          <span>年</span>
          <select
            value={localFilters.year ?? ""}
            onChange={(event) => updateFacet("year", event.target.value)}
          >
            <option value="">すべて</option>
            {options.years.map((year) => (
              <option key={year} value={year}>
                {year}年
              </option>
            ))}
          </select>
        </label>

        <button
          className="appearance-filter-clear"
          type="button"
          disabled={!active}
          onClick={clearFilters}
        >
          条件をクリア
        </button>
      </form>
    </section>
  );
}
