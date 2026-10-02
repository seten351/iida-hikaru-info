import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Deadline } from "../src/domain/deadline";
import { AppearanceCalendar } from "../src/app/appearance-calendar";
import { getAppearanceSchedule } from "../src/lib/appearance-schedule";

const now = "2026-10-02T12:00:00+09:00";
const reception: Deadline = {
  id: "ticket", label: "申込受付", projectTitle: "秋の公演", organizer: "公演主催者",
  projectType: "official", seriesId: null, seriesName: null, category: "イベント",
  informationType: "ticket_application", startsAtPrecision: "date", startsOn: "2026-10-02", startsAt: null,
  deadlinePrecision: "date", deadlineOn: "2026-10-02", deadlineAt: null,
  applicationUrl: "https://example.com/apply", note: null, state: "scheduled", appearanceIds: [], targets: [],
  sourceUrls: ["https://example.com/news/1"],
  publication: { publishedAtPrecision: "date", publishedAt: null, publishedOn: "2026-09-01", collectedAt: "2026-09-01T00:00:00+09:00" },
};

function render(items: Deadline[]) {
  const calendar = getAppearanceSchedule([], new Date(now), "month", {}, items).calendar!;
  return renderToStaticMarkup(<AppearanceCalendar calendar={calendar} now={now} availableYears={["2026"]} onPeriodChange={() => {}} emptyMessage="掲載予定なし" />);
}

test("calendar shows start and end milestones while ARIA counts unique records", () => {
  const html = render([reception, reception]);
  assert.match(html, /出演情報0件、受付・販売1件、締切1件、受付開始1件/);
  assert.match(html, /class="appearance-calendar__milestone-label">締切/);
  assert.match(html, /class="appearance-calendar__milestone-label">受付開始/);
  assert.match(html, /class="appearance-calendar__milestone-compact">受付始/);
  assert.doesNotMatch(html, /appearance-calendar__deadline-count/);
  assert.match(html, /受付開始・締切/);
  assert.match(html, /この日の受付・販売情報/);
  assert.match(html, /秋の公演/);
  assert.doesNotMatch(html, /appearance-calendar__empty/);
});

test("calendar limits visible milestone types and retains all full labels in ARIA and details", () => {
  const sale = { ...reception, id: "sale", informationType: "online_sale" as const, projectTitle: "公演グッズ" };
  const otherStart = { ...reception, id: "later-ticket", deadlineOn: "2026-10-03" };
  const html = render([reception, sale, otherStart]);
  assert.match(html, /受付・販売3件、締切1件、販売終了1件、受付開始2件、販売開始1件/);
  const dayButton = html.match(/<button[^>]*aria-label="10月2日[^]*?<\/button>/)?.[0];
  assert.ok(dayButton);
  assert.equal((dayButton.match(/class="appearance-calendar__milestone"/g) ?? []).length, 2);
  assert.match(dayButton, /appearance-calendar__milestone-more">ほか3件/);
  assert.match(html, /販売開始・販売終了/);
  assert.match(html, /公演グッズ/);
  assert.doesNotMatch(html, /23:59/);
});

test("empty selected date uses one compact status without repeated zero counts or a card", () => {
  const html = render([]);
  const details = html.slice(html.indexOf('<section class="appearance-calendar__details'));
  assert.match(details, /appearance-calendar__details--empty/);
  assert.match(details, /<span>掲載予定なし<\/span>/);
  assert.doesNotMatch(details, /出演0件|受付・販売0件|appearance-calendar__empty|appearance-grid|deadline-card/);
  assert.match(details, /dateTime="2026-10-02"/);
});

test("month picker and navigation retain native controls and accessible labels", () => {
  const html = render([]);
  assert.match(html, /role="group" aria-label="表示する年月と月の移動"/);
  assert.match(html, /<select aria-label="表示する年" aria-controls="[^"]+"/);
  assert.match(html, /<select aria-label="表示する月" aria-controls="[^"]+"/);
  assert.match(html, /aria-label="前月"/);
  assert.match(html, /aria-label="翌月"/);
  assert.match(html, /aria-label="今月に戻る"/);
  assert.match(html, /<h3[^>]*aria-live="polite" aria-atomic="true">2026年10月/);
  assert.match(html, /aria-pressed="true" aria-current="date" aria-controls=/);
});
