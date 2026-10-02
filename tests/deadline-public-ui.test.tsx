import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Deadline } from "../src/domain/deadline";
import { DeadlineCard } from "../src/app/deadline-card";
import { DeadlineClockProvider } from "../src/app/deadline-clock";
import { DeadlineSection } from "../src/app/deadline-section";
import { DeadlineListControls } from "../src/app/deadline-list-controls";
import { AppearanceCalendar } from "../src/app/appearance-calendar";
import { AppearanceCard } from "../src/app/appearance-card";
import { getAppearanceSchedule } from "../src/lib/appearance-schedule";
import { buildAppearanceCards, groupAppearanceCards } from "../src/lib/appearances";
import { filterAppearanceCards, getAppearanceFilterOptions, parseAppearanceFilters } from "../src/lib/appearance-filters";
import { extendDeadlineFilterOptions, filterDeadlines } from "../src/lib/deadlines";

const now = "2026-09-30T10:00:00+09:00";
const deadline: Deadline = {
  id: "fan-project", label: "参加申し込み", projectTitle: "同人サークル合同企画", organizer: "企画サークル",
  projectType: "fan", seriesId: null, seriesName: null, category: "その他", deadlinePrecision: "date", deadlineOn: "2026-09-30", deadlineAt: null,
  applicationUrl: "https://example.com/apply", note: "受付条件は告知を確認してください。", state: "scheduled", appearanceIds: [], targets: [], sourceUrls: ["https://example.com/announcement/123"],
  publication: { publishedAtPrecision: "date", publishedAt: null, publishedOn: "2026-09-01", collectedAt: "2026-09-01T00:00:00+09:00" },
};

const futureAppearance = {
  id: "event", title: "来年の公演", startsAtPrecision: "date" as const, startsAt: null, startsOn: "2027-01-15",
  seriesId: "hikaroom", seriesName: "ヒカROOM！", eventGroupId: null, eventTitle: null, sessionLabel: null, category: "イベント" as const,
  sourceUrls: ["https://example.com/event"], sourceUrl: "https://example.com/event", publishedAtPrecision: "date" as const, publishedAt: null, publishedOn: "2026-09-01", collectedAt: "2026-09-01T00:00:00+09:00",
};

test("fan deadline shows organizer, exact source, application link, and date precision without inventing a time", () => {
  const html = renderToStaticMarkup(<DeadlineCard item={deadline} now={now} />);
  assert.match(html, /ファン企画/);
  assert.match(html, /主催：企画サークル/);
  assert.match(html, /本日締切/);
  assert.match(html, /時刻未確認・日本時間/);
  assert.match(html, /href="https:\/\/example.com\/apply"/);
  assert.match(html, /href="https:\/\/example.com\/announcement\/123"/);
  assert.doesNotMatch(html, /23:59/);
});

test("finished calls to action do not invite applications and list hides finished history by default", () => {
  const expired = { ...deadline, id: "old", deadlineOn: "2026-09-29" };
  const html = renderToStaticMarkup(<DeadlineCard item={expired} now={now} />);
  assert.match(html, /締切済み/);
  assert.match(html, /受付ページを見る/);
  assert.doesNotMatch(html, /申し込み先を見る/);
  const list = renderToStaticMarkup(<DeadlineSection items={[expired]} now={now} isFiltering={false} />);
  assert.match(list, /現在お知らせできる受付・販売情報はありません/);
  assert.doesNotMatch(list, /同人サークル合同企画/);
  assert.doesNotMatch(list, /checked/);
});

test("shared server clock overrides component fallback consistently for server markup", () => {
  const html = renderToStaticMarkup(<DeadlineClockProvider now={now}><DeadlineCard item={deadline} now="2026-09-29T00:00:00+09:00" /></DeadlineClockProvider>);
  assert.match(html, /本日締切/);
  assert.doesNotMatch(html, /締切間近/);
});

