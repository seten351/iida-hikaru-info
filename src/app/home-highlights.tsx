"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Deadline } from "@/domain/deadline";
import type { AppearanceCard } from "@/lib/appearances";
import { hasReceptionFilters, type AppearanceFilters } from "@/lib/appearance-filters";
import { filterReceptionStatus, getStartingReceptionPreview, getUpcomingDeadlinePreview } from "@/lib/deadlines";
import { createPublicListHref } from "@/lib/public-list-navigation";
import { DeadlineCard } from "./deadline-card";
import { useDeadlineNow } from "./deadline-clock";
import { LatestAppearanceList } from "./latest-appearance-list";
import { replacePublicHash, useMobileHighlights, usePublicHash } from "./public-location";

const tabs = ["latest", "deadlines"] as const;
type HighlightTab = typeof tabs[number];

export function HomeHighlights({ latest, deadlines, now, isFiltering, filters }: {
  latest: AppearanceCard[];
  deadlines: Deadline[];
  now: string;
  isFiltering: boolean;
  filters: AppearanceFilters;
}) {
  const hash = usePublicHash();
  const isMobile = useMobileHighlights();
  const activeTab: HighlightTab = hash === "#deadlines" ? "deadlines" : "latest";
  const currentTime = useDeadlineNow(now);
  const visibleDeadlines = filterReceptionStatus(deadlines, filters, currentTime);
  const deadlinePreview = getUpcomingDeadlinePreview(visibleDeadlines, currentTime);
  const startingPreview = getStartingReceptionPreview(visibleDeadlines, currentTime, deadlinePreview);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const skipAnchorScroll = useRef(false);

  useEffect(() => {
    if (skipAnchorScroll.current) {
      skipAnchorScroll.current = false;
      return;
    }
    if (!isMobile || (hash !== "#latest" && hash !== "#deadlines")) return;
    // The native anchor may have targeted a hidden panel before React reveals it.
    const frame = requestAnimationFrame(() => document.getElementById(activeTab)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [hash, isMobile, activeTab]);

  const selectTab = (tab: HighlightTab) => {
    if (tab === activeTab) return;
    skipAnchorScroll.current = true;
    replacePublicHash(`#${tab}`);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
        : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(tabs[nextIndex]);
    tabButtons.current[nextIndex]?.focus();
  };

  return (
    <div className="home-highlights" data-active-tab={activeTab}>
      <div className="home-highlights__tabs" role="tablist" aria-label="新着情報と受付・販売情報">
        {tabs.map((tab, index) => (
          <button key={tab} id={`highlight-tab-${tab}`} role="tab" type="button"
            ref={(element) => { tabButtons.current[index] = element; }}
            aria-selected={activeTab === tab} aria-controls={tab}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => selectTab(tab)} onKeyDown={(event) => onTabKeyDown(event, index)}>
            {tab === "latest" ? "新着" : "受付・販売"}
          </button>
        ))}
      </div>
      <div className="home-highlights__panels">
        <section className="appearance-section latest-section home-highlights__panel" id="latest"
          role={isMobile ? "tabpanel" : undefined} tabIndex={isMobile ? 0 : undefined}
          aria-labelledby={isMobile ? "highlight-tab-latest" : "latest-heading"}>
          <header className="section-heading">
            <div><p className="eyebrow">LATEST NEWS</p><h2 id="latest-heading">新着情報</h2></div>
            <p>公式発表日が新しい順に表示しています。</p>
          </header>
          {latest.length > 0 ? <LatestAppearanceList items={latest.slice(0, 3)} /> : <p className="empty-state">{isFiltering ? "条件に一致する出演情報はありません。" : "新着情報はまだありません。"}</p>}
          <a className="list-more-link" href={createPublicListHref("/news", filters)} aria-label="新着情報をもっと見る">もっと見る <span aria-hidden="true">→</span></a>
        </section>
        <section className="appearance-section deadline-section home-highlights__panel" id="deadlines"
          role={isMobile ? "tabpanel" : undefined} tabIndex={isMobile ? 0 : undefined}
          aria-labelledby={isMobile ? "highlight-tab-deadlines" : "deadlines-heading"}>
          <header className="section-heading">
            <div><p className="eyebrow">RECEPTION & SALES</p><h2 id="deadlines-heading">受付・販売情報</h2></div>
            <p>締切・販売終了が近い順に掲載しています。日時は日本時間です。</p>
          </header>
          {deadlinePreview.length > 0 ? <div className="home-highlights__deadlines">{deadlinePreview.map((item) => <DeadlineCard key={item.id} item={item} now={now} variant="summary" />)}</div> : <p className="empty-state">{hasReceptionFilters(filters) ? "条件に一致する終了日時のある情報はありません。" : "現在お知らせできる締切・販売終了の予定はありません。"}</p>}
          {startingPreview.length > 0 && <div className="deadline-section__group"><h3>開始予定・受付中・販売中</h3><div className="home-highlights__deadlines">{startingPreview.map(item => <DeadlineCard key={item.id} item={item} now={now} variant="summary" />)}</div></div>}
          <a className="list-more-link" href={createPublicListHref("/deadlines", filters)} aria-label="受付・販売情報をもっと見る">もっと見る <span aria-hidden="true">→</span></a>
        </section>
      </div>
    </div>
  );
}
