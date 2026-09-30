import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  appearanceOperationHash,
  normalizeAppearanceOperation,
  parseAppearanceImportArgs,
  runAppearanceOperation,
  type AppearanceOperationSnapshot,
} from "../scripts/admin-appearance-operation";
import { AdminWriteValidationError } from "../src/server/admin/write-input";
import { canonicalizeSourceUrl } from "../src/server/appearances/source-foundation";

const source = {
  canonicalUrl: "https://x.com/official/status/1234567890123456789",
  sourceName: "x:official",
  externalItemId: "1234567890123456789",
  evidenceKey: "guest-announcement",
  precision: "exact",
  publishedAt: "2026-09-30T01:00:00.000Z",
  publishedOn: null,
} as const;

const baseFields = {
  id: "guest-test",
  startsAtPrecision: "date",
  startsAt: null,
  startsOn: "2026-10-01",
  title: "番組ゲスト回",
  seriesId: "test-series",
  eventGroupId: null,
  eventTitle: null,
  sessionLabel: null,
  category: "ラジオ",
} as const;

const updateInput = {
  kind: "appearance",
  operation: "update",
  appearanceId: "guest-test",
  expectedVersion: 4,
  fields: { ...baseFields, guestInfo: { isHikaruGuest: false, guestNames: ["ゲストさん"] } },
  evidenceSources: [source],
} as const;

const current: AppearanceOperationSnapshot = {
  id: "guest-test",
  version: 4,
  visibilityStatus: "public",
  fields: baseFields,
  guestInfo: { isHikaruGuest: null, guestNames: [] },
  publication: { precision: "exact", publishedAt: "2026-09-20T02:03:04.000Z", publishedOn: null },
  sourceLinks: [{
    sourceId: `src_${createHash("sha256").update(canonicalizeSourceUrl("https://example.com/original")).digest("hex").slice(0, 32)}`,
    evidenceKey: "default", active: true, isPrimary: true,
    canonicalUrl: "https://example.com/original", sourceName: "official", externalItemId: "original",
    precision: "exact", publishedAt: "2026-09-20T02:03:04.000Z", publishedOn: null,
  }],
};

test("appearance operation CLI requires a reviewed hash for apply", () => {
  assert.deepEqual(parseAppearanceImportArgs(["--input", "/tmp/appearance.json"]), {
    apply: false,
    inputPath: "/tmp/appearance.json",
  });
  assert.throws(() => parseAppearanceImportArgs([]), /--input/);
  assert.throws(() => parseAppearanceImportArgs(["--input", "x.json", "--apply"]), /--reviewed-hash/);
  assert.throws(() => parseAppearanceImportArgs(["--input", "x.json", "--reviewed-hash", "a"]), /requires --apply/);
});

test("appearance operation accepts only one appearance mutation and permits per-session updates", () => {
  assert.equal(normalizeAppearanceOperation(updateInput).operation, "update");
  assert.throws(() => normalizeAppearanceOperation({ ...updateInput, kind: "appearance-group" }), AdminWriteValidationError);
  const groupedSession = normalizeAppearanceOperation({
    ...updateInput,
    fields: { ...updateInput.fields, eventGroupId: "some-group", eventTitle: "group", sessionLabel: "第1回" },
  });
  assert.equal(groupedSession.kind, "appearance");
});

test("explicit guest updates require evidence and preserve the unconfirmed distinction", () => {
  assert.throws(() => normalizeAppearanceOperation({
    ...updateInput,
    evidenceSources: undefined,
  }), /require evidenceSources/);
  const normalized = normalizeAppearanceOperation(updateInput);
  assert.equal(normalized.kind, "appearance");
  if (normalized.kind === "appearance" && normalized.operation === "update") {
    assert.equal(normalized.fields.guestInfo?.isHikaruGuest, false);
    assert.equal(normalized.evidenceSources?.length, 1);
  }
});

test("dry-run preserves publication and primary source while previewing secondary guest evidence", async () => {
  let validated = 0;
  let confirmed = 0;
  let output = "";
  await runAppearanceOperation(updateInput, { apply: false }, {
    readAppearance: async () => structuredClone(current),
    validatePreview: async () => { validated += 1; },
    confirm: async () => {
      confirmed += 1;
      return { status: "approved", proposalIds: [], targets: [], replayed: false };
    },
    log: (value) => { output = value; },
  });

  assert.equal(validated, 1);
  assert.equal(confirmed, 0);
  const preview = JSON.parse(output);
  assert.deepEqual(preview.before.guestInfo, { isHikaruGuest: null, guestNames: [] });
  assert.deepEqual(preview.after.guestInfo, updateInput.fields.guestInfo);
  assert.deepEqual(preview.after.fields.guestInfo, updateInput.fields.guestInfo);
  assert.deepEqual(preview.after.publication, current.publication);
  assert.deepEqual(preview.after.sourceLinks[0], current.sourceLinks[0]);
  assert.equal(preview.after.sourceLinks[1].isPrimary, false);
  assert.equal(preview.after.sourceLinks[1].canonicalUrl, source.canonicalUrl);
  assert.equal(preview.inputHash, appearanceOperationHash(updateInput));
});

