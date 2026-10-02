import type { Deadline } from "@/domain/deadline";
import { DeadlineClockProvider } from "@/app/deadline-clock";
import { HomeHighlights } from "@/app/home-highlights";
import { SiteHeader, SiteFooter } from "@/app/site-chrome";
import { ListPagination } from "@/app/list-pagination";
import { filterDeadlines, extendDeadlineFilterOptions } from "@/lib/deadlines";
import { Suspense } from "react";
import { connection } from "next/server";

import { AppearanceFilters } from "@/app/appearance-filters";
import { AppearanceCard } from "@/app/appearance-card";
import { AppearanceScheduleSection } from "@/app/appearance-schedule-section";
import {
  type AppearanceCard as AppearanceCardData,
  buildAppearanceCards,
  formatUpdatedAt,
  groupAppearanceCards,
} from "@/lib/appearances";
import {
  filterAppearanceCards,
  getAppearanceFilterOptions,
  hasAppearanceFilters,
  parseAppearanceFilters,
} from "@/lib/appearance-filters";
import {
  getAppearanceHistoryPage,
  paginateAppearanceHistory,
} from "@/lib/appearance-pagination";
import { parseAppearanceScheduleView } from "@/lib/appearance-schedule";
import { getPublicPageData } from "@/server/public-cache/reader";

type AppearanceSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  items: AppearanceCardData[];
  emptyMessage: string;
  featured?: boolean;
  deadlines?: Deadline[];
  now?: string;
};

function AppearanceSection({
  id,
  eyebrow,
  title,
  description,
  items,
  emptyMessage,
  featured = false,
  deadlines = [],
  now,
}: AppearanceSectionProps) {
  return (
    <section
      className={`appearance-section${featured ? " appearance-section--featured" : ""}`}
      id={id}
      aria-labelledby={`${id}-heading`}
    >
      <header className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={`${id}-heading`}>{title}</h2>
        </div>
        <p>{description}</p>
      </header>

      {items.length > 0 ? (
        <div className="appearance-grid">
          {items.map((item) => (
            <AppearanceCard item={item} key={item.id} deadlines={deadlines} now={now} />
          ))}
        </div>
      ) : (
        <p className="empty-state">{emptyMessage}</p>
      )}
    </section>
  );
}

async function HomeContent(props: PageProps<"/">) {
  await connection();

  const now = new Date();
  const [searchParams, { appearances, deadlines, lastUpdatedAt }] = await Promise.all([
    props.searchParams,
    getPublicPageData(),
  ]);
  const cards = buildAppearanceCards(appearances);
  const filterOptions = extendDeadlineFilterOptions(getAppearanceFilterOptions(cards), deadlines);
  const filters = parseAppearanceFilters(searchParams, filterOptions);
  const filteredDeadlines = filterDeadlines(deadlines, filters, now);
  const deadlineCandidates = filterDeadlines(deadlines, { ...filters, receptionStatus: null }, now);
  const filteredCards = filterAppearanceCards(cards, filters);
  const { latest, upcoming, past } = groupAppearanceCards(filteredCards, now);
  const scheduleView = parseAppearanceScheduleView(searchParams.view);
  const { page, totalPages } = getAppearanceHistoryPage(searchParams.page, past.length);
  const paginatedPast = paginateAppearanceHistory(past, page);
  const currentSearchParams = new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map((item) => [key, item])
        : value === undefined
          ? []
          : [[key, value]],
    ),
  ).toString();
  const isFiltering = hasAppearanceFilters(filters);
  const noMatchingMessage = "条件に一致する出演情報はありません。";

  return (
    <DeadlineClockProvider now={now.toISOString()}>
    <main>
      <SiteHeader home />

      <div id="top" className="page-shell">
        <section className="intro" aria-labelledby="page-title">
          <div className="intro__copy">
            <p className="eyebrow">IIDA HIKARU INFORMATION</p>
            <h1 id="page-title">
              飯田ヒカルさんの
              <span>出演情報をひとつに。</span>
            </h1>
            <p className="intro__lead">
              これからの出演予定と、これまでの活動を見やすくまとめてお届けします。
            </p>
          </div>
          <div className="intro__status" aria-label="掲載情報について">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>日本時間で更新</strong>
              <p>
                {lastUpdatedAt
                  ? `${formatUpdatedAt(new Date(lastUpdatedAt))} 最終DB更新`
                  : "更新情報はまだありません"}
              </p>
            </div>
          </div>
        </section>

        <Suspense
          fallback={<div className="appearance-filters appearance-filters--loading" />}
        >
          <AppearanceFilters
            key={[filters.q, filters.series, filters.category, filters.year, filters.receptionType, filters.receptionStatus].join("\u0000")}
            filters={filters}
            options={filterOptions}
            totalCount={cards.length}
            matchedCount={filteredCards.length}
            deadlineItems={deadlineCandidates}
            now={now.toISOString()}
            deadlineTotalCount={deadlines.length}
            deadlineMatchedCount={filteredDeadlines.length}
          />
        </Suspense>

        <HomeHighlights latest={latest} deadlines={deadlineCandidates} now={now.toISOString()} isFiltering={isFiltering} filters={filters} />

        <AppearanceScheduleSection
          cards={filteredCards}
          deadlines={deadlineCandidates}
          receptionFilters={filters}
          relatedDeadlines={deadlines}
          upcoming={upcoming}
          availableYears={filterOptions.years}
          view={scheduleView}
          now={now.toISOString()}
          currentSearchParams={currentSearchParams}
          isFiltering={isFiltering}
        />

        <AppearanceSection
          deadlines={deadlines}
          now={now.toISOString()}
          id="history"
          eyebrow="ARCHIVE"
          title="過去の出演履歴"
          description="これまでの出演情報を新しい順に振り返れます。"
          items={paginatedPast}
          emptyMessage={isFiltering ? noMatchingMessage : "過去の出演情報はまだありません。"}
        />
        <ListPagination
          pathname="/"
          label="出演履歴のページ送り"
          currentPage={page}
          totalPages={totalPages}
          currentSearchParams={currentSearchParams}
        />
      </div>

      <SiteFooter />
    </main>
    </DeadlineClockProvider>
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    <Suspense fallback={<p role="status">読み込み中…</p>}>
      <HomeContent {...props} />
    </Suspense>
  );
}
