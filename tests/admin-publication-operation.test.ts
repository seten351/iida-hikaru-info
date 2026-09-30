import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePublicationOperation,
  parsePublicationImportArgs,
  publicationOperationHash,
  runPublicationOperation,
  type PublicationAppearanceSnapshot,
} from "../scripts/admin-publication-operation";
import { AdminWriteValidationError } from "../src/server/admin/write-input";

const exactInput = {
  kind: "source",
  operation: "replace",
  targets: [{ appearanceId: "publication-test", expectedVersion: 3 }],
  source: {
    canonicalUrl: "https://x.com/example/status/1234567890",
    sourceName: "x:example",
    externalItemId: "1234567890",
    evidenceKey: "announcement",
    precision: "exact",
    publishedAt: "2026-09-29T12:34:56.789Z",
    publishedOn: null,
  },
} as const;

const current: PublicationAppearanceSnapshot = {
  id: "publication-test",
  title: "公開日時テスト",
  category: "音声作品",
  version: 3,
  visibilityStatus: "public",
  publication: { precision: "unknown", publishedAt: null, publishedOn: null },
  sourceLinks: [
    {
      sourceId: "src_old",
      evidenceKey: "default",
      active: true,
      isPrimary: true,
      canonicalUrl: "https://example.com/old",
      sourceName: "example",
      externalItemId: "old",
      precision: "unknown",
      publishedAt: null,
      publishedOn: null,
    },
  ],
};

test("publication adapter accepts only one source target", () => {
  const parsed = normalizePublicationOperation(exactInput);
  assert.equal(parsed.kind, "source");
  assert.equal(parsed.targets.length, 1);
  assert.equal("precision" in parsed.source && parsed.source.precision, "exact");

  assert.throws(
    () => normalizePublicationOperation({ ...exactInput, kind: "appearance" }),
    AdminWriteValidationError,
  );
  assert.throws(
    () => normalizePublicationOperation({
      ...exactInput,
      targets: [...exactInput.targets, { appearanceId: "second", expectedVersion: 1 }],
    }),
    /exactly one/,
  );
  assert.throws(
    () => normalizePublicationOperation({
      ...exactInput,
      source: {
        ...exactInput.source,
        precision: "unknown",
        publishedAt: null,
        publishedOn: null,
      },
    }),
    /exact or date/,
  );
  assert.throws(
    () => normalizePublicationOperation({
      ...exactInput,
      source: {
        ...exactInput.source,
        canonicalUrl: "https://user:secret@example.com/announcement",
      },
    }),
    /credentials/,
  );
});

test("publication adapter allows unknown only for a secondary append", () => {
  const unknownSource = {
    ...exactInput.source,
    precision: "unknown",
    publishedAt: null,
    publishedOn: null,
  } as const;
  const append = normalizePublicationOperation({
    ...exactInput,
    operation: "append",
    source: unknownSource,
  });
  assert.equal(append.operation, "append");
  assert.equal("precision" in append.source && append.source.precision, "unknown");
  assert.throws(
    () => normalizePublicationOperation({ ...exactInput, source: unknownSource }),
    /replacement publication source/,
  );
});

test("publication CLI arguments require reviewed dry-run hash for apply", () => {
  assert.deepEqual(parsePublicationImportArgs(["--input", "/tmp/input.json"]), {
    apply: false,
    inputPath: "/tmp/input.json",
  });
  assert.throws(() => parsePublicationImportArgs([]), /--input/);
  assert.throws(
    () => parsePublicationImportArgs(["--input", "/tmp/input.json", "--apply"]),
    /--reviewed-hash/,
  );
});

