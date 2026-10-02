import assert from "node:assert/strict";
import { test } from "node:test";
import type { Deadline } from "../src/domain/deadline";
import { aggregateReceptionCalendarLabels, createDeadlineListViewHref, createDeadlineTypeHref, formatReceptionBoundaryCompact, getDeadlineListItems, getDesktopReceptionPreview, getReceptionPresentation, getUrgentReceptions, groupDeadlineListItems, parseDeadlineListView } from "../src/lib/reception-presentation";

const now = new Date("2026-10-02T12:00:00+09:00");
function item(id: string, extra: Partial<Deadline> = {}): Deadline {
  return { id, label: "受付", projectTitle: id, organizer: "公式", projectType: "official", seriesId: null, seriesName: null, category: "その他", informationType: "ticket_application", startsAtPrecision: "unknown", startsAt: null, startsOn: null, phaseOverride: "auto", saleMode: "initial", deadlinePrecision: "date", deadlineAt: null, deadlineOn: "2026-10-10", state: "scheduled", applicationUrl: null, note: null, appearanceIds: [], targets: [], sourceUrls: [], publication: { publishedAtPrecision: "unknown", publishedAt: null, publishedOn: null, collectedAt: "2026-10-01T00:00:00+09:00" }, ...extra };
}
const ids = (items: Deadline[]) => items.map(item => item.id);

test("mobile urgency prioritizes today ends, starts, then three-JST-day ends and deduplicates", () => {
  const start = item("start", { startsAtPrecision: "exact", startsAt: "2026-10-02T13:00:00+09:00", deadlinePrecision: "unknown", deadlineOn: null });
  const today = item("today", { deadlineOn: "2026-10-02" });
  const near = item("near", { deadlineOn: "2026-10-05" });
  const input = [near, start, today, today, item("later", { deadlineOn: "2026-10-06" }), item("closed", { state: "closed", deadlineOn: "2026-10-02" })];
  assert.deepEqual(getUrgentReceptions(input, now).map(entry => [entry.item.id, entry.boundary]), [["today", "end"], ["start", "start"]]);
  assert.deepEqual(getUrgentReceptions([near], now).map(entry => entry.item.id), ["near"]);
  assert.deepEqual(input.map(item => item.id), ["near", "start", "today", "today", "later", "closed"]);
});

test("exact start window includes 24 hours but not elapsed or later starts", () => {
  const start = (id: string, startsAt: string) => item(id, { startsAtPrecision: "exact", startsAt, deadlinePrecision: "unknown", deadlineOn: null });
  assert.deepEqual(getUrgentReceptions([start("boundary", "2026-10-03T12:00:00+09:00"), start("outside", "2026-10-03T12:00:01+09:00"), start("elapsed", "2026-10-02T12:00:00+09:00")], now).map(entry => entry.item.id), ["boundary"]);
});

test("date-only starts stay uncertain and urgency changes at Tokyo midnight without invented timestamps", () => {
  const sale = item("sale", { informationType: "online_sale", startsAtPrecision: "date", startsOn: "2026-10-02", deadlinePrecision: "unknown", deadlineOn: null });
  const result = getUrgentReceptions([sale], new Date("2026-10-02T14:59:59Z"))[0];
  assert.match(result.label, /本日販売開始・時刻未確認/);
  assert.equal(formatReceptionBoundaryCompact(sale, "start"), "2026/10/2 時刻未確認");
  assert.deepEqual(getUrgentReceptions([sale], new Date("2026-10-02T15:00:00Z")), []);
  assert.deepEqual(getUrgentReceptions([item("no-dates", { deadlinePrecision: "unknown", deadlineOn: null })], now), []);
});

test("exact cutoff excludes equality and finished or sold-out states take precedence", () => {
  const cutoff = item("cutoff", { deadlinePrecision: "exact", deadlineAt: "2026-10-02T12:00:00+09:00", deadlineOn: null });
  assert.equal(getUrgentReceptions([cutoff], new Date(now.getTime() - 1)).length, 1);
  assert.deepEqual(getUrgentReceptions([cutoff, item("sold", { state: "sold_out", deadlineOn: "2026-10-02", saleMode: "resale" })], now), []);
});

