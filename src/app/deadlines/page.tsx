import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppearanceFilters } from "@/app/appearance-filters";
import { DeadlineSection } from "@/app/deadline-section";
import { PublicListPage } from "@/app/public-list-page";
import { buildAppearanceCards } from "@/lib/appearances";
import { getAppearanceFilterOptions, hasReceptionFilters, parseAppearanceFilters } from "@/lib/appearance-filters";
import { extendDeadlineFilterOptions, filterDeadlines } from "@/lib/deadlines";
import { getPublicPageData } from "@/server/public-cache/reader";

export const metadata: Metadata = {
  title: "受付・販売情報一覧 | 飯田ヒカル 出演情報",
  description: "飯田ヒカルさんに関連するチケット受付・配信販売・受注物販・通販の開始と終了を日本時間で掲載。終了・完売した情報も確認できます。",
};

async function DeadlinesPageContent(props: PageProps<"/deadlines">) {
  await connection();
  const now = new Date().toISOString();
  const [searchParams, { appearances, deadlines }] = await Promise.all([props.searchParams, getPublicPageData()]);
  const cards = buildAppearanceCards(appearances);
  const options = extendDeadlineFilterOptions(getAppearanceFilterOptions(cards), deadlines);
  const filters = parseAppearanceFilters(searchParams, options);
  const filtered = filterDeadlines(deadlines, filters, new Date(now));
  const candidates = filterDeadlines(deadlines, { ...filters, receptionStatus: null }, new Date(now));

  return (
    <PublicListPage kind="deadlines" title="受付・販売情報一覧" description="チケット受付・配信販売・物販の開始と終了を確認できます。日時は日本時間です。" filters={filters} now={now}>
      <Suspense fallback={<div className="appearance-filters appearance-filters--loading" />}>
        <AppearanceFilters key={[filters.q, filters.series, filters.category, filters.year, filters.receptionType, filters.receptionStatus].join("\u0000")}
          target="deadlines" filters={filters} options={options} totalCount={cards.length} matchedCount={cards.length}
          deadlineItems={candidates} now={now} deadlineTotalCount={deadlines.length} deadlineMatchedCount={filtered.length} />
      </Suspense>
      <DeadlineSection items={candidates} filters={filters} now={now} isFiltering={hasReceptionFilters(filters)} />
    </PublicListPage>
  );
}

export default function DeadlinesPage(props: PageProps<"/deadlines">) {
  return (
    <Suspense fallback={<p role="status">読み込み中…</p>}>
      <DeadlinesPageContent {...props} />
    </Suspense>
  );
}
