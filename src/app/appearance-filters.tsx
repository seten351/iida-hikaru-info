"use client";

import { receptionInformationTypes, receptionInformationTypeLabels, type Deadline } from "@/domain/deadline";

import { useDeadlineNow } from "@/app/deadline-clock";
import { filterDeadlines } from "@/lib/deadlines";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useId,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  createAppearanceFilterHref,
  hasReceptionFilters,
  type AppearanceFilterOptions,
  type AppearanceFilters,
} from "@/lib/appearance-filters";
import { getDeadlineListItems, type DeadlineListView } from "@/lib/reception-presentation";

const receptionStatusLabels = { not_open: "受付前・販売前", open: "受付中・販売中", start_today: "本日開始・時刻未確認", end_today: "本日締切・販売終了", expired: "期限経過", closed: "終了", sold_out: "完売", cancelled: "中止", unknown: "状況未確認" };

type AppearanceFiltersProps = {
  filters: AppearanceFilters;
  options: AppearanceFilterOptions;
  totalCount: number;
  matchedCount: number;
  deadlineTotalCount?: number;
  deadlineMatchedCount?: number;
  deadlineItems?: Deadline[];
  now?: string;
  target?: "all" | "news" | "deadlines";
  deadlineView?: DeadlineListView;
};

export function AppearanceFilters({
  filters,
  options,
  totalCount,
  matchedCount,
  deadlineTotalCount = 0,
  deadlineMatchedCount = 0,
  deadlineItems,
  now = "1970-01-01T00:00:00Z",
  target = "all",
  deadlineView,
}: AppearanceFiltersProps) {
  const currentTime = useDeadlineNow(now);
  const matchingDeadlines = deadlineItems ? filterDeadlines(deadlineItems, filters, currentTime) : null;
  const currentDeadlineMatchedCount = matchingDeadlines ? (deadlineView ? getDeadlineListItems(matchingDeadlines, currentTime, deadlineView) : matchingDeadlines).length : deadlineMatchedCount;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draftFilters, setDraftFilters] = useState(filters);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(filters.series || filters.category || filters.year || filters.receptionType || filters.receptionStatus));
  const detailsId = useId();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (nextFilters: AppearanceFilters, clear = false) => {
      const params = new URLSearchParams(searchParams.toString());
      if (clear) params.delete("receptionView");
      const href = createAppearanceFilterHref(
        pathname,
        params.toString(),
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
    key: "series" | "category" | "year" | "receptionType" | "receptionStatus",
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
    navigate(nextFilters, true);
  };

  const submitQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(draftFilters);
  };

  const active = hasReceptionFilters(draftFilters);
  const canClear = active || Boolean(deadlineView && deadlineView !== "active");
  const appliedConditions = [filters.q && `キーワード：${filters.q}`, filters.series && `シリーズ：${options.series.find(option => option.value === filters.series)?.label ?? filters.series}`, filters.category, filters.year && `${filters.year}年`, filters.receptionType && receptionInformationTypeLabels[filters.receptionType], filters.receptionStatus && `状態：${receptionStatusLabels[filters.receptionStatus]}`].filter(Boolean);

  return (
    <section className="appearance-filters" aria-labelledby="filters-heading">
      <div className="appearance-filters__heading">
        <div>
          <p className="eyebrow">SEARCH & FILTER</p>
          <h2 id="filters-heading">{target === "news" ? "新着情報を探す" : target === "deadlines" ? "受付・販売情報を探す" : "出演・受付・販売を探す"}</h2>
        </div>
        <p aria-live="polite" aria-atomic="true">
          {isPending ? "検索条件を更新中…" : target === "news" ? `新着 ${matchedCount} / ${totalCount}件` : target === "deadlines" ? `受付・販売 ${currentDeadlineMatchedCount} / ${deadlineTotalCount}件` : `出演 ${matchedCount} / ${totalCount}件・受付・販売 ${currentDeadlineMatchedCount} / ${deadlineTotalCount}件`}
        </p>
      </div>
      {appliedConditions.length > 0 && <p className="appearance-filters__applied" aria-label="適用中の検索条件">{appliedConditions.join(" / ")}</p>}

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
            placeholder="番組名・企画名・主催者など"
            disabled={isPending}
          />
        </label>

        <button className="appearance-filter-search appearance-filter-primary-search" type="submit" disabled={isPending}>検索</button>
        <div className="appearance-filter-disclosure">
          <button type="button" className="appearance-filter-details-toggle" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(value => !value)}>詳しく絞る <span aria-hidden="true">{detailsOpen ? "−" : "＋"}</span></button>
          <button className="appearance-filter-clear" type="button" disabled={isPending || !canClear} onClick={clearFilters}>条件をクリア</button>
        </div>
        <div className="appearance-filter-details" id={detailsId} data-expanded={detailsOpen}>

        <div className="appearance-filter-facets">
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
        </div>

        {target !== "news" && <div className="appearance-filter-facets">
          <label className="appearance-filter-field"><span>受付・販売種別</span><select value={draftFilters.receptionType ?? ""} onChange={event => updateFacet("receptionType", event.target.value)} disabled={isPending}><option value="">すべて</option>{receptionInformationTypes.map(type => <option key={type} value={type}>{receptionInformationTypeLabels[type]}</option>)}</select></label>
          <label className="appearance-filter-field"><span>受付・販売状況</span><select value={draftFilters.receptionStatus ?? ""} onChange={event => updateFacet("receptionStatus", event.target.value)} disabled={isPending}><option value="">すべて</option><option value="not_open">受付前・販売前</option><option value="open">受付中・販売中</option><option value="start_today">本日開始・時刻未確認</option><option value="end_today">本日締切・販売終了</option><option value="expired">期限経過</option><option value="closed">終了</option><option value="sold_out">完売</option><option value="cancelled">中止</option><option value="unknown">状況未確認</option></select></label>
        </div>}

        <div className="appearance-filter-actions-row">
          <label className="appearance-filter-field">
            <span>{target === "news" ? "年（出演年）" : target === "deadlines" ? "年（終了年・開始年）" : "年（出演年・終了年・開始年）"}</span>
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
              disabled={isPending || !canClear}
              onClick={clearFilters}
            >
              条件をクリア
            </button>
          </div>
        </div>
        </div>
      </form>
    </section>
  );
}
