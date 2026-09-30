import assert from "node:assert/strict";
import test from "node:test";
import { validateDeadlineFields, deadlineFingerprint, type AdminDeadlineFields, type Deadline } from "../src/domain/deadline";
import { compareDeadlines, formatDeadline, getDeadlineStatus } from "../src/lib/deadlines";
import { parseAdminWriteInput } from "../src/server/admin/write-input";

const fields: AdminDeadlineFields = {
  id: "ticket-first", label: "先行抽選", projectTitle: "テスト企画", organizer: "主催者", projectType: "official",
  seriesId: null, deadlinePrecision: "exact", deadlineAt: "2026-10-08T12:00:00+09:00", deadlineOn: null,
  applicationUrl: "https://example.com/apply", note: null, state: "scheduled", appearanceIds: [],
};
const source = { canonicalUrl: "https://example.com/news/first", sourceName: "official:test", externalItemId: "first", evidenceKey: "first", precision: "date", publishedAt: null, publishedOn: "2026-09-30" };

test("deadline urgency uses seven Japanese calendar days and exact cutoff equality", () => {
  for (const [now, expected] of [
    ["2026-09-30T23:59:59+09:00", "scheduled"], ["2026-10-01T00:00:00+09:00", "soon"],
    ["2026-10-07T23:59:59+09:00", "soon"], ["2026-10-08T00:00:00+09:00", "today"],
    ["2026-10-08T11:59:59+09:00", "today"], ["2026-10-08T12:00:00+09:00", "expired"],
  ]) assert.equal(getDeadlineStatus(fields, new Date(now)), expected, now);
});

test("date-only is not expired on cutoff date and changes at the next Tokyo midnight", () => {
  const dateOnly = { ...fields, deadlinePrecision: "date" as const, deadlineAt: null, deadlineOn: "2026-12-31" };
  assert.equal(getDeadlineStatus(dateOnly, new Date("2026-12-31T14:59:59Z")), "today");
  assert.equal(getDeadlineStatus(dateOnly, new Date("2026-12-31T15:00:00Z")), "expired");
  assert.match(formatDeadline(dateOnly), /時刻未確認/);
  assert.doesNotMatch(formatDeadline(dateOnly), /23:59/);
});

test("manual closed and cancelled states override cutoff and unknown remains unknown", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  assert.equal(getDeadlineStatus({ ...fields, state: "closed" }, now), "closed");
  assert.equal(getDeadlineStatus({ ...fields, state: "cancelled" }, now), "cancelled");
  assert.equal(getDeadlineStatus({ ...fields, deadlinePrecision: "unknown", deadlineAt: null }, now), "unknown");
});

test("deadline validator rejects invalid dates, mixed precision, duplicates, and credential URLs", () => {
  for (const invalid of [
    { ...fields, deadlineAt: "2026-02-30T12:00:00+09:00" }, { ...fields, deadlineAt: "2026-10-08T12:00:00" },
    { ...fields, deadlineOn: "2026-10-08" }, { ...fields, deadlinePrecision: "date", deadlineAt: null, deadlineOn: "2026-02-30" },
    { ...fields, appearanceIds: ["event", "event"] }, { ...fields, appearanceIds: ["event"], seriesId: "hikaroom" },
    { ...fields, applicationUrl: "https://private:credential@example.com/apply" },
  ]) assert.throws(() => validateDeadlineFields(invalid));
  assert.equal(validateDeadlineFields(fields).deadlineAt, "2026-10-08T03:00:00.000Z");
});

test("extension preserves fingerprint while receipt stages and targets differ", () => {
  assert.equal(deadlineFingerprint(fields), deadlineFingerprint({ ...fields, deadlineAt: "2026-10-09T12:00:00+09:00" }));
  assert.notEqual(deadlineFingerprint(fields), deadlineFingerprint({ ...fields, label: "二次抽選" }));
  assert.equal(deadlineFingerprint({ ...fields, appearanceIds: ["event-a", "event-b"] }), deadlineFingerprint({ ...fields, projectTitle: "タイトル変更", appearanceIds: ["event-b", "event-a"] }));
});

test("mixed offsets sort by actual time, date-only after known times, unknown last", () => {
  const base = { ...fields, seriesName: null, category: "イベント", targets: [], sourceUrls: [], publication: { publishedAtPrecision: "unknown", publishedAt: null, publishedOn: null, collectedAt: "2026-09-01T00:00:00Z" } } as Deadline;
  const items = [
    { ...base, id: "late", deadlineAt: "2026-10-08T12:00:00+09:00" },
    { ...base, id: "early", deadlineAt: "2026-10-08T00:00:00Z" },
    { ...base, id: "date", deadlinePrecision: "date" as const, deadlineAt: null, deadlineOn: "2026-10-08" },
    { ...base, id: "unknown", deadlinePrecision: "unknown" as const, deadlineAt: null },
  ];
  assert.deepEqual(items.sort(compareDeadlines).map(item => item.id), ["early", "late", "date", "unknown"]);
});

test("X publication comes from Snowflake even if input timestamp is omitted", () => {
  const input = parseAdminWriteInput({ kind: "deadline", operation: "create", fields, expectedVersion: null,
    source: { ...source, canonicalUrl: "https://x.com/onsenradio/status/2104877138507862070", sourceName: "x:onsenradio", externalItemId: "2104877138507862070", precision: "exact", publishedAt: null, publishedOn: null },
  });
  assert.ok(input.kind === "deadline" && input.operation === "create");
  assert.equal(input.source.precision, "exact");
  assert.match(input.source.publishedAt!, /^2026-09-29T10:13:/);
  assert.equal(input.source.publishedOn, null);
  assert.deepEqual(parseAdminWriteInput(input), input);
});

test("deadline write rejects generic source pages and changed IDs", () => {
  assert.throws(() => parseAdminWriteInput({ kind: "deadline", operation: "create", fields, source: { ...source, canonicalUrl: "https://example.com" } }));
  assert.throws(() => parseAdminWriteInput({ kind: "deadline", operation: "update", deadlineId: "different", expectedVersion: 1, fields, source }));
});
