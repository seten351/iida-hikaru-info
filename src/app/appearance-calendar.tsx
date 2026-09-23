"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { AppearanceCard } from "@/app/appearance-card";
import { appearanceCategoryDisplayOrder } from "@/domain/appearance";
import { categoryClassNames } from "@/lib/appearances";
import {
  createAppearanceCalendarPeriodHref,
  type AppearanceCalendar as AppearanceCalendarData,
} from "@/lib/appearance-schedule";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

export function AppearanceCalendar({
  calendar,
  currentSearchParams,
  emptyMessage,
}: {
  calendar: AppearanceCalendarData;
  currentSearchParams: string;
  emptyMessage: string;
}) {
  const [selectedDate, setSelectedDate] = useState(calendar.initialSelectedDay);
  const id = useId();
  const headingId = `${id}-period`;
  const detailsId = `${id}-details`;
  const detailsHeadingId = `${id}-day`;
  const days = calendar.weeks.flat().filter((day) => day !== null);
  const selectedDay = days.find((day) => day.date === selectedDate)!;
  const hasItems = days.some((day) => day.items.length > 0);
  const visibleCategories = new Set(days.flatMap((day) => day.items.map((item) => item.category)));
  const periodUnit = calendar.view === "week" ? "週" : "月";
  const hrefFor = (period: string | null) =>
    createAppearanceCalendarPeriodHref("/", currentSearchParams, calendar.view, period);

  return (
    <div className={`appearance-calendar appearance-calendar--${calendar.view}`}>
      <div className="appearance-calendar__toolbar">
        <div className="appearance-calendar__period">
          <p className="appearance-calendar__timezone">JAPAN TIME</p>
          <h3 id={headingId}>{calendar.label}</h3>
        </div>
        <nav className="appearance-calendar__navigation" aria-label={`${periodUnit}の移動`}>
          {calendar.previousPeriod === null ? (
            <span aria-disabled="true">前{periodUnit}</span>
          ) : (
            <Link href={hrefFor(calendar.previousPeriod)} scroll={false}>
              <span aria-hidden="true">‹</span> 前{periodUnit}
            </Link>
          )}
          {calendar.isCurrentPeriod ? (
            <span className="appearance-calendar__current" aria-disabled="true">
              今{periodUnit}に戻る
            </span>
          ) : (
            <Link className="appearance-calendar__current" href={hrefFor(null)} scroll={false}>
              今{periodUnit}に戻る
            </Link>
          )}
          {calendar.nextPeriod === null ? (
            <span aria-disabled="true">翌{periodUnit}</span>
          ) : (
            <Link href={hrefFor(calendar.nextPeriod)} scroll={false}>
              翌{periodUnit} <span aria-hidden="true">›</span>
            </Link>
          )}
        </nav>
      </div>

      {hasItems && (
        <ul className="appearance-calendar__legend" aria-label="カテゴリの色分け">
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

      <div className="appearance-calendar__frame">
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
                  const categories = appearanceCategoryDisplayOrder.filter((category) =>
                    day.items.some((item) => item.category === category),
                  );
                  return (
                    <td key={day.date}>
                      <button
                        className="appearance-calendar__day"
                        type="button"
                        aria-label={`${day.label}、出演情報${day.items.length}件${categories.length > 0 ? `、${categories.join("・")}` : ""}${day.isToday ? "、今日" : ""}`}
                        aria-pressed={day.date === selectedDate}
                        aria-current={day.isToday ? "date" : undefined}
                        aria-controls={detailsId}
                        onClick={() => setSelectedDate(day.date)}
                      >
                        <span className="appearance-calendar__date-row">
                          <time className="appearance-calendar__date" dateTime={day.date}>
                            {day.dayNumber}
                          </time>
                          {day.isToday && <span className="appearance-calendar__today-label">今日</span>}
                        </span>
                        {day.items.length > 0 && (
                          <>
                            <span className="appearance-calendar__count">{day.items.length}件</span>
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
        {hasItems ? "日付を選ぶと、下に詳しい出演情報を表示します。" : emptyMessage}
      </p>

      <section className="appearance-calendar__details" id={detailsId} aria-labelledby={detailsHeadingId}>
        <div className="appearance-calendar__details-heading" aria-live="polite" aria-atomic="true">
          <h3 id={detailsHeadingId}><time dateTime={selectedDay.date}>{selectedDay.label}</time></h3>
          <span>{selectedDay.items.length}件の出演情報</span>
        </div>
        {selectedDay.items.length > 0 ? (
          <div className="appearance-grid">
            {selectedDay.items.map((item) => (
              <AppearanceCard item={item} key={item.id} agenda headingLevel={4} />
            ))}
          </div>
        ) : (
          <p className="appearance-calendar__empty">この日に掲載されている出演情報はありません。</p>
        )}
      </section>
    </div>
  );
}
