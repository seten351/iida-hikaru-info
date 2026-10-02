import assert from "node:assert/strict";
import test from "node:test";

import { formatAdminDeadline, formatAdminReceptionStart, formatAdminReceptionEnd } from "../src/app/admin/(protected)/deadlines/_components";

test("admin deadline dates display in Japan time even across a UTC date boundary", () => {
  const formatted = formatAdminDeadline({ deadlinePrecision: "exact", deadlineAt: "2026-09-30T15:00:00Z", deadlineOn: null });
  assert.match(formatted, /2026\/10\/01/);
  assert.match(formatted, /0:00/);
  assert.match(formatted, /日本時間/);
});

test("a date-only admin deadline explicitly preserves its unknown time", () => {
  const formatted = formatAdminDeadline({ deadlinePrecision: "date", deadlineAt: null, deadlineOn: "2026-10-01" });
  assert.equal(formatted, "2026-10-01（時刻未確認・日本時間）");
  assert.doesNotMatch(formatted, /23:59|0:00/);
});

test("unknown deadline precision does not invent an admin deadline date", () => {
  assert.equal(formatAdminDeadline({ deadlinePrecision: "unknown", deadlineAt: null, deadlineOn: null }), "締切日時未定");
});

test("admin supports a date-only merchandise start and unknown end independently", () => {
  const fields = {
    startsAtPrecision: "date" as const, startsAt: null, startsOn: "2026-10-01",
    deadlinePrecision: "unknown" as const, deadlineAt: null, deadlineOn: null,
  };
  assert.equal(formatAdminReceptionStart(fields), "2026-10-01（時刻未確認・日本時間）");
  assert.equal(formatAdminReceptionEnd(fields), "終了日時未確認");
  assert.doesNotMatch(formatAdminReceptionStart(fields), /23:59|0:00/);
});

test("legacy records and both-unknown inputs show unknown starts without adding dates", () => {
  assert.equal(formatAdminReceptionStart({}), "開始日時未確認");
  assert.equal(formatAdminReceptionStart({ startsAtPrecision: "unknown", startsAt: null, startsOn: null }), "開始日時未確認");
});

test("exact reception starts use Japan time without affecting date-only starts", () => {
  assert.match(formatAdminReceptionStart({ startsAtPrecision: "exact", startsAt: "2026-09-30T15:00:00Z", startsOn: null }), /2026\/10\/01/);
});
