"use client";

import { useState } from "react";
import Link from "next/link";

import type { Deadline } from "@/domain/deadline";
import { useDeadlineNow } from "@/app/deadline-clock";
import { AppearanceCard } from "@/app/appearance-card";
import { AppearanceCalendar } from "@/app/appearance-calendar";
import type { AppearanceCard as AppearanceCardData } from "@/lib/appearances";
import {
  appearanceScheduleViews,
  createAppearanceScheduleViewHref,
  getAppearanceSchedule,
  type AppearanceScheduleView,
} from "@/lib/appearance-schedule";

const viewLabels = {
  upcoming: "今後",
  month: "カレンダー",
};

export function AppearanceScheduleSection({
  cards,
  deadlines = [],
  relatedDeadlines = deadlines,
  upcoming,
  availableYears,
  view,
  now,
  currentSearchParams,
  isFiltering,
}: {
  cards: AppearanceCardData[];
  deadlines?: Deadline[];
  relatedDeadlines?: Deadline[];
  upcoming: AppearanceCardData[];
  availableYears: string[];
  view: AppearanceScheduleView;
  now: string;
  currentSearchParams: string;
  isFiltering: boolean;
}) {
  const [showDeadlines, setShowDeadlines] = useState(true);
  const currentTime = useDeadlineNow(now);
  const [period, setPeriod] = useState<string | null>(null);
  const schedule = getAppearanceSchedule(cards, currentTime, view, {
    month: period ?? undefined,
    week: period ?? undefined,
  }, showDeadlines ? deadlines : []);
  const emptyMessage = isFiltering
    ? "条件に一致する出演情報はありません。"
    : view === "month"
      ? "この月に掲載されている出演情報はありません。"
      : view === "week"
        ? "この週に掲載されている出演情報はありません。"
        : "現在お知らせできる出演予定はありません。";

  return (
    <section
      className="appearance-section appearance-schedule"
      id="upcoming"
      aria-labelledby="upcoming-heading"
    >
      <header className="section-heading appearance-schedule__heading">
        <div>
          <p className="eyebrow">UPCOMING</p>
          <h2 id="upcoming-heading">{schedule.title}</h2>
        </div>
        <div className="appearance-schedule__summary">
          <p>{schedule.calendar && showDeadlines ? "日付を選ぶと、その日の出演情報と申し込み締切を確認できます。" : schedule.description}</p>
        </div>
      </header>

      <nav className="appearance-view-switcher" aria-label="出演情報の表示方法">
        {appearanceScheduleViews.filter((item) => item !== "week").map((item) => (
          <Link
            key={item}
            href={createAppearanceScheduleViewHref("/", currentSearchParams, item)}
            aria-current={view === item ? "page" : undefined}
            scroll={false}
          >
            {viewLabels[item]}
          </Link>
        ))}
      </nav>

      {schedule.calendar !== null && <label className="deadline-toggle"><input type="checkbox" checked={showDeadlines} onChange={(event) => setShowDeadlines(event.target.checked)} />締切も表示</label>}
      {schedule.calendar !== null ? (
        <AppearanceCalendar
          calendar={schedule.calendar}
          relatedDeadlines={relatedDeadlines}
          showDeadlines={showDeadlines}
          now={now}
          availableYears={availableYears}
          onPeriodChange={setPeriod}
          emptyMessage={emptyMessage}
        />
      ) : upcoming.length > 0 ? (
        <div className="appearance-grid">
          {upcoming.map((item) => (
            <AppearanceCard item={item} key={item.id} deadlines={relatedDeadlines} now={now} />
          ))}
        </div>
      ) : (
        <p className="empty-state">{emptyMessage}</p>
      )}
    </section>
  );
}