test("calendar has independent unique deadlines and omits undated entries", () => {
  const calendar = getAppearanceSchedule([], new Date(now), "month", {}, [deadline, deadline, { ...deadline, id: "unknown", deadlinePrecision: "unknown", deadlineOn: null }]).calendar!;
  const day = calendar.weeks.flat().find(item => item?.date === "2026-09-30")!;
  assert.equal(day.items.length, 0);
  assert.deepEqual(day.deadlines?.map(item => item.id), ["fan-project"]);
  const html = renderToStaticMarkup(<AppearanceCalendar calendar={calendar} availableYears={["2026"]} onPeriodChange={() => {}} emptyMessage="空" now={now} />);
  assert.match(html, /出演情報0件、受付・販売1件/);
  assert.match(html, /この日の受付・販売情報/);
  assert.match(html, /同人サークル合同企画/);
});

test("next-year appearances and this-year deadlines filter independently while series order is preserved", () => {
  const cards = buildAppearanceCards([futureAppearance]);
  const linked = { ...deadline, projectType: "official" as const, category: "イベント" as const, seriesId: "hikaroom", seriesName: "ヒカROOM！", appearanceIds: ["event"], targets: [futureAppearance] };
  const options = extendDeadlineFilterOptions(getAppearanceFilterOptions(cards), [linked, { ...deadline, seriesId: "standalone-only", seriesName: "単独企画" }]);
  assert.deepEqual(options.years, ["2027", "2026"]);
  assert.deepEqual(options.series.map(item => item.value), ["hikaroom"]);
  assert.ok(options.categories.includes("その他"));
  const filters = parseAppearanceFilters({ year: "2026", series: "hikaroom" }, options);
  assert.deepEqual(filterAppearanceCards(cards, filters), []);
  assert.deepEqual(filterDeadlines([linked], filters).map(item => item.id), ["fan-project"]);
  assert.equal(groupAppearanceCards(cards, new Date(now)).upcoming.length, 1);
  const html = renderToStaticMarkup(<AppearanceCard item={cards[0]} deadlines={[linked]} now={now} />);
  assert.match(html, /関連する受付・販売情報/);
  assert.match(html, /本日締切/);
});

const openSale: Deadline = {
  ...deadline, id: "shop-2026", projectTitle: "記念グッズ", projectType: "official",
  informationType: "online_sale", startsAtPrecision: "date", startsAt: null, startsOn: "2026-10-01",
  deadlinePrecision: "unknown", deadlineAt: null, deadlineOn: null, phaseOverride: "auto", saleMode: "initial",
};

