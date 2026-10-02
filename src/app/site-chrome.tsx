import type { AppearanceFilters } from "@/lib/appearance-filters";
import { createPublicListHref } from "@/lib/public-list-navigation";

export function SiteHeader({ home = false, currentPage, filters = { q: "", series: null, category: null, year: null } }: { home?: boolean; currentPage?: "news" | "deadlines"; filters?: AppearanceFilters }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="site-mark" href={home ? "#top" : "/"} aria-label={home ? "ページ上部へ戻る" : "トップページへ戻る"}>
          <span aria-hidden="true">IH</span>
          飯田ヒカル 出演情報
        </a>
        <nav aria-label="サイトナビゲーション">
          <a href={createPublicListHref("/news", filters)} aria-current={currentPage === "news" ? "page" : undefined}>新着</a>
          <a href={createPublicListHref("/deadlines", filters)} aria-current={currentPage === "deadlines" ? "page" : undefined}>受付・販売</a>
          <a href={home ? "#upcoming" : `${createPublicListHref("/", filters)}#upcoming`}>今後の予定</a>
          <a href={home ? "#history" : `${createPublicListHref("/", filters)}#history`}>出演履歴</a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-brand">
          <p>飯田ヒカル 出演情報</p>
          <p>非公式ファンサイト</p>
        </div>
        <section className="fan-site-notice" aria-labelledby="fan-site-notice-heading">
          <h2 id="fan-site-notice-heading">このサイトについて</h2>
          <p>当サイトは非公式ファンサイトであり、飯田ヒカルさんご本人、所属事務所、各コンテンツ運営会社とは関係ありません。正確な情報は公式サイト・公式SNSをご確認ください。</p>
        </section>
      </div>
    </footer>
  );
}
