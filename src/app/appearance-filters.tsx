"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  createAppearanceFilterHref,
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

export function AppearanceFilters({
  filters,
  options,
  totalCount,
  matchedCount,
}: AppearanceFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draftFilters, setDraftFilters] = useState(filters);
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (nextFilters: AppearanceFilters) => {
      const href = createAppearanceFilterHref(
        pathname,
        searchParams.toString(),
        nextFilters,
      );

      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [pathname, router, searchParams, startTransition],
  );

  const updateQuery = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftFilters((current) => ({
      ...current,
      q: event.target.value.slice(0, 100),
    }));
  };

  const updateFacet = (
    key: "series" | "category" | "year",
    value: string,
  ) => {
    setDraftFilters(
      (current) => ({ ...current, [key]: value || null }) as AppearanceFilters,
    );
  };

  const clearFilters = () => {
    const nextFilters: AppearanceFilters = {
      q: "",
      series: null,
      category: null,
      year: null,
    };
    setDraftFilters(nextFilters);
    navigate(nextFilters);
  };

  const submitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(draftFilters);
  };

  const active = hasAppearanceFilters(draftFilters);

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
            value={draftFilters.q}
            onChange={updateQuery}
            maxLength={100}
            placeholder="番組名・イベント名など"
            disabled={isPending}
          />
        </label>

        <label className="appearance-filter-field">
          <span>シリーズ</span>
          <select
            value={draftFilters.series ?? ""}
            onChange={(event) => updateFacet("series", event.target.value)}
            disabled={isPending}
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
            value={draftFilters.category ?? ""}
            onChange={(event) => updateFacet("category", event.target.value)}
            disabled={isPending}
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
            value={draftFilters.year ?? ""}
            onChange={(event) => updateFacet("year", event.target.value)}
            disabled={isPending}
          >
            <option value="">すべて</option>
            {options.years.map((year) => (
              <option key={year} value={year}>
                {year}年
              </option>
            ))}
          </select>
        </label>

        <div className="appearance-filter-actions">
          <button
            className="appearance-filter-search"
            type="submit"
            disabled={isPending}
          >
            検索
          </button>
          <button
            className="appearance-filter-clear"
            type="button"
            disabled={isPending || !active}
            onClick={clearFilters}
          >
            条件をクリア
          </button>
        </div>
      </form>
    </section>
  );
}
