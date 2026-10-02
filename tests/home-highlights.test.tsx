import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DeadlineCard, RelatedDeadlines } from "../src/app/deadline-card";
import { HomeHighlights } from "../src/app/home-highlights";
import { SiteHeader } from "../src/app/site-chrome";
import type { AppearanceCard } from "../src/lib/appearances";
import { groupAppearanceCards, sortAppearanceCardsByPublication } from "../src/lib/appearances";
import { getAppearanceHistoryPage, paginateAppearanceHistory } from "../src/lib/appearance-pagination";
import type { AppearanceFilters } from "../src/lib/appearance-filters";
import { createPublicHomeHref, createPublicListHref } from "../src/lib/public-list-navigation";
import { createDeadlineDetailHref, getStartingReceptionPreview, getUpcomingDeadlinePreview } from "../src/lib/deadlines";
import type { Deadline } from "../src/domain/deadline";

const now = new Date("2026-09-30T10:00:00+09:00");
const nowString = now.toISOString();
const filters: AppearanceFilters = {
  q: "ヒカ ルーム",
  series: "hikaroom",
  category: "配信",
  year: "2026",
};

function card(id: string, publication: Partial<AppearanceCard["publication"]>, overrides: Partial<AppearanceCard> = {}): AppearanceCard {
  return {
    id,
    title: `出演情報 ${id}`,
    seriesId: "hikaroom",
    seriesName: "飯田ヒカルのヒカROOM！",
    category: "配信",
    sessions: [{ id: `${id}-session`, startsAtPrecision: "unknown", startsAt: null, startsOn: null, sessionLabel: null }],
    sourceUrls: [`https://example.com/${id}`],
    publication: {
      publishedAtPrecision: "date",
      publishedAt: null,
      publishedOn: "2026-09-01",
      collectedAt: "2026-09-01T00:00:00+09:00",
      ...publication,
    },
    isGrouped: false,
    ...overrides,
  };
}

function deadline(id: string, overrides: Partial<Deadline> = {}): Deadline {
  return {
    id,
    label: "参加申し込み",
    projectTitle: `企画 ${id}`,
    organizer: "主催者の詳細",
    projectType: "fan",
    seriesId: null,
    seriesName: null,
    category: "その他",
    deadlinePrecision: "date",
    deadlineAt: null,
    deadlineOn: "2026-10-10",
    applicationUrl: `https://example.com/apply/${id}`,
    note: "詳細な補足情報",
    state: "scheduled",
    appearanceIds: [],
    targets: [],
    sourceUrls: [`https://example.com/source/${id}`],
    publication: {
      publishedAtPrecision: "date",
      publishedAt: null,
      publishedOn: "2026-09-01",
      collectedAt: "2026-09-01T00:00:00+09:00",
    },
    ...overrides,
  };
}

test("publication sorting uses the shared publication comparator and keeps grouped cards intact", () => {
  const grouped = card("grouped", { publishedAtPrecision: "exact", publishedAt: "2026-09-28T15:00:00+09:00", publishedOn: null }, {
    isGrouped: true,
    title: "合同公演（全2公演）",
    sessions: [
      { id: "afternoon", startsAtPrecision: "date", startsAt: null, startsOn: "2026-10-01", sessionLabel: "昼公演" },
      { id: "evening", startsAtPrecision: "date", startsAt: null, startsOn: "2026-10-01", sessionLabel: "夜公演" },
    ],
  });
  const input = [
    card("older", { publishedOn: "2026-09-20" }),
    grouped,
    card("newest", { publishedAtPrecision: "exact", publishedAt: "2026-09-30T08:00:00+09:00", publishedOn: null }),
  ];
  const sorted = sortAppearanceCardsByPublication(input);
  assert.deepEqual(sorted.map((item) => item.id), ["newest", "grouped", "older"]);
  assert.deepEqual(input.map((item) => item.id), ["older", "grouped", "newest"]);
  assert.equal(sorted[1].isGrouped, true);
  assert.deepEqual(sorted[1].sessions.map((session) => session.id), ["afternoon", "evening"]);
  assert.deepEqual(groupAppearanceCards(input, now).latest.map((item) => item.id), ["newest", "grouped", "older"]);
});

