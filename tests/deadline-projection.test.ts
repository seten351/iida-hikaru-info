import assert from "node:assert/strict";
import test from "node:test";
import { projectPublicDeadlines } from "../src/lib/deadline-projection";
import type { DeadlineAdminRecord } from "../src/server/deadlines/repository";
import type { Appearance } from "../src/domain/appearance";

const record: DeadlineAdminRecord = {
  id: "entry", label: "申し込み", projectTitle: "登録時の対象名", organizer: "主催", projectType: "official", seriesId: null,
  deadlinePrecision: "date", deadlineAt: null, deadlineOn: "2026-10-01", applicationUrl: null, note: null, state: "scheduled",
  appearanceIds: ["visible", "hidden"], version: 1, visibilityStatus: "public", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
  source: { canonicalUrl: "https://example.com/news/1", sourceName: "official:test", externalItemId: "1", evidenceKey: "entry", precision: "date", publishedAt: null, publishedOn: "2026-09-01" },
  sourceEvidence: [{ canonicalUrl: "https://example.com/news/1", evidenceKey: "entry" }],
  sourceUrls: ["https://example.com/news/1"], sourceUpdatedAt: "2026-09-01T00:00:00Z",
};
const appearance: Appearance = {
  id: "visible", title: "公開公演", eventTitle: "現在のイベント名", eventGroupId: "group", sessionLabel: "昼",
  startsAtPrecision: "date", startsAt: null, startsOn: "2027-01-01", seriesId: "hikaroom", seriesName: "ヒカROOM！", category: "イベント",
  sourceUrls: ["https://example.com/event"], sourceUrl: "https://example.com/event", publishedAtPrecision: "date", publishedAt: null, publishedOn: "2026-09-01", collectedAt: "2026-09-01T00:00:00Z",
};

test("public deadline excludes hidden IDs and private management fields", () => {
  const [item] = projectPublicDeadlines([record], [appearance], []);
  assert.deepEqual(item.appearanceIds, ["visible"]);
  assert.equal(item.projectTitle, "現在のイベント名");
  assert.equal(item.seriesId, "hikaroom");
  for (const text of ["hidden", "visibilityStatus", "sourceUpdatedAt", "externalItemId", "version"]) assert.ok(!JSON.stringify(item).includes(text));
});
test("all-hidden targets and hidden deadlines do not reach public output", () => {
  assert.deepEqual(projectPublicDeadlines([record], [], []), []);
  assert.deepEqual(projectPublicDeadlines([{ ...record, visibilityStatus: "hidden" }], [appearance], []), []);
});
test("standalone fan project and a fan project attached to a public appearance keep their own title", () => {
  const [standalone, related] = projectPublicDeadlines([
    { ...record, id: "standalone", projectType: "fan", seriesId: "hikaroom", appearanceIds: [] },
    { ...record, id: "related", projectType: "fan" },
  ], [appearance], [{ id: "hikaroom", displayName: "ヒカROOM！" }]);
  assert.equal(standalone.category, "その他");
  assert.equal(standalone.seriesName, "ヒカROOM！");
  assert.equal(standalone.projectTitle, "登録時の対象名");
  assert.equal(related.projectTitle, "登録時の対象名");
  assert.equal(related.targets[0].eventTitle, "現在のイベント名");
});
