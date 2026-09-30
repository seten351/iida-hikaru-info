import assert from "node:assert/strict";
import test from "node:test";
import { databaseCacheScope, enabledPublicCacheScope, publicCacheLife, publicCacheTag } from "../src/server/public-cache/policy";
import { invalidateAfterCommit, notifyPublicCacheInvalidation } from "../src/server/public-cache/invalidation";
import { handlePublicCacheInvalidation } from "../src/server/public-cache/endpoint";

const DATABASE_URL = "postgres://user:password@ep-cache.neon.tech/neondb";
const scope = databaseCacheScope(DATABASE_URL);
const secret = "cache-invalidation-secret-for-isolated-test";
const env = { DATABASE_URL, PUBLIC_CACHE_DB_SCOPE: scope, VERCEL_ENV: "production", PUBLIC_DB_CACHE_ENABLED: "1", PUBLIC_CACHE_INVALIDATION_SECRET: secret,
  PUBLIC_CACHE_INVALIDATION_URL: "https://example.com/api/internal/public-cache/invalidate" };

test("cache scope separates databases and omits credentials; pooled connections match", () => {
  assert.equal(scope, databaseCacheScope("postgres://another:secret@ep-cache-pooler.neon.tech/neondb"));
  assert.notEqual(scope, databaseCacheScope("postgres://user:password@ep-isolated.neon.tech/neondb"));
  assert.notEqual(scope, databaseCacheScope("postgres://user:password@ep-cache.neon.tech/otherdb"));
  assert.match(publicCacheTag(scope), /^public-data:v1:[a-f0-9]{64}$/);
  assert.deepEqual(publicCacheLife, { stale: 30, revalidate: 600, expire: 900 });
});
test("only opted-in production with matching database scope uses cache", () => {
  assert.equal(enabledPublicCacheScope(env), scope);
  for (const override of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: undefined },
    { PUBLIC_DB_CACHE_ENABLED: "0" }, { PUBLIC_CACHE_DB_SCOPE: "wrong" }, { DATABASE_URL: "invalid" }]) {
    assert.equal(enabledPublicCacheScope({ ...env, ...override }), null);
  }
});
test("approved commit and replay invalidate afterward; refused and failed commits never invalidate", async () => {
  const events: string[] = [];
  const invalidate = async () => { events.push("invalidate"); return { status: "invalidated" as const }; };
  for (const replayed of [false, true]) {
    events.length = 0;
    const result = await invalidateAfterCommit(async () => { events.push("commit"); return { status: "approved", replayed }; }, invalidate);
    assert.deepEqual(events, ["commit", "invalidate"]);
    assert.equal(result.publicCacheInvalidation?.status, "invalidated");
  }
  for (const status of ["rejected", "superseded"]) {
    events.length = 0;
    await invalidateAfterCommit(async () => ({ status }), invalidate);
    assert.deepEqual(events, []);
  }
  await assert.rejects(invalidateAfterCommit(async () => { throw new Error("rollback"); }, invalidate), /rollback/);
  assert.deepEqual(events, []);
  const committed = await invalidateAfterCommit(async () => ({ status: "approved" }), async () => { throw new Error("unavailable"); });
  assert.equal(committed.status, "approved");
  assert.equal(committed.publicCacheInvalidation?.status, "failed");
});

test("CLI notification refuses Preview, mismatched DB, insecure URL and redirects", async () => {
  let calls = 0;
  const send: typeof fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    assert.deepEqual(JSON.parse(options?.body as string), { scope });
    return Response.json({ status: "invalidated" });
  };
  assert.equal((await notifyPublicCacheInvalidation(env, send)).status, "invalidated");
  assert.equal(calls, 1);
  calls = 0;
  assert.equal((await notifyPublicCacheInvalidation({ ...env, VERCEL_ENV: "preview" }, send)).status, "skipped");
  for (const override of [{ PUBLIC_CACHE_DB_SCOPE: "wrong" }, { PUBLIC_CACHE_INVALIDATION_SECRET: "short" },
    { PUBLIC_CACHE_INVALIDATION_URL: "http://example.com/api/internal/public-cache/invalidate" },
    { PUBLIC_CACHE_INVALIDATION_URL: "https://example.com/another-path" }]) {
    assert.equal((await notifyPublicCacheInvalidation({ ...env, ...override }, send)).status, "failed");
  }
  assert.equal(calls, 0);
  const fail: typeof fetch = async () => { calls++; return Response.json({}, { status: 503 }); };
  assert.equal((await notifyPublicCacheInvalidation(env, fail)).status, "failed");
  assert.equal(calls, 3);
});

test("endpoint authenticates and bounds scope/body without letting caller choose tags", async () => {
  const invalidated: string[] = [];
  const invoke = (body: unknown, token = secret, override = {}) => handlePublicCacheInvalidation(
    new Request("https://example.com/api/internal/public-cache/invalidate", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
    { ...env, ...override }, value => { invalidated.push(value); });
  const ok = await invoke({ scope });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(invalidated, [scope]);
  assert.equal((await invoke({ scope }, "wrong")).status, 401);
  assert.equal((await invoke({ scope: "other" })).status, 400);
  assert.equal((await invoke({ scope, tags: ["admin"] })).status, 400);
  assert.equal((await invoke({ scope, padding: "x".repeat(1100) })).status, 413);
  assert.equal((await invoke({ scope }, secret, { VERCEL_ENV: "preview" })).status, 503);
  assert.deepEqual(invalidated, [scope]);
});