test("deadline preview sorts upcoming entries, excludes finished entries, and caps at three", () => {
  const input = [
    deadline("later", { deadlineOn: "2026-11-01" }),
    deadline("closed", { state: "closed" }),
    deadline("unknown", { deadlinePrecision: "unknown", deadlineOn: null }),
    deadline("next", { deadlineOn: "2026-10-05" }),
    deadline("at-cutoff", { deadlinePrecision: "exact", deadlineAt: "2026-09-30T10:00:00+09:00", deadlineOn: null }),
    deadline("cancelled", { state: "cancelled" }),
    deadline("expired", { deadlineOn: "2026-09-29" }),
  ];
  const preview = getUpcomingDeadlinePreview(input, now);
  assert.deepEqual(preview.map((item) => item.id), ["next", "later", "unknown"]);
  assert.deepEqual(input.map((item) => item.id), ["later", "closed", "unknown", "next", "at-cutoff", "cancelled", "expired"]);
  const beforeCutoff = new Date("2026-09-30T09:59:59+09:00");
  assert.deepEqual(getUpcomingDeadlinePreview(input, beforeCutoff).map((item) => item.id), ["at-cutoff", "next", "later"]);
  assert.deepEqual(getUpcomingDeadlinePreview([deadline("before-cutoff", { deadlinePrecision: "exact", deadlineAt: "2026-09-30T10:00:00+09:00", deadlineOn: null })], beforeCutoff).map((item) => item.id), ["before-cutoff"]);
  assert.deepEqual(getUpcomingDeadlinePreview([deadline("at-cutoff", { deadlinePrecision: "exact", deadlineAt: "2026-09-30T10:00:00+09:00", deadlineOn: null })], now), []);
  const dateOnlyToday = [deadline("date-only-today", { deadlineOn: "2026-09-30" })];
  assert.deepEqual(getUpcomingDeadlinePreview(dateOnlyToday, new Date("2026-09-30T23:59:59+09:00")).map((item) => item.id), ["date-only-today"]);
  assert.deepEqual(getUpcomingDeadlinePreview(dateOnlyToday, new Date("2026-10-01T00:00:00+09:00")), []);
  assert.deepEqual(getUpcomingDeadlinePreview([
    deadline("today-date", { deadlineOn: "2026-09-30" }), deadline("tomorrow-date", { deadlineOn: "2026-10-01" }),
    deadline("only-unknown", { deadlinePrecision: "unknown", deadlineOn: null }),
  ], now).map((item) => item.id), ["today-date", "tomorrow-date", "only-unknown"]);
  assert.deepEqual(getUpcomingDeadlinePreview([
    deadline("closed-only", { state: "closed" }),
    deadline("cancelled-only", { state: "cancelled" }),
    deadline("expired-only", { deadlineOn: "2026-09-29" }),
  ], now), []);
});

test("public navigation carries only active filters and home section anchors", () => {
  assert.equal(createPublicListHref("/news", filters), "/news?q=%E3%83%92%E3%82%AB+%E3%83%AB%E3%83%BC%E3%83%A0&series=hikaroom&category=%E9%85%8D%E4%BF%A1&year=2026");
  assert.equal(createPublicListHref("/deadlines", { ...filters, q: "", series: null, category: null, year: null }), "/deadlines");
  assert.equal(createPublicHomeHref(filters, "latest"), "/?q=%E3%83%92%E3%82%AB+%E3%83%AB%E3%83%BC%E3%83%A0&series=hikaroom&category=%E9%85%8D%E4%BF%A1&year=2026#latest");
  assert.equal(createPublicHomeHref(filters, "deadlines"), "/?q=%E3%83%92%E3%82%AB+%E3%83%AB%E3%83%BC%E3%83%A0&series=hikaroom&category=%E9%85%8D%E4%BF%A1&year=2026#deadlines");
});

test("news history pagination keeps the existing 30-item page size", () => {
  const items = Array.from({ length: 61 }, (_, index) => card(`news-${index + 1}`, { publishedOn: "2026-09-01" }));
  assert.equal(getAppearanceHistoryPage("2", items.length).totalPages, 3);
  assert.deepEqual(paginateAppearanceHistory(items, 1).map((item) => item.id), items.slice(0, 30).map((item) => item.id));
  assert.deepEqual(paginateAppearanceHistory(items, 2).map((item) => item.id), items.slice(30, 60).map((item) => item.id));
  assert.deepEqual(paginateAppearanceHistory(items, 3).map((item) => item.id), ["news-61"]);
});