test("active primary evidence reuse keeps its metadata and primary status", async () => {
  const primary = {
    ...source,
    canonicalUrl: "https://example.com/original",
    sourceName: "updated-source-name",
    externalItemId: "updated-id",
    evidenceKey: "default",
    publishedAt: "2026-09-30T03:00:00.000Z",
  };
  const input = {
    ...updateInput,
    evidenceSources: [primary],
  } as const;
  let output = "";
  await runAppearanceOperation(input, { apply: false }, {
    readAppearance: async () => structuredClone(current),
    validatePreview: async () => undefined,
    confirm: async () => assert.fail("dry-run must not confirm"),
    log: (value) => { output = value; },
  });
  const preview = JSON.parse(output);
  assert.equal(preview.after.sourceLinks.length, 1);
  assert.equal(preview.after.sourceLinks[0].isPrimary, true);
  assert.equal(preview.after.sourceLinks[0].sourceName, "official");
  assert.equal(preview.after.sourceLinks[0].publishedAt, current.publication.publishedAt);
});

test("unchanged guest information does not preview an evidence append", async () => {
  let output = "";
  await runAppearanceOperation(updateInput, { apply: false }, {
    readAppearance: async () => ({
      ...structuredClone(current),
      guestInfo: {
        isHikaruGuest: updateInput.fields.guestInfo.isHikaruGuest,
        guestNames: [...updateInput.fields.guestInfo.guestNames],
      },
    }),
    validatePreview: async () => undefined,
    confirm: async () => assert.fail("dry-run must not confirm"),
    log: (value) => { output = value; },
  });
  const preview = JSON.parse(output);
  assert.equal(preview.after.sourceLinks.length, current.sourceLinks.length);
});

test("create dry-run applies the server's guest and primary source defaults", async () => {
  const input = {
    kind: "appearance",
    operation: "create",
    expectedVersion: null,
    fields: baseFields,
    source,
  } as const;
  let output = "";
  await runAppearanceOperation(input, { apply: false }, {
    readAppearance: async () => null,
    validatePreview: async () => undefined,
    confirm: async () => assert.fail("dry-run must not confirm"),
    log: (value) => { output = value; },
  });
  const preview = JSON.parse(output);
  assert.deepEqual(preview.after.guestInfo, { isHikaruGuest: null, guestNames: [] });
  assert.deepEqual(preview.after.fields.guestInfo, { isHikaruGuest: null, guestNames: [] });
  assert.equal(preview.after.sourceLinks[0].isPrimary, true);
});

test("omitting guestInfo previews the stored value unchanged", async () => {
  const input = {
    kind: "appearance",
    operation: "update",
    appearanceId: "guest-test",
    expectedVersion: 4,
    fields: baseFields,
  } as const;
  let output = "";
  await runAppearanceOperation(input, { apply: false }, {
    readAppearance: async () => ({ ...structuredClone(current), guestInfo: { isHikaruGuest: true, guestNames: [] } }),
    validatePreview: async () => undefined,
    confirm: async () => assert.fail("dry-run must not confirm"),
    log: (value) => { output = value; },
  });
  assert.deepEqual(JSON.parse(output).after.guestInfo, { isHikaruGuest: true, guestNames: [] });
});

test("apply verifies the normalized content hash and uses an idempotency key", async () => {
  const hash = appearanceOperationHash(updateInput);
  let receivedKey = "";
  const dependencies = {
    readAppearance: async () => structuredClone(current),
    validatePreview: async () => undefined,
    confirm: async (_input: unknown, key: string) => {
      receivedKey = key;
      return { status: "approved" as const, proposalIds: ["proposal-1"], targets: [{ id: current.id, version: 5 }], replayed: false };
    },
    log: () => undefined,
  };
  await runAppearanceOperation(updateInput, { apply: true, reviewedHash: hash }, dependencies);
  assert.equal(receivedKey, `appearance-import-${hash.slice(0, 40)}`);
  await assert.rejects(runAppearanceOperation(updateInput, { apply: true, reviewedHash: "0".repeat(64) }, dependencies), /does not match/);
});

test("apply rejects non-approved Admin write results", async () => {
  await assert.rejects(runAppearanceOperation(updateInput, { apply: true, reviewedHash: appearanceOperationHash(updateInput) }, {
    readAppearance: async () => structuredClone(current),
    validatePreview: async () => undefined,
    confirm: async () => ({ status: "superseded", proposalIds: [], targets: [], replayed: false, message: "version changed" }),
    log: () => undefined,
  }), /superseded/);
});