test("dry-run validates without confirming and prints before/after with stable hash", async () => {
  let validated = 0;
  let confirmed = 0;
  let output = "";
  await runPublicationOperation(exactInput, { apply: false }, {
    readAppearance: async () => structuredClone(current),
    hasReplay: async () => false,
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
  assert.equal(preview.before.publication.precision, "unknown");
  assert.equal(preview.after.publication.precision, "exact");
  assert.equal(preview.after.version, 4);
  assert.equal(preview.inputHash, publicationOperationHash(exactInput));
});

test("apply uses a content-derived idempotency key and rejects changed reviewed input", async () => {
  const hash = publicationOperationHash(exactInput);
  let receivedKey = "";
  const dependencies = {
    readAppearance: async () => structuredClone(current),
    hasReplay: async () => false,
    validatePreview: async () => undefined,
    confirm: async (_input: unknown, key: string) => {
      receivedKey = key;
      return {
        status: "approved" as const,
        proposalIds: ["proposal"],
        targets: [{ id: current.id, version: 4 }],
        replayed: false,
      };
    },
    log: () => undefined,
  };
  await runPublicationOperation(exactInput, { apply: true, reviewedHash: hash }, dependencies);
  assert.equal(receivedKey, `publication-source-${hash.slice(0, 40)}`);
  await assert.rejects(
    runPublicationOperation(exactInput, { apply: true, reviewedHash: "0".repeat(64) }, dependencies),
    /does not match/,
  );
});

test("primary rejects an active source whose publication precision is unknown", async () => {
  const input = {
    kind: "source",
    operation: "primary",
    targets: [{ appearanceId: current.id, expectedVersion: current.version }],
    source: { sourceId: "src_old", evidenceKey: "default" },
  } as const;
  await assert.rejects(
    runPublicationOperation(input, { apply: false }, {
      readAppearance: async () => structuredClone(current),
      hasReplay: async () => false,
      validatePreview: async () => undefined,
      confirm: async () => {
        assert.fail("confirm must not run");
      },
      log: () => undefined,
    }),
    /unknown publication source/,
  );
});

test("primary apply replay does not depend on the source link remaining active", async () => {
  const input = {
    kind: "source",
    operation: "primary",
    targets: [{ appearanceId: current.id, expectedVersion: current.version }],
    source: { sourceId: "src_old", evidenceKey: "default" },
  } as const;
  const hash = publicationOperationHash(input);
  let read = 0;
  const result = await runPublicationOperation(
    input,
    { apply: true, reviewedHash: hash },
    {
      readAppearance: async () => {
        read += 1;
        return null;
      },
      hasReplay: async () => true,
      validatePreview: async () => undefined,
      confirm: async () => ({
        status: "approved",
        proposalIds: ["proposal"],
        targets: [{ id: current.id, version: 9 }],
        replayed: true,
      }),
      log: () => undefined,
    },
  );
  assert.equal(read, 0);
  assert.equal(result?.replayed, true);
});

test("unknown append requires a known active primary and leaves public publication unchanged", async () => {
  const input = {
    ...exactInput,
    operation: "append",
    source: {
      ...exactInput.source,
      canonicalUrl: "https://store.example.com/item/voice-work",
      sourceName: "official-store",
      externalItemId: "voice-work",
      evidenceKey: "store",
      precision: "unknown",
      publishedAt: null,
      publishedOn: null,
    },
  } as const;
  const knownPrimary: PublicationAppearanceSnapshot = {
    ...structuredClone(current),
    publication: {
      precision: "exact",
      publishedAt: "2026-09-29T12:34:56.789Z",
      publishedOn: null,
    },
    sourceLinks: [{
      ...current.sourceLinks[0],
      precision: "exact",
      publishedAt: "2026-09-29T12:34:56.789Z",
    }],
  };
  let output = "";
  await runPublicationOperation(input, { apply: false }, {
    readAppearance: async () => structuredClone(knownPrimary),
    hasReplay: async () => false,
    validatePreview: async () => undefined,
    confirm: async () => assert.fail("dry-run must not confirm"),
    log: (value) => { output = value; },
  });
  const preview = JSON.parse(output);
  assert.deepEqual(preview.after.publication, preview.before.publication);
  assert.equal(preview.after.sourceLinks.at(-1).precision, "unknown");
  assert.equal(preview.after.sourceLinks.at(-1).isPrimary, false);

  await assert.rejects(
    runPublicationOperation(input, { apply: false }, {
      readAppearance: async () => structuredClone(current),
      hasReplay: async () => false,
      validatePreview: async () => undefined,
      confirm: async () => assert.fail("invalid dry-run must not confirm"),
      log: () => undefined,
    }),
    /active primary publication is exact or date/,
  );
});

test("unknown append replay skips a later primary-state check", async () => {
  const input = {
    ...exactInput,
    operation: "append",
    source: {
      ...exactInput.source,
      precision: "unknown",
      publishedAt: null,
      publishedOn: null,
    },
  } as const;
  const hash = publicationOperationHash(input);
  let read = 0;
  const result = await runPublicationOperation(
    input,
    { apply: true, reviewedHash: hash },
    {
      readAppearance: async () => {
        read += 1;
        return structuredClone(current);
      },
      hasReplay: async () => true,
      validatePreview: async () => undefined,
      confirm: async () => ({
        status: "approved",
        proposalIds: ["proposal"],
        targets: [{ id: current.id, version: 4 }],
        replayed: true,
      }),
      log: () => undefined,
    },
  );
  assert.equal(read, 0);
  assert.equal(result?.replayed, true);
});

test("first unknown append apply rechecks the current active primary", async () => {
  const input = {
    ...exactInput,
    operation: "append",
    source: {
      ...exactInput.source,
      precision: "unknown",
      publishedAt: null,
      publishedOn: null,
    },
  } as const;
  const hash = publicationOperationHash(input);
  let confirmed = 0;
  await assert.rejects(
    runPublicationOperation(
      input,
      { apply: true, reviewedHash: hash },
      {
        readAppearance: async () => structuredClone(current),
        hasReplay: async () => false,
        validatePreview: async () => undefined,
        confirm: async () => {
          confirmed += 1;
          return {
            status: "approved",
            proposalIds: ["proposal"],
            targets: [{ id: current.id, version: 4 }],
            replayed: false,
          };
        },
        log: () => undefined,
      },
    ),
    /active primary publication is exact or date/,
  );
  assert.equal(confirmed, 0);
});

test("append rejects reuse of an active primary before preview or first apply", async () => {
  const input = {
    ...exactInput,
    operation: "append",
    source: { ...exactInput.source, canonicalUrl: current.sourceLinks[0].canonicalUrl, evidenceKey: "default" },
  };
  const dependencies = {
    readAppearance: async () => structuredClone(current),
    hasReplay: async () => false,
    validatePreview: async () => assert.fail("invalid preview must not run"),
    confirm: async () => assert.fail("invalid append must not confirm"),
    log: () => undefined,
  };
  await assert.rejects(runPublicationOperation(input, { apply: false }, dependencies), /active primary source/);
  await assert.rejects(runPublicationOperation(input, { apply: true, reviewedHash: publicationOperationHash(input) }, dependencies), /active primary source/);
});

test("known append replay remains valid after a later primary change", async () => {
  const input = { ...exactInput, operation: "append" };
  let reads = 0;
  const result = await runPublicationOperation(input, { apply: true, reviewedHash: publicationOperationHash(input) }, {
    readAppearance: async () => { reads++; return null; },
    hasReplay: async () => true,
    validatePreview: async () => undefined,
    confirm: async () => ({ status: "approved", proposalIds: [], targets: [], replayed: true }),
    log: () => undefined,
  });
  assert.equal(reads, 0);
  assert.equal(result?.replayed, true);
});
