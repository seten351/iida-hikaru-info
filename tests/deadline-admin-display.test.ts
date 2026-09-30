import assert from "node:assert/strict";
import test from "node:test";

import { formatAdminDeadline } from "../src/app/admin/(protected)/deadlines/_components";

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
