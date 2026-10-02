"use client";

import { useEffect } from "react";
import type { Deadline } from "@/domain/deadline";
import { filterReceptionStatus, isDeadlineFinished } from "@/lib/deadlines";
import { getDeadlineListItems, groupDeadlineListItems, parseDeadlineListView, type DeadlineListView } from "@/lib/reception-presentation";
import { DeadlineCard } from "@/app/deadline-card";
import { useDeadlineNow } from "@/app/deadline-clock";
import type { AppearanceFilters } from "@/lib/appearance-filters";
import { usePublicHash } from "./public-location";

export function DeadlineSection({ items, now, isFiltering, filters, view }: {
  items: Deadline[];
  now: string;
  isFiltering: boolean;
  filters?: AppearanceFilters;
  view?: DeadlineListView;
}) {
  const hash = usePublicHash();
  const currentTime = useDeadlineNow(now);
  const currentView = view ?? parseDeadlineListView(undefined, filters?.receptionStatus);
  const candidates = filters ? filterReceptionStatus(items, filters, currentTime) : items;
  const listed = getDeadlineListItems(candidates, currentTime, currentView);
  let targetId: string | null = null;
  try {
    if (hash.startsWith("#deadline-")) targetId = decodeURIComponent(hash.slice("#deadline-".length));
  } catch { /* A malformed fragment has no matching deadline. */ }
  // A direct detail link reveals its completed item, without overriding explicit search filters.
  const anchoredHistory = candidates.find(item => item.id === targetId && isDeadlineFinished(item, currentTime) && !listed.some(visible => visible.id === item.id));
  const grouped = currentView === "active" || currentView === "all";
  const groups = grouped ? groupDeadlineListItems(listed, currentTime) : [];
  const targetVisible = listed.some(item => item.id === targetId) || Boolean(anchoredHistory);

  useEffect(() => {
    if (!targetId || !targetVisible) return;
    const frame = requestAnimationFrame(() => document.getElementById(`deadline-${targetId}`)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [targetId, targetVisible]);

  return (
    <section className="appearance-section deadline-section" id="deadlines" aria-labelledby="deadlines-heading">
      <header className="section-heading">
        <div>
          <p className="eyebrow">RECEPTION & SALES</p>
          <h2 id="deadlines-heading">受付・販売情報</h2>
        </div>
        <p>チケット受付・配信販売・物販などの開始と終了を掲載しています。日時は日本時間です。</p>
      </header>
      <p className="deadline-section__count" role="status" aria-live="polite">{listed.length + (anchoredHistory ? 1 : 0)}件の受付・販売情報</p>
      {listed.length === 0 && !anchoredHistory && <p className="empty-state">{isFiltering || currentView !== "active" ? "条件に一致する受付・販売情報はありません。上の表示条件や検索条件を変更してください。" : "現在お知らせできる受付・販売情報はありません。"}</p>}
      {grouped ? groups.map(group => <div className="deadline-section__group" key={group.key}>
        <h3>{group.label}<span className="deadline-section__group-count">{group.items.length}件</span></h3>
        <div className="appearance-grid">{group.items.map(item => <DeadlineCard key={item.id} item={item} now={now} headingLevel={4} anchor />)}</div>
      </div>) : <div className="appearance-grid">{listed.map(item => <DeadlineCard key={item.id} item={item} now={now} anchor />)}</div>}
      {anchoredHistory && <div className="deadline-section__group"><h3>リンク先の終了・完売・中止情報</h3><div className="appearance-grid"><DeadlineCard item={anchoredHistory} now={now} headingLevel={4} anchor /></div></div>}
    </section>
  );
}