test("October 1 sale without an end preserves date-only precision and becomes open the next day", () => {
  const firstDay = renderToStaticMarkup(<DeadlineCard item={openSale} now="2026-10-01T12:00:00+09:00" />);
  assert.match(firstDay, /本日販売開始・時刻未確認/);
  assert.match(firstDay, /dateTime="2026-10-01"/);
  assert.match(firstDay, /終了日時未確認/);
  assert.doesNotMatch(firstDay, /00:00|23:59|dateTime="2026-10-01T/);
  const nextDay = renderToStaticMarkup(<DeadlineCard item={openSale} now="2026-10-02T12:00:00+09:00" />);
  assert.match(nextDay, /販売中/);
  assert.match(nextDay, /販売ページを見る/);
  const list = renderToStaticMarkup(<DeadlineSection items={[openSale]} now="2026-10-02T12:00:00+09:00" isFiltering={false} />);
  assert.match(list, /終了日時未確認/);
  assert.match(list, /id="deadline-shop-2026"/);
});

test("sale calendars show only start and end milestones and count same-day milestones once", () => {
  const sameDay = { ...openSale, id: "same-day", deadlinePrecision: "date" as const, deadlineOn: "2026-10-01" };
  const period = { ...openSale, id: "period", deadlinePrecision: "date" as const, deadlineOn: "2026-10-04" };
  const calendar = getAppearanceSchedule([], new Date("2026-10-01T12:00:00+09:00"), "month", {}, [openSale, sameDay, period, period]).calendar!;
  const day = (date: string) => calendar.weeks.flat().find(day => day?.date === date)!;
  assert.deepEqual(day("2026-10-01").deadlines?.map(item => item.id).sort(), ["period", "same-day", "shop-2026"]);
  assert.equal(day("2026-10-02").deadlines?.length ?? 0, 0);
  assert.deepEqual(day("2026-10-04").deadlines?.map(item => item.id), ["period"]);
  const html = renderToStaticMarkup(<AppearanceCalendar calendar={calendar} availableYears={["2026"]} onPeriodChange={() => {}} emptyMessage="空" now="2026-10-01T12:00:00+09:00" />);
  assert.match(html, /販売開始・販売終了/);
  assert.match(html, /出演情報0件、受付・販売3件/);
});

test("reception facets and start-year fallback do not filter appearances or alter series priority", () => {
  const cards = buildAppearanceCards([futureAppearance]);
  const options = extendDeadlineFilterOptions(getAppearanceFilterOptions(cards), [openSale]);
  const filters = parseAppearanceFilters({ receptionType: "online_sale", receptionStatus: "open" }, options);
  assert.deepEqual(filterAppearanceCards(cards, filters).map(item => item.id), ["appearance:event"]);
  assert.deepEqual(filterDeadlines([deadline, openSale], filters, new Date("2026-10-02T12:00:00+09:00")).map(item => item.id), ["shop-2026"]);
  assert.deepEqual(filterDeadlines([openSale], { ...filters, year: "2026" }, new Date("2026-10-02T12:00:00+09:00")).map(item => item.id), ["shop-2026"]);
  assert.deepEqual(filterDeadlines([openSale], { ...filters, q: "通常通販" }, new Date("2026-10-02T12:00:00+09:00")).map(item => item.id), ["shop-2026"]);
  const unknown = { ...openSale, startsAtPrecision: "unknown" as const, startsOn: null };
  const list = renderToStaticMarkup(<DeadlineSection items={[unknown]} now="2026-10-02T12:00:00+09:00" isFiltering={false} />);
  assert.match(list, /開始日時未確認/);
  assert.match(list, /状態未確認/);
});

test("sold-out resale stays hidden in completed history and its sales link stays neutral", () => {
  const soldOut = { ...openSale, state: "sold_out" as const, saleMode: "resale" as const };
  const html = renderToStaticMarkup(<DeadlineCard item={soldOut} now="2026-10-02T12:00:00+09:00" />);
  assert.match(html, /deadline-status--sold_out">完売/);
  assert.match(html, /deadline-status--resale">再販/);
  assert.match(html, /販売ページを見る/);
  assert.doesNotMatch(html, /申し込み先を見る/);
  assert.doesNotMatch(renderToStaticMarkup(<DeadlineSection items={[soldOut]} now="2026-10-02T12:00:00+09:00" isFiltering={false} />), /記念グッズ/);
  const filtered = renderToStaticMarkup(<DeadlineSection items={[soldOut]} filters={{ q: "", series: null, category: null, year: null, receptionStatus: "sold_out" }} now="2026-10-02T12:00:00+09:00" isFiltering />);
  assert.match(filtered, /記念グッズ/);
  assert.doesNotMatch(filtered, /条件に一致する受付・販売情報はありません/);
});

test("purpose chips keep search constraints and type chips keep the selected purpose", () => {
  const html = renderToStaticMarkup(<DeadlineListControls view="ending" filters={{ q: "記念", series: "hikaroom", category: null, year: "2026", receptionType: "online_sale", receptionStatus: "open" }} currentSearchParams="q=%E8%A8%98%E5%BF%B5&series=hikaroom&year=2026&receptionType=online_sale&receptionStatus=open&receptionView=ending&page=3" />);
  assert.match(html, /aria-label="受付・販売の目的別表示"/);
  assert.match(html, /aria-current="page">締切・販売終了/);
  assert.match(html, /aria-current="page">通常通販/);
  assert.match(html, /series=hikaroom/);
  assert.match(html, /year=2026/);
  assert.match(html, /receptionStatus=open/);
  assert.match(html, /receptionView=ending/);
  assert.doesNotMatch(html, /page=3/);
});

test("purpose lists separate completed history, future starts, and ending entries", () => {
  const when = "2026-09-30T12:00:00+09:00";
  const old = { ...deadline, id: "old", projectTitle: "終了した企画", deadlineOn: "2026-09-29" };
  const ending = { ...deadline, id: "ending", projectTitle: "本日終了する企画" };
  const starting = { ...openSale, id: "starting", projectTitle: "明日販売する企画" };
  const list = (view: "active" | "ending" | "starting" | "finished" | "all") => renderToStaticMarkup(<DeadlineSection items={[old, ending, starting]} now={when} isFiltering={false} view={view} />);
  assert.match(list("active"), /明日販売する企画/);
  assert.doesNotMatch(list("active"), /終了した企画/);
  assert.match(list("ending"), /本日終了する企画/);
  assert.doesNotMatch(list("ending"), /明日販売する企画/);
  assert.match(list("starting"), /明日販売する企画/);
  assert.doesNotMatch(list("starting"), /本日終了する企画/);
  assert.match(list("finished"), /終了した企画/);
  assert.doesNotMatch(list("finished"), /明日販売する企画/);
  assert.match(list("all"), /終了した企画/);
  assert.match(list("all"), /明日販売する企画/);
});

test("card puts kind before state, future start before end, and keeps exact date metadata", () => {
  const html = renderToStaticMarkup(<DeadlineCard item={{ ...openSale, startsAtPrecision: "exact", startsAt: "2026-10-01T18:00:00+09:00", startsOn: null, sourceUrls: ["https://example.com/one", "https://example.com/two"] }} now={now} />);
  assert.ok(html.indexOf("通常通販・オンライン物販") < html.indexOf("販売開始予定"));
  assert.ok(html.indexOf('data-boundary="start"') < html.indexOf('data-boundary="end"'));
  assert.match(html, /deadline-card__date--next" data-boundary="start"/);
  assert.match(html, /dateTime="2026-10-01T18:00:00\+09:00"/);
  assert.match(html, /href="https:\/\/example.com\/one"/);
  assert.match(html, /href="https:\/\/example.com\/two"/);
  assert.match(html, /告知元 2/);
});

test("status-filtered lists use the shared live clock instead of a stale server facet", () => {
  const before = renderToStaticMarkup(<DeadlineSection items={[openSale]} filters={{ q: "", series: null, category: null, year: null, receptionStatus: "not_open" }} now="2026-09-30T12:00:00+09:00" isFiltering />);
  assert.match(before, /記念グッズ/);
  const after = renderToStaticMarkup(<DeadlineClockProvider now="2026-10-02T12:00:00+09:00"><DeadlineSection items={[openSale]} filters={{ q: "", series: null, category: null, year: null, receptionStatus: "not_open" }} now="2026-09-30T12:00:00+09:00" isFiltering /></DeadlineClockProvider>);
  assert.doesNotMatch(after, /記念グッズ/);
  const nowOpen = renderToStaticMarkup(<DeadlineClockProvider now="2026-10-02T12:00:00+09:00"><DeadlineSection items={[openSale]} filters={{ q: "", series: null, category: null, year: null, receptionStatus: "open" }} now="2026-09-30T12:00:00+09:00" isFiltering /></DeadlineClockProvider>);
  assert.match(nowOpen, /記念グッズ/);
  assert.match(nowOpen, /販売中/);
});
