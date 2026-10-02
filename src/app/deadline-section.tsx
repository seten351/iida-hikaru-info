"use client";

import { useEffect, useState } from "react";
import type { Deadline } from "@/domain/deadline";
import { compareDeadlines, filterReceptionStatus, isDeadlineFinished } from "@/lib/deadlines";
import { DeadlineCard } from "@/app/deadline-card";
import { useDeadlineNow } from "@/app/deadline-clock";
import type { AppearanceFilters } from "@/lib/appearance-filters";
import { usePublicHash } from "./public-location";

export function DeadlineSection({ items, now, isFiltering, filters }: {
  items: Deadline[];
  now: string;
  isFiltering: boolean;
  filters?: AppearanceFilters;
}) {
  const hash = usePublicHash();
  const [finishedOverride, setFinishedOverride] = useState<{ hash: string; value: boolean } | null>(null);
  const currentTime = useDeadlineNow(now);
  const sorted = [...(filters ? filterReceptionStatus(items, filters, currentTime) : items)].sort(compareDeadlines);
  const active = sorted.filter((item) => !isDeadlineFinished(item, currentTime));
  const dated = active.filter((item) => item.deadlinePrecision !== "unknown");
  const undated = active.filter((item) => item.deadlinePrecision === "unknown");
  const finished = sorted.filter((item) => isDeadlineFinished(item, currentTime)).reverse();
  let targetId: string | null = null;
  try {
    if (hash.startsWith("#deadline-")) targetId = decodeURIComponent(hash.slice("#deadline-".length));
  } catch { /* A malformed fragment has no matching deadline. */ }
  const showFinished = finishedOverride?.hash === hash
    ? finishedOverride.value
    : finished.some((item) => item.id === targetId) || ["expired", "closed", "sold_out", "cancelled"].includes(filters?.receptionStatus ?? "");

  useEffect(() => {
    if (!targetId) return;
    const frame = requestAnimationFrame(() => document.getElementById(`deadline-${targetId}`)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [targetId, showFinished]);

  return (
    <section className="appearance-section deadline-section" id="deadlines" aria-labelledby="deadlines-heading">
      <header className="section-heading">
        <div>
          <p className="eyebrow">RECEPTION & SALES</p>
          <h2 id="deadlines-heading">受付・販売情報</h2>
        </div>
        <p>チケット受付・配信販売・物販などの開始と終了を掲載しています。日時は日本時間です。</p>
      </header>
      <label className="deadline-toggle">
        <input type="checkbox" checked={showFinished} onChange={(event) => setFinishedOverride({ hash, value: event.target.checked })} />
        終了・完売・中止を含める
      </label>
      {dated.length > 0 && (
        <div className="deadline-section__group"><h3>終了日時あり</h3><div className="appearance-grid">
          {dated.map((item) => <DeadlineCard key={item.id} item={item} now={now} anchor />)}
        </div></div>
      )}
      {active.length === 0 && (!showFinished || finished.length === 0) && (
        <p className="empty-state">{isFiltering ? "条件に一致する受付・販売情報はありません。" : "現在お知らせできる受付・販売情報はありません。"}</p>
      )}
      {undated.length > 0 && (
        <div className="deadline-section__group">
          <h3>終了日時未確認</h3>
          <div className="appearance-grid">
            {undated.map((item) => <DeadlineCard key={item.id} item={item} now={now} headingLevel={4} anchor />)}
          </div>
        </div>
      )}
      {showFinished && (
        <div className="deadline-section__group">
          <h3>終了・完売・中止</h3>
          {finished.length > 0 ? (
            <div className="appearance-grid">
              {finished.map((item) => <DeadlineCard key={item.id} item={item} now={now} headingLevel={4} anchor />)}
            </div>
          ) : <p className="empty-state">掲載されている受付・販売履歴はありません。</p>}
        </div>
      )}
    </section>
  );
}
