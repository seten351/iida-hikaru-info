import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppearanceFilters } from "@/app/appearance-filters";
import { DeadlineSection } from "@/app/deadline-section";
import { PublicListPage } from "@/app/public-list-page";
import { buildAppearanceCards } from "@/lib/appearances";
import { getAppearanceFilterOptions, hasAppearanceFilters, parseAppearanceFilters } from "@/lib/appearance-filters";
import { extendDeadlineFilterOptions, filterDeadlines } from "@/lib/deadlines";
import { getAppearancePageData } from "@/server/appearances/repository";

export const metadata: Metadata = {
  title: "申し込み締切一覧 | 飯田ヒカル 出演情報",
  description: "飯田ヒカルさんに関連するチケット・企画の申し込み締切を日本時間で掲載。締切済みの受付も確認できます。",
};

export default async function DeadlinesPage(props: PageProps<"/deadlines">) {
  await connection();
  const now = new Date().toISOString();
  const [searchParams, { appearances, deadlines }] = await Promise.all([props.searchParams, getAppearancePageData()]);
  const cards = buildAppearanceCards(appearances);
  const options = extendDeadlineFilterOptions(getAppearanceFilterOptions(cards), deadlines);
  const filters = parseAppearanceFilters(searchParams, options);
  const filtered = filterDeadlines(deadlines, filters);

  return (
    <PublicListPage kind="deadlines" title="申し込み締切一覧" description="チケット・企画の締切を確認できます。日時は日本時間です。" filters={filters} now={now}>
      <Suspense fallback={<div className="appearance-filters appearance-filters--loading" />}>
        <AppearanceFilters key={[filters.q, filters.series, filters.category, filters.year].join("\u0000")}
          target="deadlines" filters={filters} options={options} totalCount={cards.length} matchedCount={cards.length}
          deadlineTotalCount={deadlines.length} deadlineMatchedCount={filtered.length} />
      </Suspense>
      <DeadlineSection items={filtered} now={now} isFiltering={hasAppearanceFilters(filters)} />
    </PublicListPage>
  );
}
