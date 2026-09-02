import { Suspense } from "react";
import { connection } from "next/server";

import { AppearanceFilters } from "@/app/appearance-filters";
import {
  type AppearanceCard,
  categoryClassNames,
  buildAppearanceCards,
  formatAppearanceDate,
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

function AppearanceCard({ item }: { item: AppearanceCard }) {
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
          <time dateTime={item.sessions[0].startsAt}>
            {formatAppearanceDate(item.sessions[0].startsAt)}
          </time>
        )}
      </div>
      <h3>{item.title}</h3>
      {item.isGrouped && (
        <ul className="appearance-card__sessions" aria-label={`${item.title}の公演一覧`}>
          {item.sessions.map((session) => (
            <li key={session.id}>
              <span>{session.sessionLabel}</span>
              <time dateTime={session.startsAt}>
                {formatAppearanceDate(session.startsAt)}
              </time>
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

        <AppearanceSection
          id="upcoming"
          eyebrow="UPCOMING"
          title="今後の出演予定"
          description="閲覧時点から近い順に掲載しています。"
          items={upcoming}
          emptyMessage={
            isFiltering
              ? noMatchingMessage
              : "現在お知らせできる出演予定はありません。"
          }
        />

        <AppearanceSection
          id="history"
          eyebrow="ARCHIVE"
          title="過去の出演履歴"
          description="これまでの出演情報を新しい順に振り返れます。"
          items={past}
          emptyMessage={isFiltering ? noMatchingMessage : "過去の出演情報はまだありません。"}
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
