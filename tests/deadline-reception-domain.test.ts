import assert from "node:assert/strict";
import test from "node:test";
import {
  deadlineFingerprint,
  getReceptionFields,
  getReceptionStatus,
  isReceptionFinished,
  validateDeadlineFields,
  validateReceptionPhase,
  type AdminDeadlineFields,
} from "../src/domain/deadline";
import { deadlineOperationHash, normalizeDeadlineOperation } from "../scripts/deadline-operation";

const base: AdminDeadlineFields = {
  id: "goods-sale",
  label: "公式グッズ通販",
  projectTitle: "記念グッズ",
  organizer: "公式ストア",
  projectType: "official",
  seriesId: null,
  deadlinePrecision: "unknown",
  deadlineAt: null,
  deadlineOn: null,
  applicationUrl: "https://example.com/store/item",
  note: null,
  state: "scheduled",
  appearanceIds: [],
  informationType: "online_sale",
  startsAtPrecision: "date",
  startsAt: null,
  startsOn: "2026-10-01",
  phaseOverride: "auto",
  saleMode: "initial",
};

test("date-only sale start with unknown end stays date-only and changes phase at JST midnight", () => {
  const validated = validateDeadlineFields(base, true);
  assert.equal(validated.startsAtPrecision, "date");
  assert.equal(validated.startsOn, "2026-10-01");
  assert.equal(validated.startsAt, null);
  assert.equal(validated.deadlinePrecision, "unknown");
  assert.equal(validated.deadlineAt, null);
  assert.equal(validated.deadlineOn, null);

  assert.equal(getReceptionStatus(validated, new Date("2026-10-01T02:00:00Z")), "start_today");
  assert.equal(getReceptionStatus(validated, new Date("2026-10-01T14:59:59Z")), "start_today");
  assert.equal(getReceptionStatus(validated, new Date("2026-10-01T15:00:00Z")), "open");
  assert.equal(isReceptionFinished(validated, new Date("2026-10-01T15:00:00Z")), false);
});

test("confirmed phases supplement uncertain dates and cannot override an exact start or elapsed end", () => {
  const now = new Date("2026-10-01T02:00:00Z");
  const open = { ...base, phaseOverride: "open" as const };
  assert.doesNotThrow(() => validateReceptionPhase(open, now));
  assert.equal(getReceptionStatus(open, now), "open");
  assert.throws(() => validateReceptionPhase({ ...open, startsAtPrecision: "exact", startsAt: "2026-10-01T03:00:00Z", startsOn: null }, now), /矛盾/);
  assert.throws(() => validateReceptionPhase({ ...open, startsOn: "2026-10-02" }, now), /矛盾/);
  assert.throws(() => validateReceptionPhase({ ...base, phaseOverride: "not_open", startsOn: "2026-09-30" }, now), /矛盾/);
  const ended = { ...open, deadlinePrecision: "exact" as const, deadlineAt: "2026-10-01T02:00:00Z" };
  assert.throws(() => validateReceptionPhase(ended, now), /矛盾/);
  assert.equal(getReceptionStatus(ended, now), "expired");
  const future = { ...base, startsAtPrecision: "exact" as const, startsAt: "2026-10-01T03:00:00Z", startsOn: null, phaseOverride: "not_open" as const };
  assert.doesNotThrow(() => validateReceptionPhase(future, now));
  assert.equal(getReceptionStatus(future, now), "not_open");
  assert.equal(getReceptionStatus(future, new Date("2026-10-01T03:00:00Z")), "open", "an earlier confirmation must not freeze the status after its exact start");
  assert.equal(getReceptionStatus({ ...base, phaseOverride: "not_open" }, new Date("2026-10-01T15:00:00Z")), "open", "date-only starts become known to have started on the next JST day");
});

test("v2 hash covers every extension field and official evidence and rejects unsupported schemas", () => {
  const input = { kind: "deadline", schemaVersion: 2, operation: "create", expectedVersion: null, fields: base,
    source: { canonicalUrl: "https://example.com/news/sale", sourceName: "official:store", externalItemId: "sale", evidenceKey: "sale", precision: "date", publishedAt: null, publishedOn: "2026-09-30" } };
  const hash = deadlineOperationHash(input);
  for (const change of [{ informationType: "made_to_order" }, { startsAtPrecision: "unknown", startsOn: null }, { startsOn: "2026-10-02" }, { phaseOverride: "open" }, { saleMode: "resale" }, { state: "sold_out" }]) {
    assert.notEqual(deadlineOperationHash({ ...input, fields: { ...base, ...change } }), hash);
  }
  assert.notEqual(deadlineOperationHash({ ...input, evidenceSources: [{ ...input.source, canonicalUrl: "https://example.com/news/stock", externalItemId: "stock", evidenceKey: "stock" }] }), hash);
  assert.throws(() => normalizeDeadlineOperation({ ...input, schemaVersion: 3 }), /schemaVersion/);
  assert.throws(() => normalizeDeadlineOperation({ ...input, source: { ...input.source, canonicalUrl: "https://example.com/" } }), /個別/);
  assert.throws(() => normalizeDeadlineOperation({ ...input, fields: { ...base, startsAt: "2026-10-01T00:00:00Z" } }), /日付のみ/);
});

