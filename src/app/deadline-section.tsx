"use client";

import { useState } from "react";
import type { Deadline } from "@/domain/deadline";
import { compareDeadlines, isDeadlineFinished } from "@/lib/deadlines";
import { DeadlineCard } from "@/app/deadline-card";
import { useDeadlineNow } from "@/app/deadline-clock";

export function DeadlineSection({ items, now, isFiltering }: {
  items: Deadline[];
  now: string;
  isFiltering: boolean;
}) {
  const [showFinished, setShowFinished] = useState(false);
  const currentTime = useDeadlineNow(now);
  const sorted = [...items].sort(compareDeadlines);
  const active = sorted.filter((item) => !isDeadlineFinished(item, currentTime));
  const dated = active.filter((item) => item.deadlinePrecision !== "unknown");
  const undated = active.filter((item) => item.deadlinePrecision === "unknown");
  const finished = sorted.filter((item) => isDeadlineFinished(item, currentTime)).reverse();

  return (
    <section className="appearance-section deadline-section" id="deadlines" aria-labelledby="deadlines-heading">
      <header className="section-heading">
        <div>
          <p className="eyebrow">APPLICATION DEADLINES</p>
          <h2 id="deadlines-heading">申し込み締切</h2>
        </div>
        <p>チケット・企画の締切を近い順に掲載しています。日時は日本時間です。</p>
      </header>
      <label className="deadline-toggle">
        <input type="checkbox" checked={showFinished} onChange={(event) => setShowFinished(event.target.checked)} />
        締切済みを含める
      </label>
      {dated.length > 0 && (
        <div className="appearance-grid">
          {dated.map((item) => <DeadlineCard key={item.id} item={item} now={now} anchor />)}
        </div>
      )}
      {active.length === 0 && (
        <p className="empty-state">{isFiltering ? "条件に一致する未経過の締切はありません。" : "現在お知らせできる申し込み締切はありません。"}</p>
      )}
      {undated.length > 0 && (
        <div className="deadline-section__group">
          <h3>締切日時未定</h3>
          <div className="appearance-grid">
            {undated.map((item) => <DeadlineCard key={item.id} item={item} now={now} headingLevel={4} anchor />)}
          </div>
        </div>
      )}
      {showFinished && (
        <div className="deadline-section__group">
          <h3>締切済み・受付終了・中止</h3>
          {finished.length > 0 ? (
            <div className="appearance-grid">
              {finished.map((item) => <DeadlineCard key={item.id} item={item} now={now} headingLevel={4} anchor />)}
            </div>
          ) : <p className="empty-state">掲載されている締切履歴はありません。</p>}
        </div>
      )}
    </section>
  );
}
