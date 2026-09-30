import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { deadlineOperationHash, normalizeDeadlineOperation, parseDeadlineImportArgs, readDeadlineOperationFile, runDeadlineOperation } from "../scripts/deadline-operation";
import type { DeadlineAdminRecord } from "../src/server/deadlines/record-reader";

const fields = {
  id: "deadline-test", label: "先行受付", projectTitle: "企画", organizer: "主催", projectType: "official",
  seriesId: null, deadlinePrecision: "exact", deadlineAt: "2026-10-08T12:00:00+09:00", deadlineOn: null,
  applicationUrl: "https://example.com/apply", note: null, state: "scheduled", appearanceIds: [],
};
const source = { canonicalUrl: "https://example.com/news/test", sourceName: "official:test", externalItemId: "test", evidenceKey: "first", precision: "date", publishedAt: null, publishedOn: "2026-09-30" };
const create = { kind: "deadline", operation: "create", expectedVersion: null, fields, source };
const parsed = normalizeDeadlineOperation(create);
if (parsed.operation !== "create") throw new Error("Invalid fixture");
const record: DeadlineAdminRecord = { ...parsed.fields, source: parsed.source, version: 3, visibilityStatus: "public", createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z", sourceUpdatedAt: "2026-09-30T00:00:00Z", sourceUrls: [source.canonicalUrl, "https://example.com/news/other"], sourceEvidence: [{ canonicalUrl: source.canonicalUrl, evidenceKey: source.evidenceKey }, { canonicalUrl: "https://example.com/news/other", evidenceKey: "other" }] };

test("CLI retains legacy dry-run/apply and requires reviewed hash only for JSON apply", () => {
  assert.deepEqual(parseDeadlineImportArgs([]), { apply: false });
  assert.deepEqual(parseDeadlineImportArgs(["--apply"]), { apply: true });
  assert.equal(parseDeadlineImportArgs(["--input", "/tmp/file with spaces.json"]).inputPath, "/tmp/file with spaces.json");
  const hash = deadlineOperationHash(create);
  assert.deepEqual(parseDeadlineImportArgs(["--input", "operation.json", "--reviewed-hash", hash, "--apply"]), { apply: true, inputPath: "operation.json", reviewedHash: hash });
  for (const args of [
    ["--unknown"], ["--apply", "--apply"], ["--input"], ["--input", "--apply"],
    ["--input", "a", "--input", "b"], ["--apply", "--input", "a"],
    ["--reviewed-hash", hash], ["--input", "a", "--reviewed-hash", hash],
    ["--apply", "--input", "a", "--reviewed-hash", "bad"],
  ]) assert.throws(() => parseDeadlineImportArgs(args));
});

test("hash covers shared normalized input, including expectedVersion, target, source and state", () => {
  const reordered = { source: { ...source, canonicalUrl: source.canonicalUrl + "#ignored" }, fields: { ...fields, label: " 先行受付 ", deadlineAt: "2026-10-08T03:00:00.000Z" }, expectedVersion: null, operation: "create", kind: "deadline" };
  assert.equal(deadlineOperationHash(reordered), deadlineOperationHash(create));
  const update = { ...create, operation: "update", deadlineId: fields.id, expectedVersion: 3 };
  const hash = deadlineOperationHash(update);
  for (const changed of [
    { ...update, expectedVersion: 4 }, { ...update, fields: { ...fields, state: "closed" } },
    { ...update, fields: { ...fields, deadlineAt: "2026-10-09T12:00:00+09:00" } },
    { ...update, source: { ...source, evidenceKey: "second" } },
  ]) assert.notEqual(deadlineOperationHash(changed), hash);
  assert.throws(() => normalizeDeadlineOperation([]));
  assert.throws(() => normalizeDeadlineOperation({ kind: "series", operation: "create", seriesId: "series-test", expectedVersion: null, displayName: "test" }), /kind: deadline/);
});

test("JSON file errors conceal contents and temporary files are cleaned", async () => {
  const dir = await mkdtemp(join(tmpdir(), "deadline-operation-"));
  try {
    const file = join(dir, "input with spaces.json");
    await writeFile(file, JSON.stringify(create));
    assert.deepEqual(await readDeadlineOperationFile(file), create);
    await writeFile(file, '{"private-secret": invalid}');
    await assert.rejects(readDeadlineOperationFile(file), error => error instanceof Error && !error.message.includes("private-secret") && /JSON/.test(error.message));
    await assert.rejects(readDeadlineOperationFile(join(dir, "missing")), /Cannot read/);
  } finally { await rm(dir, { recursive: true }); }
});

test("dry-run displays full before/after and never confirms", async () => {
  for (const operation of ["create", "update", "hide", "restore"] as const) {
    const calls: string[] = [];
    const value = operation === "create" ? create : operation === "update"
      ? { ...create, operation, deadlineId: fields.id, expectedVersion: 3, fields: { ...fields, state: "closed", appearanceIds: ["event-a"] } }
      : { kind: "deadline", operation, deadlineId: fields.id, expectedVersion: 3 };
    let output = "";
    await runDeadlineOperation(value, { apply: false }, {
      readRecords: async () => { calls.push("read"); return operation === "create" ? [] : [record]; },
      validatePreview: async () => { calls.push("validate"); },
      confirm: async () => { throw new Error("dry-run wrote"); },
      log: value => { output = value; },
    });
    assert.deepEqual(calls, ["read", "validate"]);
    const preview = JSON.parse(output);
    assert.equal(preview.inputHash, deadlineOperationHash(value));
    assert.equal(preview.currentVersion, operation === "create" ? null : 3);
    assert.equal(preview.expectedVersion, operation === "create" ? null : 3);
    assert.equal(preview.after.source.canonicalUrl, source.canonicalUrl);
    assert.equal(preview.after.visibilityStatus, operation === "hide" ? "hidden" : "public");
    assert.equal(preview.after.fields.state, operation === "update" ? "closed" : "scheduled");
    if (operation !== "create") assert.deepEqual(preview.before.sourceEvidence, record.sourceEvidence);
    assert.equal(preview.after.sourceEvidence.length, operation === "create" || operation === "update" ? 1 : 2);
    if (operation === "update") assert.deepEqual(preview.after.fields.appearanceIds, ["event-a"]);
    if (operation !== "create") assert.equal(preview.before.fields.deadlineAt, "2026-10-08T03:00:00.000Z");
  }
});

test("hash mismatch/missing hash fails before DB access; apply uses confirm directly for replay", async () => {
  const calls: string[] = [];
  const dependencies = {
    readRecords: async () => { throw new Error("apply read"); },
    validatePreview: async () => { throw new Error("apply preflight"); },
    confirm: async (input: unknown, key: string) => {
      calls.push(key);
      assert.deepEqual(input, parsed);
      return { status: "approved" as const, targets: [{ id: fields.id, version: 1 }], proposalIds: ["proposal"], replayed: true };
    },
    log: () => {},
  };
  for (const reviewedHash of [undefined, "0".repeat(64)]) {
    await assert.rejects(runDeadlineOperation(create, { apply: true, reviewedHash }, dependencies), /hash/);
  }
  assert.equal(calls.length, 0);
  const hash = deadlineOperationHash(create);
  const result = await runDeadlineOperation(create, { apply: true, reviewedHash: hash }, dependencies);
  assert.equal(result?.replayed, true);
  assert.deepEqual(calls, [`deadline-import-${hash.slice(0, 40)}`]);
});

test("refusals and failed preview do not report success", async () => {
  let output = "";
  const dependencies = {
    readRecords: async () => [record],
    validatePreview: async () => { throw new Error("version conflict"); },
    confirm: async () => ({ status: "superseded" as const, proposalIds: ["conflict"], message: "version conflict", replayed: false }),
    log: (value: string) => { output = value; },
  };
  await assert.rejects(runDeadlineOperation(create, { apply: false }, dependencies), /version conflict/);
  assert.equal(output, "");
  await assert.rejects(runDeadlineOperation(create, { apply: true, reviewedHash: deadlineOperationHash(create) }, dependencies), /superseded/);
  assert.equal(JSON.parse(output).status, "superseded");
});

test("actual CLI refuses unreviewed JSON apply without connecting to DB", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/admin-import-deadlines.ts", "--input", "not-read.json", "--apply"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSON apply requires --reviewed-hash/);
  assert.equal(result.stdout, "");
});
