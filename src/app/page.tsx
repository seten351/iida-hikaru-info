import type { Deadline } from "@/domain/deadline";
import { DeadlineClockProvider } from "@/app/deadline-clock";
import { DeadlineSection } from "@/app/deadline-section";
import { filterDeadlines, extendDeadlineFilterOptions } from "@/lib/deadlines";
import { Suspense } from "react";
import { connection } from "next/server";

import { AppearanceFilters } from "@/app/appearance-filters";
import { AppearanceCard } from "@/app/appearance-card";
import { AppearanceScheduleSection } from "@/app/appearance-schedule-section";
import { LatestAppearanceList } from "@/app/latest-appearance-list";
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
  createAppearanceHistoryPageHref,
  getAppearanceHistoryPage,
  paginateAppearanceHistory,
} from "@/lib/appearance-pagination";
import { parseAppearanceScheduleView } from "@/lib/appearance-schedule";
import { getAppearancePageData } from "@/server/appearances/repository";

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

function AppearanceHistoryPagination({
  currentPage,
  totalPages,
  currentSearchParams,
}: {
  currentPage: number;
  totalPages: number;
  currentSearchParams: string;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (page: number) =>
    createAppearanceHistoryPageHref("/", currentSearchParams, page);

  return (
    <nav className="appearance-pagination" aria-label="出演履歴のページ送り">
      {currentPage > 1 ? (
        <a className="appearance-pagination__link" href={hrefFor(currentPage - 1)}>
          前へ
        </a>
      ) : (
        <span className="appearance-pagination__link" aria-disabled="true">
          前へ
        </span>
      )}
      <p className="appearance-pagination__status" aria-live="polite">
        <span>{currentPage}</span> / {totalPages} ページ
      </p>
      {currentPage < totalPages ? (
        <a className="appearance-pagination__link" href={hrefFor(currentPage + 1)}>
          次へ
        </a>
      ) : (
        <span className="appearance-pagination__link" aria-disabled="true">
          次へ
        </span>
      )}
    </nav>
  );
}

export default async function Home(props: PageProps<"/">) {
  await connection();

  const now = new Date();
  const [searchParams, { appearances, deadlines, lastUpdatedAt }] = await Promise.all([
    props.searchParams,
    getAppearancePageData(),
  ]);
  const cards = buildAppearanceCards(appearances);
  const filterOptions = extendDeadlineFilterOptions(getAppearanceFilterOptions(cards), deadlines);
  const filters = parseAppearanceFilters(searchParams, filterOptions);
  const filteredDeadlines = filterDeadlines(deadlines, filters);
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
      <header className="site-header">
        <div className="site-header__inner">
          <a className="site-mark" href="#top" aria-label="ページ上部へ戻る">
            <span aria-hidden="true">IH</span>
            飯田ヒカル 出演情報
          </a>
          <nav aria-label="ページ内ナビゲーション">
            <a href="#latest">新着</a>
            <a href="#deadlines">締切</a>
            <a href="#upcoming">今後の予定</a>
            <a href="#history">出演履歴</a>
          </nav>
        </div>
      </header>

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
            key={[filters.q, filters.series, filters.category, filters.year].join("\u0000")}
            filters={filters}
            options={filterOptions}
            totalCount={cards.length}
            matchedCount={filteredCards.length}
            deadlineTotalCount={deadlines.length}
            deadlineMatchedCount={filteredDeadlines.length}
          />
        </Suspense>

        <section className="appearance-section latest-section" id="latest" aria-labelledby="latest-heading">
          <header className="section-heading latest-section__heading">
            <div>
              <p className="eyebrow">LATEST NEWS</p>
              <h2 id="latest-heading">新着情報</h2>
            </div>
            <p>公式発表日が新しい順に表示しています。</p>
          </header>
          {latest.length > 0 ? (
            <LatestAppearanceList items={latest} />
          ) : (
            <p className="empty-state">
              {isFiltering ? noMatchingMessage : "新着情報はまだありません。"}
            </p>
          )}
        </section>

        <DeadlineSection items={filteredDeadlines} now={now.toISOString()} isFiltering={isFiltering} />

        <AppearanceScheduleSection
          cards={filteredCards}
          deadlines={filteredDeadlines}
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
        <AppearanceHistoryPagination
          currentPage={page}
          totalPages={totalPages}
          currentSearchParams={currentSearchParams}
        />
      </div>

      <footer>
        <div className="footer-inner">
          <div className="footer-brand">
            <p>飯田ヒカル 出演情報</p>
            <p>非公式ファンサイト</p>
          </div>
          <section
            className="fan-site-notice"
            aria-labelledby="fan-site-notice-heading"
          >
            <h2 id="fan-site-notice-heading">このサイトについて</h2>
            <p>
              当サイトは非公式ファンサイトであり、飯田ヒカルさんご本人、所属事務所、各コンテンツ運営会社とは関係ありません。正確な情報は公式サイト・公式SNSをご確認ください。
            </p>
          </section>
        </div>
      </footer>
    </main>
    </DeadlineClockProvider>
  );
}
