"use client";

import { useId, useState } from "react";

import type { Deadline } from "@/domain/deadline";
import { getReceptionCalendarLabels } from "@/lib/deadlines";
import { aggregateReceptionCalendarLabels } from "@/lib/reception-presentation";
import { DeadlineCard } from "@/app/deadline-card";
import { AppearanceCard } from "@/app/appearance-card";
import { getCalendarGuestMarker } from "@/app/appearance-guest-info";
import { appearanceCategoryDisplayOrder } from "@/domain/appearance";
import { categoryClassNames } from "@/lib/appearances";
import type { AppearanceCalendar as AppearanceCalendarData } from "@/lib/appearance-schedule";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const months = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);

export function AppearanceCalendar({
  calendar,
  relatedDeadlines = [],
  showDeadlines = true,
  now = "1970-01-01T00:00:00Z",
  availableYears,
  onPeriodChange,
  emptyMessage,
}: {
  calendar: AppearanceCalendarData;
  relatedDeadlines?: Deadline[];
  showDeadlines?: boolean;
  now?: string;
  availableYears: string[];
  onPeriodChange: (period: string | null) => void;
  emptyMessage: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const id = useId();
  const headingId = `${id}-period`;
  const calendarId = `${id}-calendar`;
  const detailsId = `${id}-details`;
  const detailsHeadingId = `${id}-day`;
  const days = calendar.weeks.flat().filter((day) => day !== null);
  const selectedDay = days.find((day) => day.date === selectedDate)
    ?? days.find((day) => day.date === calendar.initialSelectedDay)!;
  const selectedHasItems = selectedDay.items.length > 0 || (selectedDay.deadlines?.length ?? 0) > 0;
  const hasItems = days.some((day) => day.items.length > 0 || (day.deadlines?.length ?? 0) > 0);
  const visibleCategories = new Set(days.flatMap((day) => day.items.map((item) => item.category)));
  const periodUnit = calendar.view === "week" ? "週" : "月";
  const selectedYear = calendar.period.slice(0, 4);
  const selectedMonth = calendar.period.slice(5, 7);
  const years = [...availableYears, selectedYear, calendar.today.slice(0, 4)].map(Number);
  const firstYear = Math.max(1, Math.min(...years) - 1);
  const lastYear = Math.min(9999, Math.max(...years) + 1);
  const yearOptions = Array.from({ length: lastYear - firstYear + 1 }, (_, index) =>
    String(firstYear + index).padStart(4, "0"),
  );

  function changePeriod(period: string | null) {
    setSelectedDate(null);
    onPeriodChange(period);
  }

  return (
    <div className={`appearance-calendar appearance-calendar--${calendar.view}`}>
      <div className="appearance-calendar__toolbar">
        <div className="appearance-calendar__period">
          <p className="appearance-calendar__timezone">JAPAN TIME</p>
          <h3 id={headingId} aria-live="polite" aria-atomic="true">{calendar.label}</h3>
        </div>
        <div className="appearance-calendar__controls appearance-calendar__navigation" role="group" aria-label={`表示する年月と${periodUnit}の移動`}>
          <button
            className="appearance-calendar__previous"
            type="button"
            disabled={calendar.previousPeriod === null}
            aria-label={`前${periodUnit}`}
            aria-controls={calendarId}
            onClick={() => changePeriod(calendar.previousPeriod)}
          >
            <span aria-hidden="true">‹</span><span className="appearance-calendar__navigation-label" aria-hidden="true">前{periodUnit}</span>
          </button>
          {calendar.view === "month" && (
            <div className="appearance-calendar__month-picker" role="group" aria-label="表示する年月">
              <label className="appearance-filter-field">
                <span>年</span>
                <select
                  aria-label="表示する年"
                  aria-controls={calendarId}
                  value={selectedYear}
                  onChange={(event) => changePeriod(`${event.target.value}-${selectedMonth}`)}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>{Number(year)}年</option>
                  ))}
                </select>
              </label>
              <label className="appearance-filter-field">
                <span>月</span>
                <select
                  aria-label="表示する月"
                  aria-controls={calendarId}
                  value={selectedMonth}
                  onChange={(event) => changePeriod(`${selectedYear}-${event.target.value}`)}
                >
                  {months.map((month) => (
                    <option key={month} value={month}>{Number(month)}月</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button
            className="appearance-calendar__next"
            type="button"
            disabled={calendar.nextPeriod === null}
            aria-label={`翌${periodUnit}`}
            aria-controls={calendarId}
            onClick={() => changePeriod(calendar.nextPeriod)}
          >
            <span className="appearance-calendar__navigation-label" aria-hidden="true">翌{periodUnit}</span><span aria-hidden="true">›</span>
          </button>
          <button
            className="appearance-calendar__current"
            type="button"
            disabled={calendar.isCurrentPeriod}
            aria-label={`今${periodUnit}に戻る`}
            aria-controls={calendarId}
            onClick={() => changePeriod(null)}
          >
            今{periodUnit}
          </button>
        </div>
      </div>

      {hasItems && (
        <ul className="appearance-calendar__legend" aria-label="カテゴリの色分け">
          {days.some((day) => (day.deadlines?.length ?? 0) > 0) && <li><span className="appearance-calendar__deadline-dot" aria-hidden="true" />受付・販売の開始／終了<span className="appearance-calendar__compact-key">（受付始＝受付開始、販売始＝販売開始、販売終＝販売終了）</span></li>}
          {appearanceCategoryDisplayOrder.filter((category) => visibleCategories.has(category)).map((category) => (
            <li key={category}>
              <span
                className={`appearance-calendar__category-dot ${categoryClassNames[category]}`}
                aria-hidden="true"
              />
              {category}
            </li>
          ))}
        </ul>
      )}

      <div className="appearance-calendar__frame" id={calendarId}>
        <table className="appearance-calendar__table" aria-labelledby={headingId}>
          <thead>
            <tr>
              {weekdays.map((weekday) => <th key={weekday} scope="col">{weekday}</th>)}
            </tr>
          </thead>
          <tbody>
            {calendar.weeks.map((week, row) => (
              <tr key={row}>
                {week.map((day, column) => {
                  if (day === null) {
                    return <td className="appearance-calendar__blank" key={`blank-${column}`} />;
                  }
                  const isOutsideMonth = calendar.view === "month" && !day.date.startsWith(`${calendar.period}-`);
                  const categories = appearanceCategoryDisplayOrder.filter((category) =>
                    day.items.some((item) => item.category === category),
                  );
                  const guestMarker = getCalendarGuestMarker(
                    day.items.flatMap((item) => item.sessions),
                  );
                  const receptionLabels = aggregateReceptionCalendarLabels(day.deadlines ?? [], day.date);
                  const remainingMilestones = receptionLabels.slice(2).reduce((sum, milestone) => sum + milestone.count, 0);
                  return (
                    <td key={day.date}>
                      <button
                        className={`appearance-calendar__day${isOutsideMonth ? " appearance-calendar__day--outside-month" : ""}`}
                        type="button"
                        aria-label={`${day.label}、出演情報${day.items.length}件、受付・販売${day.deadlines?.length ?? 0}件${receptionLabels.map((milestone) => `、${milestone.label}${milestone.count}件`).join("")}${categories.length > 0 ? `、${categories.join("・")}` : ""}${guestMarker ? `、${guestMarker}` : ""}${day.isToday ? "、今日" : ""}`}
                        aria-pressed={day.date === selectedDay.date}
                        aria-current={day.isToday ? "date" : undefined}
                        aria-controls={detailsId}
                        onClick={() => setSelectedDate(day.date)}
                      >
                        <span className="appearance-calendar__date-row">
                          <time className="appearance-calendar__date" dateTime={day.date}>
                            {isOutsideMonth ? `${Number(day.date.slice(5, 7))}/${day.dayNumber}` : day.dayNumber}
                          </time>
                          {day.isToday && <span className="appearance-calendar__today-label">今日</span>}
                        </span>
                        {receptionLabels.length > 0 && <span className="appearance-calendar__milestones" aria-hidden="true">{receptionLabels.slice(0, 2).map((milestone) => <span className="appearance-calendar__milestone" key={milestone.label} title={`${milestone.label}${milestone.count}件`}><span className="appearance-calendar__milestone-label">{milestone.label}</span><span className="appearance-calendar__milestone-compact">{milestone.compactLabel}</span>{milestone.count > 1 && <span className="appearance-calendar__milestone-count">{milestone.count}</span>}</span>)}{remainingMilestones > 0 && <span className="appearance-calendar__milestone-more">ほか{remainingMilestones}件</span>}</span>}
                        {guestMarker && <span className="appearance-calendar__guest-marker" aria-hidden="true" title={guestMarker}><span className="appearance-calendar__guest-full">{guestMarker}</span><span className="appearance-calendar__guest-compact">ゲスト</span></span>}
                        {day.items.length > 0 && (
                          <>
                            <span className="appearance-calendar__category-markers" aria-hidden="true">
                              {categories.map((category) => (
                                <span
                                  className={`appearance-calendar__category-dot ${categoryClassNames[category]}`}
                                  title={category}
                                  key={category}
                                />
                              ))}
                            </span>
                            <span className="appearance-calendar__events" aria-hidden="true">
                              {day.items.slice(0, 3).map((item) => (
                                <span
                                  className={`appearance-calendar__event ${categoryClassNames[item.category]}`}
                                  key={item.id}
                                  title={item.title}
                                >
                                  {item.title}
                                </span>
                              ))}
                              {day.items.length > 3 && (
                                <span className="appearance-calendar__more">ほか{day.items.length - 3}件</span>
                              )}
                            </span>
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="appearance-calendar__hint">
        {hasItems ? (showDeadlines ? "日付を選ぶと、下に出演情報と受付・販売情報を表示します。" : "日付を選ぶと、下に出演情報を表示します。") : emptyMessage}
      </p>

      <section className={`appearance-calendar__details${selectedHasItems ? "" : " appearance-calendar__details--empty"}`} id={detailsId} aria-labelledby={detailsHeadingId}>
        <div className="appearance-calendar__details-heading" aria-live="polite" aria-atomic="true">
          <h3 id={detailsHeadingId}><time dateTime={selectedDay.date}>{selectedDay.label}</time></h3>
          <span>{selectedHasItems ? `出演${selectedDay.items.length}件・受付・販売${selectedDay.deadlines?.length ?? 0}件` : "掲載予定なし"}</span>
        </div>
        {selectedDay.items.length > 0 ? (
          <div className="appearance-grid">
            {selectedDay.items.map((item) => (
              <AppearanceCard item={item} key={item.id} agenda headingLevel={4} deadlines={relatedDeadlines} now={now} />
            ))}
          </div>
        ) : null}
        {(selectedDay.deadlines?.length ?? 0) > 0 && <div className="appearance-calendar__deadline-details"><h4>この日の受付・販売情報</h4><div className="appearance-grid">{selectedDay.deadlines!.map((item) => <div key={item.id}><p className="deadline-card__label">{getReceptionCalendarLabels(item, selectedDay.date).join("・")}</p><DeadlineCard item={item} now={now} headingLevel={4} /></div>)}</div></div>}
      </section>
    </div>
  );
}
