import assert from "node:assert/strict";
import test from "node:test";
import { deadlineImportData } from "../scripts/deadline-import-data";
import { planDeadlineImport, type ExistingDeadline } from "../scripts/deadline-import-plan";
import type { DeadlineImportItem } from "../scripts/deadline-import-data";

const item: DeadlineImportItem = {
  fields: {
    id: "event-entry-2026",
    label: "先行抽選",
    projectTitle: "夏のイベント",
    organizer: "公式運営",
    projectType: "official",
    seriesId: null,
    deadlinePrecision: "date",
    deadlineAt: null,
    deadlineOn: "2026-07-01",
    applicationUrl: "https://example.test/app",
    note: null,
    state: "scheduled",
    appearanceIds: ["summer-event-2026"],
  },
  source: {
    canonicalUrl: "https://example.test/news/123",
    sourceName: "example-news",
    externalItemId: "news-123",
    evidenceKey: "announcement",
    precision: "date",
    publishedAt: null,
    publishedOn: "2026-05-01",
  },
};

function existing(overrides: Partial<ExistingDeadline> = {}): ExistingDeadline {
  return {
    ...item.fields,
    version: 4,
    visibilityStatus: "public",
    source: { ...item.source },
    ...overrides,
  };
}

test("deadline data starts empty until official records are researched", () => {
  assert.deepEqual(deadlineImportData, []);
});

test("planner classifies creates, unchanged rows, and versioned updates", () => {
  assert.equal(planDeadlineImport([item], [])[0]?.operation, "create");
  assert.equal(planDeadlineImport([item], [existing()])[0]?.operation, "unchanged");

  const changed = { ...item, fields: { ...item.fields, note: "更新" } };
  assert.deepEqual(planDeadlineImport([changed], [existing()])[0], {
    operation: "update", item: changed, deadlineId: item.fields.id, expectedVersion: 4,
  });
});

test("planner does not restore hidden deadlines", () => {
  const result = planDeadlineImport([item], [existing({ visibilityStatus: "hidden" })]);
  assert.equal(result[0]?.operation, "hidden");
});

test("planner catches normalized source evidence and same stage across IDs", () => {
  const sameSource = existing({ id: "other-deadline", source: { ...item.source, canonicalUrl: "https://EXAMPLE.test/news/123#top" } });
  const sourceResult = planDeadlineImport([item], [sameSource])[0];
  assert.equal(sourceResult?.operation, "duplicate");

  const sameStage = existing({
    id: "other-deadline",
    source: { ...item.source, canonicalUrl: "https://example.test/news/elsewhere", evidenceKey: "another-notice" },
  });
  const stageResult = planDeadlineImport([item], [sameStage])[0];
  assert.equal(stageResult?.operation, "duplicate");
});

test("linked-target fingerprint ignores changes to its display title", () => {
  const other = existing({
    id: "other-id",
    projectTitle: "出演後に変わった表示名",
    source: { ...item.source, canonicalUrl: "https://example.test/other-notice", evidenceKey: "another-notice" },
  });
  assert.equal(planDeadlineImport([item], [other])[0]?.operation, "duplicate");
});

test("planner detects duplicate IDs and fingerprints within the import batch", () => {
  const duplicateId = { ...item, source: { ...item.source, evidenceKey: "second-evidence" } };
  assert.equal(planDeadlineImport([item, duplicateId], [])[1]?.operation, "duplicate");

  const sameFingerprint = {
    ...item,
    fields: { ...item.fields, id: "another-id" },
    source: { ...item.source, canonicalUrl: "https://example.test/other-notice", evidenceKey: "another-notice" },
  };
  assert.equal(planDeadlineImport([item, sameFingerprint], [])[1]?.operation, "duplicate");
});

test("an update that collides with a different existing ID is rejected in preflight", () => {
  const other = existing({
    id: "other-id",
    source: { ...item.source, canonicalUrl: "https://example.test/other-notice", evidenceKey: "another-notice" },
  });
  const changed = { ...item, fields: { ...item.fields, note: "new note" } };
  assert.equal(planDeadlineImport([changed], [existing(), other])[0]?.operation, "duplicate");
});

test("same source page can support another evidence key or another stage", () => {
  const anotherEvidence = existing({
    id: "event-entry-2026-general",
    label: "一般販売",
    source: { ...item.source, evidenceKey: "updated-deadline" },
  });
  assert.equal(planDeadlineImport([item], [anotherEvidence])[0]?.operation, "create");

  const anotherStage = existing({ id: "event-entry-2026-general", label: "一般販売", source: { ...item.source, evidenceKey: "general-sale" } });
  assert.equal(planDeadlineImport([item], [anotherStage])[0]?.operation, "create");
});

test("preflight checks all active source evidence, including non-primary links", () => {
  const other = existing({ id: "other-id", label: "一般販売", source: { ...item.source, canonicalUrl: "https://example.test/news/other" },
    sourceEvidence: [ { canonicalUrl: "https://example.test/news/other", evidenceKey: "notice" }, { canonicalUrl: item.source.canonicalUrl, evidenceKey: item.source.evidenceKey } ],
  });
  assert.equal(planDeadlineImport([item], [other])[0]?.operation, "duplicate");
});

test("a batch rejects one source identity assigned to different canonical pages", () => {
  const other = { fields: { ...item.fields, id: "other-entry", label: "別受付" }, source: { ...item.source, canonicalUrl: "https://example.test/news/elsewhere", evidenceKey: "other-evidence" } };
  assert.equal(planDeadlineImport([item, other], [])[1]?.operation, "duplicate");
});
