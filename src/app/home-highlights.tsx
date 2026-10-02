"use client";

import { getReceptionFields, receptionInformationTypeLabels, type Deadline } from "@/domain/deadline";
import type { AppearanceCard } from "@/lib/appearances";
import { hasReceptionFilters, type AppearanceFilters } from "@/lib/appearance-filters";
import { createDeadlineDetailHref, filterReceptionStatus } from "@/lib/deadlines";
import { formatReceptionBoundaryCompact, getDesktopReceptionPreview, getUrgentReceptions } from "@/lib/reception-presentation";
import { createPublicListHref } from "@/lib/public-list-navigation";
import { DeadlineCard } from "./deadline-card";
import { useDeadlineNow } from "./deadline-clock";
import { LatestAppearanceList } from "./latest-appearance-list";

export function HomeHighlights({ latest, deadlines, now, isFiltering, filters }: {
  latest: AppearanceCard[]; deadlines: Deadline[]; now: string; isFiltering: boolean; filters: AppearanceFilters;
}) {
  const currentTime = useDeadlineNow(now);
  const visible = filterReceptionStatus(deadlines, filters, currentTime);
  const preview = getDesktopReceptionPreview(visible, currentTime);
  const urgent = getUrgentReceptions(visible, currentTime);
  return <div className="home-highlights">
    {urgent.length > 0 && <section className="home-urgent" aria-labelledby="urgent-heading">
      <h2 id="urgent-heading">お見逃しなく</h2>
      <ul className="home-urgent__list">{urgent.map(({ item, label, boundary }) => {
        const fields = getReceptionFields(item);
        const datetime = boundary === "start" ? fields.startsAt ?? fields.startsOn : item.deadlineAt ?? item.deadlineOn;
        return <li key={item.id}><a className="home-urgent__item" href={createDeadlineDetailHref(item.id)}>
          <span className="home-urgent__meta"><strong>{label}</strong><span>{receptionInformationTypeLabels[fields.informationType]}</span>{item.projectType === "fan" && <span>ファン企画</span>}</span>
          <span className="home-urgent__title">{item.projectTitle}</span>
          <time dateTime={datetime ?? undefined}>{formatReceptionBoundaryCompact(item, boundary)}</time><span className="home-urgent__arrow" aria-hidden="true">→</span>
        </a></li>;
      })}</ul>
    </section>}
    <div className="home-highlights__panels">
      <section className="appearance-section latest-section home-highlights__panel" id="latest" aria-label="新着情報">
        <div className="home-highlights__desktop">
          <header className="section-heading"><div><p className="eyebrow">LATEST NEWS</p><h2 id="latest-heading">新着情報</h2></div><p>公式発表日が新しい順に表示しています。</p></header>
          {latest.length ? <LatestAppearanceList items={latest.slice(0, 3)} /> : <p className="empty-state">{isFiltering ? "条件に一致する出演情報はありません。" : "新着情報はまだありません。"}</p>}
        </div>
        <a className="list-more-link" href={createPublicListHref("/news", filters)} aria-label="新着情報一覧を見る"><span className="home-highlights__mobile-label">新着一覧</span><span className="home-highlights__desktop-label">もっと見る</span> <span aria-hidden="true">→</span></a>
      </section>
      <section className="appearance-section deadline-section home-highlights__panel" id="deadlines" aria-label="受付・販売情報">
        <div className="home-highlights__desktop">
          <header className="section-heading"><div><p className="eyebrow">RECEPTION & SALES</p><h2 id="deadlines-heading">受付・販売情報</h2></div><p>締切・販売終了、開始予定や販売中の情報を確認できます。日時は日本時間です。</p></header>
          {preview.ending.length > 0 && <div className="home-highlights__deadlines">{preview.ending.map(item => <DeadlineCard item={item} now={now} variant="summary" key={item.id} />)}</div>}
          {preview.starting.length > 0 && <div className="deadline-section__group"><h3>開始予定・その他の受付・販売</h3><div className="home-highlights__deadlines">{preview.starting.map(item => <DeadlineCard item={item} now={now} variant="summary" key={item.id} />)}</div></div>}
          {!preview.ending.length && !preview.starting.length && <p className="empty-state">{hasReceptionFilters(filters) ? "条件に一致する受付・販売情報はありません。" : "現在お知らせできる受付・販売情報はありません。"}</p>}
        </div>
        <a className="list-more-link" href={createPublicListHref("/deadlines", filters)} aria-label="受付・販売情報一覧を見る"><span className="home-highlights__mobile-label">受付・販売一覧</span><span className="home-highlights__desktop-label">もっと見る</span> <span aria-hidden="true">→</span></a>
      </section>
    </div>
  </div>;
}
