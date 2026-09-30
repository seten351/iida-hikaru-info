"use client";

import { useId, useState } from "react";

import type { Deadline } from "@/domain/deadline";
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
        <div className="appearance-calendar__controls">
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
          <nav className="appearance-calendar__navigation" aria-label={`${periodUnit}の移動`}>
            <button
              type="button"
              disabled={calendar.previousPeriod === null}
              aria-controls={calendarId}
              onClick={() => changePeriod(calendar.previousPeriod)}
            >
              <span aria-hidden="true">‹</span> 前{periodUnit}
            </button>
            <button
              className="appearance-calendar__current"
              type="button"
              disabled={calendar.isCurrentPeriod}
              aria-controls={calendarId}
              onClick={() => changePeriod(null)}
            >
              今{periodUnit}に戻る
            </button>
            <button
              type="button"
              disabled={calendar.nextPeriod === null}
              aria-controls={calendarId}
              onClick={() => changePeriod(calendar.nextPeriod)}
            >
              翌{periodUnit} <span aria-hidden="true">›</span>
            </button>
          </nav>
        </div>
      </div>

      {hasItems && (
        <ul className="appearance-calendar__legend" aria-label="カテゴリの色分け">
          {days.some((day) => (day.deadlines?.length ?? 0) > 0) && <li><span className="appearance-calendar__deadline-dot" aria-hidden="true" />申し込み締切</li>}
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
                  return (
                    <td key={day.date}>
                      <button
                        className={`appearance-calendar__day${isOutsideMonth ? " appearance-calendar__day--outside-month" : ""}`}
                        type="button"
                        aria-label={`${day.label}、出演情報${day.items.length}件、締切${day.deadlines?.length ?? 0}件${categories.length > 0 ? `、${categories.join("・")}` : ""}${guestMarker ? `、${guestMarker}` : ""}${day.isToday ? "、今日" : ""}`}
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
                        {(day.deadlines?.length ?? 0) > 0 && <span className="appearance-calendar__deadline-count"><span className="appearance-calendar__deadline-dot" aria-hidden="true" />締切{day.deadlines!.length}件</span>}
                        {guestMarker && <span className="appearance-calendar__guest-marker">{guestMarker}</span>}
                        {day.items.length > 0 && (
                          <>
                            <span className="appearance-calendar__count">出演{day.items.length}件</span>
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
        {hasItems ? (showDeadlines ? "日付を選ぶと、下に出演情報と申し込み締切を表示します。" : "日付を選ぶと、下に出演情報を表示します。") : emptyMessage}
      </p>

      <section className="appearance-calendar__details" id={detailsId} aria-labelledby={detailsHeadingId}>
        <div className="appearance-calendar__details-heading" aria-live="polite" aria-atomic="true">
          <h3 id={detailsHeadingId}><time dateTime={selectedDay.date}>{selectedDay.label}</time></h3>
          <span>出演{selectedDay.items.length}件・締切{selectedDay.deadlines?.length ?? 0}件</span>
        </div>
        {selectedDay.items.length > 0 ? (
          <div className="appearance-grid">
            {selectedDay.items.map((item) => (
              <AppearanceCard item={item} key={item.id} agenda headingLevel={4} deadlines={relatedDeadlines} now={now} />
            ))}
          </div>
        ) : (selectedDay.deadlines?.length ?? 0) === 0 ? (
          <p className="appearance-calendar__empty">この日に掲載されている出演情報・締切はありません。</p>
        ) : null}
        {(selectedDay.deadlines?.length ?? 0) > 0 && <div className="appearance-calendar__deadline-details"><h4>この日の申し込み締切</h4><div className="appearance-grid">{selectedDay.deadlines!.map((item) => <DeadlineCard item={item} key={item.id} now={now} headingLevel={4} />)}</div></div>}
      </section>
    </div>
  );
}