test("start-only, end-only, and wholly unknown timing are valid without inferred endpoints", () => {
  const startOnly = validateDeadlineFields(base, true);
  const endOnly = validateDeadlineFields({
    ...base,
    startsAtPrecision: "unknown",
    startsOn: null,
    deadlinePrecision: "date",
    deadlineOn: "2026-10-04",
  }, true);
  const unknown = validateDeadlineFields({
    ...base,
    startsAtPrecision: "unknown",
    startsOn: null,
  }, true);

  assert.equal(startOnly.startsAt, null);
  assert.equal(startOnly.deadlineAt, null);
  assert.equal(endOnly.startsAt, null);
  assert.equal(endOnly.startsOn, null);
  assert.equal(endOnly.deadlineAt, null);
  assert.equal(unknown.startsAt, null);
  assert.equal(unknown.startsOn, null);
  assert.equal(unknown.deadlineAt, null);
  assert.equal(unknown.deadlineOn, null);
  assert.equal(getReceptionStatus(endOnly, new Date("2026-10-01T00:00:00Z")), "unknown");
  assert.equal(getReceptionStatus(unknown, new Date("2026-10-01T00:00:00Z")), "unknown");
});

test("exact and date-only starts retain their own precision and reject reversed known ranges", () => {
  const exact = validateDeadlineFields({
    ...base,
    startsAtPrecision: "exact",
    startsAt: "2026-10-01T09:30:00+09:00",
    startsOn: null,
    deadlinePrecision: "exact",
    deadlineAt: "2026-10-01T12:00:00+09:00",
  }, true);
  assert.equal(exact.startsAt, "2026-10-01T00:30:00.000Z");
  assert.equal(exact.startsOn, null);
  assert.equal(exact.deadlineAt, "2026-10-01T03:00:00.000Z");

  assert.throws(() => validateDeadlineFields({
    ...base,
    startsAtPrecision: "date",
    startsOn: "2026-10-05",
    deadlinePrecision: "date",
    deadlineOn: "2026-10-04",
  }, true));
  assert.throws(() => validateDeadlineFields({
    ...base,
    startsAtPrecision: "exact",
    startsAt: "2026-10-05T09:00:00+09:00",
    startsOn: null,
    deadlinePrecision: "exact",
    deadlineAt: "2026-10-05T08:00:00+09:00",
  }, true));
});

test("legacy records receive neutral defaults and sale state is centrally computed", () => {
  assert.deepEqual(getReceptionFields({}), {
    informationType: "unspecified",
    startsAtPrecision: "unknown",
    startsAt: null,
    startsOn: null,
    phaseOverride: "auto",
    saleMode: "initial",
  });
  assert.equal(getReceptionStatus({ ...base, state: "sold_out" }, new Date("2026-10-01T00:00:00Z")), "sold_out");
  assert.equal(isReceptionFinished({ ...base, state: "sold_out" }, new Date("2026-10-01T00:00:00Z")), true);
  assert.equal(getReceptionStatus({ ...base, phaseOverride: "not_open" }, new Date("2026-10-01T00:00:00Z")), "not_open");
});

test("extension and resale fields do not change existing deadline fingerprint identity", () => {
  assert.equal(deadlineFingerprint(base), deadlineFingerprint({
    ...base,
    deadlinePrecision: "date",
    deadlineOn: "2026-10-20",
    startsAtPrecision: "date",
    startsOn: "2026-10-10",
    state: "sold_out",
    saleMode: "resale",
  }));
});

test("legacy v1 operation canonical hash and normalized shape stay byte-compatible", () => {
  const legacy = {
    kind: "deadline",
    operation: "create",
    expectedVersion: null,
    fields: {
      id: "ticket-test",
      label: "先行抽選",
      projectTitle: "テスト企画",
      organizer: "主催者",
      projectType: "official",
      seriesId: null,
      deadlinePrecision: "exact",
      deadlineAt: "2026-10-08T12:00:00+09:00",
      deadlineOn: null,
      applicationUrl: "https://example.com/apply",
      note: null,
      state: "scheduled",
      appearanceIds: [],
    },
    source: {
      canonicalUrl: "https://example.com/news/legacy",
      sourceName: "official:test",
      externalItemId: "legacy",
      evidenceKey: "legacy",
      precision: "date",
      publishedAt: null,
      publishedOn: "2026-09-30",
    },
  };
  assert.equal(deadlineOperationHash(legacy), "37a1705aa8e8884c34306c684cab75da0b775fc9a069bc965056bcadf732762d");
  assert.deepEqual(normalizeDeadlineOperation(legacy), {
    kind: "deadline",
    operation: "create",
    expectedVersion: null,
    fields: {
      id: "ticket-test", label: "先行抽選", projectTitle: "テスト企画", organizer: "主催者", projectType: "official",
      seriesId: null, deadlinePrecision: "exact", deadlineAt: "2026-10-08T03:00:00.000Z", deadlineOn: null,
      applicationUrl: "https://example.com/apply", note: null, state: "scheduled", appearanceIds: [],
    },
    source: {
      canonicalUrl: "https://example.com/news/legacy", sourceName: "official:test", externalItemId: "legacy",
      evidenceKey: "legacy", precision: "date", publishedAt: null, publishedOn: "2026-09-30",
    },
  });
});
