import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { AppearanceFilters } from "@/app/appearance-filters";
import {
  type AppearanceCard,
  categoryClassNames,
  buildAppearanceCards,
  formatAppearanceAgendaStart,
  formatAppearanceStart,
  formatPublication,
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
import {
  appearanceScheduleViews,
  createAppearanceScheduleViewHref,
  getAppearanceSchedule,
  parseAppearanceScheduleView,
  type AppearanceSchedule,
  type AppearanceScheduleView,
} from "@/lib/appearance-schedule";
import { getAppearancePageData } from "@/server/appearances/repository";

type AppearanceSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  items: AppearanceCard[];
  emptyMessage: string;
  featured?: boolean;
};

function AppearanceStart({
  session,
  agenda = false,
}: {
  session: AppearanceCard["sessions"][number];
  agenda?: boolean;
}) {
  const label = agenda
    ? formatAppearanceAgendaStart(session)
    : formatAppearanceStart(session);

  if (session.startsAtPrecision === "unknown") {
    return <span>{label}</span>;
  }

  return (
    <time dateTime={session.startsAt ?? session.startsOn!}>
      {label}
    </time>
  );
}

function AppearanceCard({
  item,
  agenda = false,
}: {
  item: AppearanceCard;
  agenda?: boolean;
}) {
  const hasMultipleSources = item.sourceUrls.length > 1;

  return (
    <article className="appearance-card">
      <div className="appearance-card__meta">
        <span
          className={`category-badge ${categoryClassNames[item.category]}`}
        >
          {item.category}
        </span>
        {!item.isGrouped && (
          <AppearanceStart session={item.sessions[0]} agenda={agenda} />
        )}
      </div>
      <h3>{item.title}</h3>
      {item.isGrouped && (
        <ul className="appearance-card__sessions" aria-label={`${item.title}の公演一覧`}>
          {item.sessions.map((session) => (
            <li key={session.id}>
              <span>{session.sessionLabel}</span>
              <AppearanceStart session={session} agenda={agenda} />
            </li>
          ))}
        </ul>
      )}
      <p className="appearance-card__published">
        {item.isGrouped ? "最新公式発表" : "公式発表"}{" "}
        {formatPublication(item.publication)}
      </p>
      <div className="appearance-card__sources">
        {item.sourceUrls.map((sourceUrl, index) => (
          <a
            className="source-link"
            href={sourceUrl}
            key={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.title}の情報元${index + 1}を新しいタブで開く`}
          >
            {hasMultipleSources ? `情報元 ${index + 1}` : "情報元を見る"}{" "}
            <span aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </article>
  );
}

const appearanceScheduleViewLabels: Record<AppearanceScheduleView, string> = {
  upcoming: "今後",
  week: "今週",
  month: "今月",
};

function AppearanceScheduleSection({
  schedule,
  upcoming,
  currentSearchParams,
  emptyMessage,
}: {
  schedule: AppearanceSchedule;
  upcoming: AppearanceCard[];
  currentSearchParams: string;
  emptyMessage: string;
}) {
  const hasItems =
    schedule.view === "upcoming" ? upcoming.length > 0 : schedule.days.length > 0;

  return (
    <section
      className="appearance-section appearance-schedule"
      id="upcoming"
      aria-labelledby="upcoming-heading"
    >
      <header className="section-heading appearance-schedule__heading">
        <div>
          <p className="eyebrow">UPCOMING</p>
          <h2 id="upcoming-heading">{schedule.title}</h2>
        </div>
        <div className="appearance-schedule__summary">
          <p>{schedule.description}</p>
          {schedule.rangeLabel !== null && <strong>{schedule.rangeLabel}</strong>}
        </div>
      </header>

      <nav className="appearance-view-switcher" aria-label="出演予定の表示期間">
        {appearanceScheduleViews.map((view) => (
          <Link
            key={view}
            href={createAppearanceScheduleViewHref(
              "/",
              currentSearchParams,
              view,
            )}
            aria-current={schedule.view === view ? "page" : undefined}
            scroll={false}
          >
            {appearanceScheduleViewLabels[view]}
          </Link>
        ))}
      </nav>

      {hasItems ? (
        schedule.view === "upcoming" ? (
          <div className="appearance-grid">
            {upcoming.map((item) => (
              <AppearanceCard item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <div className="appearance-agenda">
            {schedule.days.map((day) => (
              <section
                className="appearance-agenda__day"
                key={day.date}
                aria-labelledby={`appearance-day-${day.date}`}
              >
                <h3 id={`appearance-day-${day.date}`}>
                  <time dateTime={day.date}>{day.label}</time>
                </h3>
                <div className="appearance-grid">
                  {day.items.map((item) => (
                    <AppearanceCard item={item} key={item.id} agenda />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <p className="empty-state">{emptyMessage}</p>
      )}
    </section>
  );
}

function AppearanceSection({
  id,
  eyebrow,
  title,
  description,
  items,
  emptyMessage,
  featured = false,
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
            <AppearanceCard item={item} key={item.id} />
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
  const [searchParams, { appearances, lastUpdatedAt }] = await Promise.all([
    props.searchParams,
    getAppearancePageData(),
  ]);
  const cards = buildAppearanceCards(appearances);
  const filterOptions = getAppearanceFilterOptions(cards);
  const filters = parseAppearanceFilters(searchParams, filterOptions);
  const filteredCards = filterAppearanceCards(cards, filters);
  const { latest, upcoming, past } = groupAppearanceCards(filteredCards, now);
  const scheduleView = parseAppearanceScheduleView(searchParams.view);
  const schedule = getAppearanceSchedule(filteredCards, now, scheduleView);
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
    <main>
      <header className="site-header">
        <div className="site-header__inner">
          <a className="site-mark" href="#top" aria-label="ページ上部へ戻る">
            <span aria-hidden="true">IH</span>
            飯田ヒカル 出演情報
          </a>
          <nav aria-label="ページ内ナビゲーション">
            <a href="#latest">新着</a>
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
          />
        </Suspense>

        <AppearanceSection
          id="latest"
          eyebrow="LATEST NEWS"
          title="新着情報"
          description="最近追加された出演情報をお知らせします。"
          items={latest}
          emptyMessage={isFiltering ? noMatchingMessage : "新着情報はまだありません。"}
          featured
        />

        <AppearanceScheduleSection
          schedule={schedule}
          upcoming={upcoming}
          currentSearchParams={currentSearchParams}
          emptyMessage={
            isFiltering
              ? noMatchingMessage
              : schedule.view === "week"
                ? "今週お知らせできる出演予定はありません。"
                : schedule.view === "month"
                  ? "今月お知らせできる出演予定はありません。"
                  : "現在お知らせできる出演予定はありません。"
          }
        />

        <AppearanceSection
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
  );
}
