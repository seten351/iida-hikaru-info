export function SiteHeader({ home = false, currentPage }: { home?: boolean; currentPage?: "news" | "deadlines" }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="site-mark" href={home ? "#top" : "/"} aria-label={home ? "ページ上部へ戻る" : "トップページへ戻る"}>
          <span aria-hidden="true">IH</span>
          飯田ヒカル 出演情報
        </a>
        <nav aria-label={home ? "ページ内ナビゲーション" : "サイトナビゲーション"}>
          <a href={home ? "#latest" : "/news"} aria-current={currentPage === "news" ? "page" : undefined}>新着</a>
          <a href={home ? "#deadlines" : "/deadlines"} aria-current={currentPage === "deadlines" ? "page" : undefined}>締切</a>
          <a href={home ? "#upcoming" : "/#upcoming"}>今後の予定</a>
          <a href={home ? "#history" : "/#history"}>出演履歴</a>
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
