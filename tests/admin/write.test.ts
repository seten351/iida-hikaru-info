import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdminPreviewToken,
  verifyAdminPreviewToken,
} from "../../src/server/admin/preview-token";
import {
  AdminWriteValidationError,
  parseAdminWriteInput,
} from "../../src/server/admin/write-input";
import { decodeAppearanceRevisionSnapshot } from "../../src/server/appearances/revisions";

const secret = "preview-secret-with-at-least-thirty-two-bytes";
const appearanceInput = {
  kind: "appearance",
  operation: "create",
  expectedVersion: null,
  fields: {
    id: "phase2b-test",
    startsAtPrecision: "exact",
    startsAt: "2026-09-06T18:00:00+09:00",
    startsOn: null,
    title: " Phase 2B test ",
    seriesId: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
    category: "その他",
  },
  source: {
    canonicalUrl: "https://example.com/item?b=2&a=1#fragment",
    sourceName: "admin-test",
    externalItemId: "item-1",
    evidenceKey: "default",
    precision: "date",
    publishedAt: null,
    publishedOn: "2026-09-05",
  },
} as const;

test("Admin write input normalizes exact startsAt and preserves publication precision", () => {
  const parsed = parseAdminWriteInput(appearanceInput);
  assert.equal(parsed.kind, "appearance");
  assert.equal(parsed.operation, "create");
  assert.equal(parsed.fields.title, "Phase 2B test");
  assert.equal(parsed.fields.startsAtPrecision, "exact");
  assert.equal(parsed.fields.startsAt, "2026-09-06T09:00:00.000Z");
  assert.equal(parsed.fields.startsOn, null);
  assert.equal(parsed.source.precision, "date");
  assert.equal(parsed.source.publishedAt, null);
  assert.equal(parsed.source.publishedOn, "2026-09-05");
});

test("Admin write input accepts date and unknown start precision without invented times", () => {
  const dateParsed = parseAdminWriteInput({
    ...appearanceInput,
    fields: {
      ...appearanceInput.fields,
      startsAtPrecision: "date",
      startsAt: null,
      startsOn: "2026-09-17",
    },
  });
  assert.equal(dateParsed.kind, "appearance");
  assert.equal(dateParsed.operation, "create");
  assert.deepEqual(
    {
      startsAtPrecision: dateParsed.fields.startsAtPrecision,
      startsAt: dateParsed.fields.startsAt,
      startsOn: dateParsed.fields.startsOn,
    },
    { startsAtPrecision: "date", startsAt: null, startsOn: "2026-09-17" },
  );

  const unknownParsed = parseAdminWriteInput({
    ...appearanceInput,
    fields: {
      ...appearanceInput.fields,
      startsAtPrecision: "unknown",
      startsAt: null,
      startsOn: null,
    },
  });
  assert.equal(unknownParsed.kind, "appearance");
  assert.equal(unknownParsed.operation, "create");
  assert.deepEqual(
    {
      startsAtPrecision: unknownParsed.fields.startsAtPrecision,
      startsAt: unknownParsed.fields.startsAt,
      startsOn: unknownParsed.fields.startsOn,
    },
    { startsAtPrecision: "unknown", startsAt: null, startsOn: null },
  );
});

test("Admin write input rejects mismatched start precision fields", () => {
  const invalidFields = [
    { startsAtPrecision: "exact", startsAt: null, startsOn: null },
    { startsAtPrecision: "exact", startsAt: appearanceInput.fields.startsAt, startsOn: "2026-09-06" },
    { startsAtPrecision: "date", startsAt: null, startsOn: null },
    { startsAtPrecision: "date", startsAt: appearanceInput.fields.startsAt, startsOn: "2026-09-06" },
    { startsAtPrecision: "unknown", startsAt: appearanceInput.fields.startsAt, startsOn: null },
    { startsAtPrecision: "unknown", startsAt: null, startsOn: "2026-09-06" },
  ] as const;

  for (const fields of invalidFields) {
    assert.throws(
      () => parseAdminWriteInput({
        ...appearanceInput,
        fields: { ...appearanceInput.fields, ...fields },
      }),
      AdminWriteValidationError,
    );
  }
});

test("Admin write input accepts the game category", () => {
  const parsed = parseAdminWriteInput({
    ...appearanceInput,
    fields: { ...appearanceInput.fields, category: "ゲーム" },
  });
  assert.equal(parsed.kind, "appearance");
  assert.equal(parsed.operation, "create");
  if (parsed.kind !== "appearance" || parsed.operation !== "create") {
    assert.fail("Expected an appearance create input.");
  }
  assert.equal(parsed.fields.category, "ゲーム");
});

