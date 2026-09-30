import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppearanceFilters } from "@/app/appearance-filters";
import { LatestAppearanceList } from "@/app/latest-appearance-list";
import { ListPagination } from "@/app/list-pagination";
import { PublicListPage } from "@/app/public-list-page";
import { buildAppearanceCards, sortAppearanceCardsByPublication } from "@/lib/appearances";
import { filterAppearanceCards, getAppearanceFilterOptions, hasAppearanceFilters, parseAppearanceFilters } from "@/lib/appearance-filters";
import { getAppearanceHistoryPage, paginateAppearanceHistory } from "@/lib/appearance-pagination";
import { extendDeadlineFilterOptions } from "@/lib/deadlines";
import { createPublicListHref } from "@/lib/public-list-navigation";
import { getPublicPageData } from "@/server/public-cache/reader";

export const metadata: Metadata = {
  title: "新着情報一覧 | 飯田ヒカル 出演情報",
  description: "飯田ヒカルさんの出演情報を公式発表日が新しい順に掲載。シリーズ・カテゴリ・出演年で検索できます。",
};

async function NewsPageContent(props: PageProps<"/news">) {
  await connection();
  const now = new Date().toISOString();
  const [searchParams, { appearances, deadlines }] = await Promise.all([props.searchParams, getPublicPageData()]);
  const cards = buildAppearanceCards(appearances);
  const options = extendDeadlineFilterOptions(getAppearanceFilterOptions(cards), deadlines);
  const filters = parseAppearanceFilters(searchParams, options);
  const filtered = sortAppearanceCardsByPublication(filterAppearanceCards(cards, filters));
  const { page, totalPages } = getAppearanceHistoryPage(searchParams.page, filtered.length);
  const items = paginateAppearanceHistory(filtered, page);
  const filterQuery = createPublicListHref("/news", filters).split("?")[1] ?? "";

  return (
    <PublicListPage kind="news" title="新着情報一覧" description="公式発表日が新しい順に掲載しています。" filters={filters} now={now}>
      <Suspense fallback={<div className="appearance-filters appearance-filters--loading" />}>
        <AppearanceFilters key={[filters.q, filters.series, filters.category, filters.year].join("\u0000")}
          target="news" filters={filters} options={options} totalCount={cards.length} matchedCount={filtered.length} />
      </Suspense>
      <section className="public-list-results" aria-label="新着情報">
        {items.length > 0 ? <LatestAppearanceList items={items} /> : <p className="empty-state">{hasAppearanceFilters(filters) ? "条件に一致する出演情報はありません。" : "新着情報はまだありません。"}</p>}
        <ListPagination currentPage={page} totalPages={totalPages} currentSearchParams={filterQuery} pathname="/news" label="新着情報のページ送り" />
      </section>
    </PublicListPage>
  );
}

export default function NewsPage(props: PageProps<"/news">) {
  return (
    <Suspense fallback={<p role="status">読み込み中…</p>}>
      <NewsPageContent {...props} />
    </Suspense>
  );
}