test("purpose views keep legacy finished searches and their URL constraints", () => {
  assert.equal(parseDeadlineListView(undefined, "sold_out"), "finished");
  assert.equal(parseDeadlineListView("active", "sold_out"), "active");
  assert.equal(parseDeadlineListView("invalid"), "active");
  const query = "q=長い作品&series=hikaroom&receptionStatus=open&receptionType=online_sale&custom=keep&page=5";
  const url = new URL(createDeadlineListViewHref(query, "ending"), "https://example.com");
  assert.equal(url.searchParams.get("q"), "長い作品");
  assert.equal(url.searchParams.get("receptionStatus"), "open");
  assert.equal(url.searchParams.get("custom"), "keep");
  assert.equal(url.searchParams.get("page"), "1");
  assert.equal(url.hash, "#deadlines");
  const typeUrl = new URL(createDeadlineTypeHref(url.search.slice(1), null), "https://example.com");
  assert.equal(typeUrl.searchParams.get("receptionView"), "ending");
  assert.equal(typeUrl.searchParams.has("receptionType"), false);
});

test("classification shows each ID once, starts before dated placement and terminal states first", () => {
  const future = item("future", { startsAtPrecision: "date", startsOn: "2026-10-03" });
  const open = item("open", { informationType: "online_sale", phaseOverride: "open", deadlinePrecision: "unknown", deadlineOn: null });
  const unknown = item("unknown", { deadlinePrecision: "unknown", deadlineOn: null });
  const ended = item("ended", { state: "sold_out" });
  const input = [future, future, open, unknown, ended, item("dated")];
  const groups = groupDeadlineListItems(input, now);
  assert.deepEqual(groups.map(group => [group.key, ids(group.items)]), [["ending", ["dated"]], ["starting", ["future"]], ["open", ["open"]], ["unknown", ["unknown"]], ["finished", ["ended"]]]);
  assert.deepEqual(ids(getDeadlineListItems(input, now, "starting")), ["future"]);
  assert.deepEqual(ids(getDeadlineListItems(input, now, "finished")), ["ended"]);
});

test("phase, urgency, unknown end and resale remain independent", () => {
  const unknown = getReceptionPresentation(item("uncertain", { deadlineOn: "2026-10-03" }), now);
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.stateLabel, "状態未確認");
  assert.equal(unknown.urgencyLabel, "締切間近");
  const sale = getReceptionPresentation(item("sale", { informationType: "online_sale", startsAtPrecision: "date", startsOn: "2026-10-01", deadlinePrecision: "unknown", deadlineOn: null, saleMode: "resale" }), now);
  assert.equal(sale.stateLabel, "販売中");
  assert.equal(sale.resaleLabel, "再販");
  assert.equal(sale.nextBoundary, "end");
  assert.equal(sale.urgencyLabel, null);
});

test("calendar aggregates both milestones per record without double-counting duplicate IDs", () => {
  const sale = item("sale", { informationType: "online_sale", startsAtPrecision: "date", startsOn: "2026-10-02", deadlineOn: "2026-10-02" });
  const signup = item("signup", { startsAtPrecision: "date", startsOn: "2026-10-02", deadlineOn: "2026-10-02" });
  assert.deepEqual(aggregateReceptionCalendarLabels([sale, sale, signup], "2026-10-02").map(entry => [entry.label, entry.count]), [["締切", 1], ["販売終了", 1], ["受付開始", 1], ["販売開始", 1]]);
  assert.deepEqual(aggregateReceptionCalendarLabels([sale], "2026-10-03"), []);
});

test("desktop reserves a start slot beside two ending entries and caps total at three", () => {
  const start = item("start", { startsAtPrecision: "date", startsOn: "2026-10-03", deadlinePrecision: "unknown", deadlineOn: null });
  const input = [item("end-1"), item("end-2", { deadlineOn: "2026-10-11" }), item("end-3", { deadlineOn: "2026-10-12" }), start];
  const preview = getDesktopReceptionPreview(input, now);
  assert.deepEqual(ids(preview.ending), ["end-1", "end-2"]);
  assert.deepEqual(ids(preview.starting), ["start"]);
  assert.equal(new Set([...preview.ending, ...preview.starting].map(item => item.id)).size, 3);
});