test("Admin write input rejects partial event grouping and bad precision", () => {
  assert.throws(
    () => parseAdminWriteInput({
      ...appearanceInput,
      fields: { ...appearanceInput.fields, eventGroupId: "event-only" },
    }),
    AdminWriteValidationError,
  );
  assert.throws(
    () => parseAdminWriteInput({
      ...appearanceInput,
      source: { ...appearanceInput.source, precision: "exact", publishedAt: null },
    }),
    AdminWriteValidationError,
  );
});

const groupUpdateInput = {
  kind: "appearance-group",
  operation: "update",
  eventGroupId: "gakuen-idolmaster-fukuoka",
  eventTitle: " 学園アイドルマスター LIVE TOUR -標- 福岡公演 ",
  targets: [
    {
      appearanceId: "gakuen-idolmaster-fukuoka-day1",
      expectedVersion: 4,
      title: " 学園アイドルマスター LIVE TOUR -標- 福岡公演 DAY1 ",
    },
    {
      appearanceId: "gakuen-idolmaster-fukuoka-day2",
      expectedVersion: 7,
      title: " 学園アイドルマスター LIVE TOUR -標- 福岡公演 DAY2 ",
    },
  ],
} as const;

test("Event group batch input normalizes every target for one atomic preview", () => {
  const parsed = parseAdminWriteInput(groupUpdateInput);
  assert.equal(parsed.kind, "appearance-group");
  assert.equal(parsed.eventTitle, "学園アイドルマスター LIVE TOUR -標- 福岡公演");
  assert.deepEqual(parsed.targets, [
    {
      appearanceId: "gakuen-idolmaster-fukuoka-day1",
      expectedVersion: 4,
      title: "学園アイドルマスター LIVE TOUR -標- 福岡公演 DAY1",
    },
    {
      appearanceId: "gakuen-idolmaster-fukuoka-day2",
      expectedVersion: 7,
      title: "学園アイドルマスター LIVE TOUR -標- 福岡公演 DAY2",
    },
  ]);
});

test("Event group batch input rejects a non-atomic target set", () => {
  assert.throws(
    () => parseAdminWriteInput({ ...groupUpdateInput, targets: [groupUpdateInput.targets[0]] }),
    AdminWriteValidationError,
  );
  assert.throws(
    () => parseAdminWriteInput({
      ...groupUpdateInput,
      targets: [groupUpdateInput.targets[0], groupUpdateInput.targets[0]],
    }),
    AdminWriteValidationError,
  );
});

test("Preview token is signed, expiring, and contains revalidated input", () => {
  const now = new Date("2026-09-06T00:00:00.000Z");
  const parsed = parseAdminWriteInput(appearanceInput);
  const token = createAdminPreviewToken(parsed, secret, now);
  const verified = verifyAdminPreviewToken(token, secret, now);
  assert.deepEqual(verified?.input, parsed);
  assert.match(verified?.idempotencyKey ?? "", /^[0-9a-f-]{36}$/);

  const [payload, encodedSignature] = token.split(".");
  const signature = Buffer.from(encodedSignature, "base64url");
  signature[0] ^= 1;
  assert.equal(
    verifyAdminPreviewToken(`${payload}.${signature.toString("base64url")}`, secret, now),
    null,
  );
  assert.equal(
    verifyAdminPreviewToken(token, secret, new Date("2026-09-06T00:15:00.001Z")),
    null,
  );
});

test("Preview token preserves date and unknown start precision", () => {
  const now = new Date("2026-09-06T00:00:00.000Z");
  for (const fields of [
    {
      ...appearanceInput.fields,
      startsAtPrecision: "date" as const,
      startsAt: null,
      startsOn: "2026-09-17",
    },
    {
      ...appearanceInput.fields,
      startsAtPrecision: "unknown" as const,
      startsAt: null,
      startsOn: null,
    },
  ]) {
    const parsed = parseAdminWriteInput({ ...appearanceInput, fields });
    const token = createAdminPreviewToken(parsed, secret, now);
    assert.deepEqual(verifyAdminPreviewToken(token, secret, now)?.input, parsed);
  }
});

test("Preview token preserves the complete event group batch", () => {
  const now = new Date("2026-09-06T00:00:00.000Z");
  const parsed = parseAdminWriteInput(groupUpdateInput);
  const token = createAdminPreviewToken(parsed, secret, now);
  assert.deepEqual(verifyAdminPreviewToken(token, secret, now)?.input, parsed);
});

test("Appearance revision decoder keeps v1/v2 compatibility and accepts v3", () => {
  const snapshot = { appearance: { id: "phase2b-test" }, sourceLinks: [] };
  assert.equal(decodeAppearanceRevisionSnapshot(1, snapshot), snapshot);
  assert.equal(decodeAppearanceRevisionSnapshot(2, snapshot), snapshot);
  assert.equal(decodeAppearanceRevisionSnapshot(3, snapshot), snapshot);
  assert.throws(() => decodeAppearanceRevisionSnapshot(4, snapshot));
});