test("home highlights render at most three latest cards and three active deadlines with filtered more links", () => {
  const latest = ["old", "middle", "newest", "fourth"].map((id, index) => card(id, { publishedOn: `2026-09-${String(20 + index).padStart(2, "0")}` }));
  const deadlines = [deadline("later", { deadlineOn: "2026-11-01" }), deadline("closed", { state: "closed" }), deadline("soon", { deadlineOn: "2026-10-02" }), deadline("cancelled", { state: "cancelled" }), deadline("unknown", { deadlinePrecision: "unknown", deadlineOn: null }), deadline("expired", { deadlineOn: "2026-09-29" }), deadline("fourth", { deadlineOn: "2026-12-01" })];
  const html = renderToStaticMarkup(<HomeHighlights latest={latest} deadlines={deadlines} now={nowString} isFiltering={true} filters={filters} />);

  assert.match(html, /id="latest"/);
  assert.match(html, /id="deadlines"/);
  assert.match(html, /新着/);
  assert.match(html, /受付・販売/);
  assert.equal((html.match(/class="latest-appearance"/g) ?? []).length, 3);
  assert.equal((html.match(/deadline-card deadline-card--/g) ?? []).length, 3);
  assert.match(html, /href="\/news\?q=/);
  assert.match(html, /href="\/deadlines\?q=/);
  assert.doesNotMatch(html, /href="\/\?[^\"]*(?:page|view)=/);
  assert.doesNotMatch(html, /締切済みを含める/);
  assert.doesNotMatch(html, /企画 closed|企画 cancelled|企画 expired/);
  assert.match(html, /企画 soon/);
  assert.match(html, /企画 later/);
  assert.match(html, /企画 fourth/);
  assert.doesNotMatch(html, /企画 unknown/);
});

test("legacy unknown deadlines fill remaining slots after dated deadlines", () => {
  const html = renderToStaticMarkup(<HomeHighlights
    latest={[]}
    deadlines={[
      deadline("dated-first", { deadlineOn: "2026-10-02" }),
      deadline("dated-second", { deadlineOn: "2026-10-03" }),
      deadline("unknown", { deadlinePrecision: "unknown", deadlineOn: null }),
    ]}
    now={nowString}
    isFiltering={false}
    filters={{ q: "", series: null, category: null, year: null }}
  />);
  assert.match(html, /企画 dated-first/);
  assert.match(html, /企画 dated-second/);
  assert.match(html, /企画 unknown/);
});

test("home highlights show clear empty states and more links when filtering returns no items", () => {
  const html = renderToStaticMarkup(<HomeHighlights latest={[]} deadlines={[]} now={nowString} isFiltering={true} filters={filters} />);
  assert.match(html, /条件に一致する出演情報はありません/);
  assert.match(html, /条件に一致する受付・販売情報はありません/);
  assert.match(html, /href="\/news\?q=/);
  assert.match(html, /href="\/deadlines\?q=/);
});

test("deadline summary preserves essential information and detail anchor while full cards retain full context", () => {
  const item = deadline("event-2026", { targets: [{
    id: "appearance-1", title: "対象公演", eventTitle: "対象イベント", sessionLabel: "昼公演", category: "イベント", seriesId: null, seriesName: null,
    startsAtPrecision: "date", startsAt: null, startsOn: "2026-10-01",
  }] });
  const summary = renderToStaticMarkup(<DeadlineCard item={item} now={nowString} variant="summary" />);
  const full = renderToStaticMarkup(<DeadlineCard item={item} now={nowString} />);
  assert.match(summary, /href="\/deadlines#deadline-event-2026"/);
  assert.match(summary, /企画 event-2026/);
  assert.match(summary, /参加申し込み/);
  assert.match(full, /ファン企画/);
  assert.match(summary, /締切/);
  assert.match(summary, /告知元/);
  assert.doesNotMatch(summary, /主催：主催者の詳細|対象イベント|詳細な補足情報|告知 2026/);
  assert.match(full, /主催：主催者の詳細/);
  assert.match(full, /対象イベント/);
  assert.match(full, /詳細な補足情報/);
  assert.match(full, /告知 2026/);
});

test("deadline detail anchors encode IDs and related-deadline links open the unfiltered full list", () => {
  assert.equal(createDeadlineDetailHref("event id/1"), "/deadlines#deadline-event%20id%2F1");
  const related = renderToStaticMarkup(<RelatedDeadlines items={[deadline("event-2026", { label: "当日券申し込み" })]} now={nowString} />);
  assert.match(related, /href="\/deadlines#deadline-event-2026"/);
  assert.doesNotMatch(related, /\?q=|series=|category=|year=/);
});

test("desktop home caps combined shelves at three without duplicating deadline-priority items", () => {
  const clock = new Date("2026-10-02T12:00:00+09:00");
  const sale = (id: string, day: string) => deadline(id, { informationType: "online_sale", startsAtPrecision: "date", startsAt: null, startsOn: day, deadlinePrecision: "unknown", deadlineOn: null });
  const priority = deadline("cutoff", { informationType: "made_to_order", startsAtPrecision: "date", startsOn: "2026-10-05", deadlineOn: "2026-10-10" });
  const input = [sale("older", "2026-10-01"), sale("future-late", "2026-10-07"), priority, sale("future-soon", "2026-10-03"), sale("future-next", "2026-10-04")];
  const primary = getUpcomingDeadlinePreview(input, clock);
  assert.deepEqual(primary.map(item => item.id), ["cutoff"]);
  assert.deepEqual(getStartingReceptionPreview(input, clock, primary).map(item => item.id), ["future-soon", "future-next", "future-late"]);
  assert.deepEqual(getStartingReceptionPreview([sale("older", "2026-09-01"), sale("newer", "2026-10-01")], clock).map(item => item.id), ["newer", "older"]);
  const html = renderToStaticMarkup(<HomeHighlights latest={[]} deadlines={input} now={clock.toISOString()} isFiltering={false} filters={{ q: "", series: null, category: null, year: null }} />);
  assert.equal((html.match(/href="\/deadlines#deadline-cutoff"/g) ?? []).length, 1);
  assert.equal((html.match(/deadline-card deadline-card--/g) ?? []).length, 3);
  assert.match(html, /開始予定・その他の受付・販売/);
  assert.doesNotMatch(html, /企画 older/);
  const startOnly = renderToStaticMarkup(<HomeHighlights latest={[]} deadlines={[sale("older", "2026-10-01")]} now={clock.toISOString()} isFiltering={false} filters={{ q: "", series: null, category: null, year: null }} />);
  assert.match(startOnly, /企画 older/);
  assert.doesNotMatch(startOnly, /現在お知らせできる受付・販売情報はありません/);
});

test("reception-only query parameters cross home/deadlines boundaries and are excluded from news links", () => {
  const receptionFilters: AppearanceFilters = { q: "", series: null, category: null, year: null, receptionType: "online_sale", receptionStatus: "open" };
  assert.equal(createPublicListHref("/deadlines", receptionFilters), "/deadlines?receptionType=online_sale&receptionStatus=open");
  assert.equal(createPublicHomeHref(receptionFilters, "deadlines"), "/?receptionType=online_sale&receptionStatus=open#deadlines");
  assert.equal(createPublicListHref("/news", receptionFilters), "/news");
});

test("mobile urgent region is omitted when no information needs action", () => {
  const html = renderToStaticMarkup(<HomeHighlights latest={[]} deadlines={[deadline("later", { deadlineOn: "2026-12-01" })]} now={nowString} isFiltering={false} filters={{ q: "", series: null, category: null, year: null }} />);
  assert.doesNotMatch(html, /class="home-urgent"|role="tablist"|role="tabpanel"/);
  assert.match(html, /id="latest"/);
  assert.match(html, /id="deadlines"/);
  assert.match(html, /新着一覧/);
  assert.match(html, /受付・販売一覧/);
});

test("mobile urgent links cap two and use unfiltered detail anchors", () => {
  const html = renderToStaticMarkup(<HomeHighlights latest={[]} deadlines={[1, 2, 3].map(index => deadline(`today-${index}`, { deadlineOn: "2026-09-30", projectType: "fan" }))} now={nowString} isFiltering={false} filters={filters} />);
  assert.equal((html.match(/class="home-urgent__item"/g) ?? []).length, 2);
  assert.match(html, /href="\/deadlines#deadline-today-1"/);
  assert.match(html, /本日締切/);
  assert.match(html, /ファン企画/);
});

test("header separates list destinations from home anchors and carries filters", () => {
  const html = renderToStaticMarkup(<SiteHeader home filters={{ ...filters, receptionStatus: "open" }} />);
  assert.match(html, /href="\/news\?q=/);
  assert.match(html, /href="\/deadlines\?q=[^"]*receptionStatus=open/);
  assert.match(html, /href="#upcoming"/);
  assert.match(html, /href="#history"/);
  assert.doesNotMatch(html, /href="#latest"|href="#deadlines"/);
  const away = renderToStaticMarkup(<SiteHeader currentPage="news" filters={filters} />);
  assert.match(away, /href="\/\?q=[^"]*#upcoming"/);
  assert.match(away, /aria-current="page"/);
});
