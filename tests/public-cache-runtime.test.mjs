import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fakeDatabaseUrl = "postgresql://user:password@ep-cache-test.neon.tech/cachetest?sslmode=require";
const fakeScope = createHash("sha256").update("ep-cache-test.neon.tech:5432/cachetest").digest("hex");
const secret = "public-cache-runtime-test-secret-32-bytes-minimum";
const fixtureTimes = {
  publishedAt: "2026-09-28T12:00:00.000Z",
  collectedAt: "2026-09-28T12:01:00.000Z",
  updatedAt: "2026-09-28T12:01:00.000Z",
};

let tempRoot;
let mockServer;
let mockPort;
let mockCalls = [];
let appearanceTitle = "キャッシュ検証用の出演情報 A";
let clockFile;
let productionServer;
let previewServer;
let disabledServer;
let productionPort;
let previewPort;
let disabledPort;

function result(fields, rows = []) {
  return {
    fields: fields.map(([name, dataTypeID = 25]) => ({ name, dataTypeID })),
    rows,
    rowCount: rows.length,
    command: "SELECT",
  };
}

function appearanceResult() {
  const columns = [
    ["id"], ["startsAt", 1184], ["startsOn"], ["startsAtPrecision"], ["title"],
    ["guestInfo", 3802], ["seriesId"], ["seriesName"], ["eventGroupId"], ["eventTitle"],
    ["sessionLabel"], ["category"], ["sourceUrl"], ["publishedAt", 1184], ["publishedOn"],
    ["publishedAtPrecision"], ["collectedAt", 1184], ["updatedAt", 1184],
  ];
  const row = [
    "runtime-cache-fixture", new Date(Date.now() + 60_000).toISOString(), null, "exact", appearanceTitle,
    JSON.stringify({ isHikaruGuest: null, guestNames: [] }), "gakuen-idolmaster", "学園アイドルマスター",
    null, null, null, "ゲーム", "https://example.invalid/fixture",
    fixtureTimes.publishedAt, null, "exact", fixtureTimes.collectedAt, fixtureTimes.updatedAt,
  ];
  return result(columns, [row]);
}

const emptyDeadlineResult = result([
  ["deadline"], ["source"],
]);

function queryResult(query) {
  const sql = query.query ?? query;
  if (/from\s+"appearances"/i.test(sql) && /inner join\s+"appearance_source_links"/i.test(sql)) {
    return appearanceResult();
  }
  if (/from\s+"appearance_source_links"/i.test(sql)) {
    return result([["appearanceId"], ["sourceUrl"]], [["runtime-cache-fixture", "https://example.invalid/fixture"]]);
  }
  if (/from\s+"deadlines"/i.test(sql)) return emptyDeadlineResult;
  if (/from\s+"deadline_appearance_links"/i.test(sql)) return result([["deadlineId"], ["appearanceId"]]);
  if (/from\s+"deadline_source_links"/i.test(sql)) return result([["deadlineId"], ["url"], ["evidenceKey"]]);
  if (/from\s+"appearance_series"/i.test(sql)) return result([["id"], ["displayName"]]);
  throw new Error(`Unrecognized test SQL: ${String(sql).slice(0, 180)}`);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

async function reservePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startNext(port, vercelEnv, cacheEnabled = "1") {
  const projectDir = path.join(tempRoot, `next-${vercelEnv}-${cacheEnabled}`);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(projectDir));
  await Promise.all([
    symlink(path.join(repoRoot, ".next"), path.join(projectDir, ".next"), "dir"),
    symlink(path.join(repoRoot, "node_modules"), path.join(projectDir, "node_modules"), "dir"),
    symlink(path.join(repoRoot, "next.config.ts"), path.join(projectDir, "next.config.ts")),
    symlink(path.join(repoRoot, "package.json"), path.join(projectDir, "package.json")),
  ]);

  const preloadPath = path.join(tempRoot, "test-runtime-preload.mjs");
const preload = `
import fs from "node:fs";
console.error("[test-preload] active");
const RealDate = Date;
const clockPath = process.env.TEST_CLOCK_FILE;
const offset = () => {
  try { return Number(fs.readFileSync(clockPath, "utf8")) || 0; }
  catch { return 0; }
};
const realTimeOrigin = performance.timeOrigin;
Object.defineProperty(performance, "timeOrigin", {
  configurable: true,
  get: () => realTimeOrigin + offset(),
});
class TestClockDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [RealDate.now() + offset()])); }
  static now() { return RealDate.now() + offset(); }
}
globalThis.Date = TestClockDate;
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (target.hostname === "api.neon.tech") {
    console.error("[test-preload] routing Neon SQL to localhost");
    target.protocol = "http:";
    target.hostname = "127.0.0.1";
    target.port = process.env.MOCK_NEON_PORT;
  }
  return originalFetch(target, init);
};
`;
  await writeFile(preloadPath, preload);
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    NODE_OPTIONS: `--import=${preloadPath}`,
    TEST_CLOCK_FILE: clockFile,
    MOCK_NEON_PORT: String(mockPort),
    DATABASE_URL: fakeDatabaseUrl,
    VERCEL_ENV: vercelEnv,
    PUBLIC_DB_CACHE_ENABLED: cacheEnabled,
    PUBLIC_CACHE_DB_SCOPE: fakeScope,
    PUBLIC_CACHE_INVALIDATION_SECRET: secret,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
  };
  const child = spawn(process.execPath, [path.join(repoRoot, "node_modules/next/dist/bin/next"), "start", projectDir, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectDir,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { output += chunk; });
  child.testOutput = () => output;
  child.testPort = port;
  try {
    await waitForHttp(`http://127.0.0.1:${port}/api/internal/public-cache/invalidate`, child);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`next start failed: ${error.message}\n${output}`);
  }
  return child;
}

async function waitForHttp(url, child) {
  const until = Date.now() + 45_000;
  let lastError;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Next exited (${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("Next did not start in time");
}

async function requestPage(port, pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  assert.equal(response.status, 200, `${pathname} should return 200`);
  const body = await response.text();
  if (/\$RX\("B:\d+"/.test(body)) {
    const child = port === productionPort ? productionServer : port === previewPort ? previewServer : disabledServer;
    throw new Error(`${pathname} streamed a server error. Next output:\n${child?.testOutput?.() ?? ""}`);
  }
  return body;
}

function requestTimeFrom(html, around) {
  const candidates = [...html.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g)]
    .map(match => Date.parse(match[0]))
    .filter(time => Math.abs(time - around) < 15_000)
    .sort((a, b) => Math.abs(a - around) - Math.abs(b - around));
  assert.ok(candidates.length, "the rendered response should serialize its request-time clock");
  return candidates[0];
}

function sectionBody(html, id) {
  const match = html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/section>`));
  assert.ok(match, `rendered HTML should include the ${id} section`);
  return match[1];
}

async function invalidate(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/internal/public-cache/invalidate`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ scope: fakeScope }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "invalidated" });
}

before(async () => {
  const buildIdPath = path.join(repoRoot, ".next/BUILD_ID");
  try { await import("node:fs/promises").then(({ access }) => access(buildIdPath)); }
  catch { throw new Error("Run `npm run build` first; this test starts that production build without reading repository .env files."); }

  tempRoot = await mkdtemp(path.join(os.tmpdir(), "public-cache-runtime-"));
  clockFile = path.join(tempRoot, "clock-offset-ms");
  await writeFile(clockFile, "0");
  mockServer = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/sql") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    const queries = Array.isArray(parsed) ? parsed : [parsed];
    mockCalls.push(...queries.map(query => query.query ?? String(query)));
    const results = queries.map(queryResult);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(Array.isArray(parsed) ? { results } : results[0]));
  });
  mockPort = await listen(mockServer);
  productionPort = await reservePort();
  previewPort = await reservePort();
  disabledPort = await reservePort();
  productionServer = await startNext(productionPort, "production");
  previewServer = await startNext(previewPort, "preview");
  disabledServer = await startNext(disabledPort, "production", "0");
});

after(async () => {
  for (const child of [productionServer, previewServer, disabledServer]) {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
  if (mockServer?.listening) await new Promise((resolve, reject) => mockServer.close(error => error ? reject(error) : resolve()));
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

test("production public pages share the six-query cache; invalidation and TTL refresh data while page time stays fresh", async () => {
  mockCalls = [];
  const homeA = await requestPage(productionPort, "/?view=upcoming");
  assert.match(homeA, /キャッシュ検証用の出演情報 A/);
  assert.match(sectionBody(homeA, "upcoming"), /キャッシュ検証用の出演情報 A/, "fixture starts 60 seconds ahead and should render as upcoming");
  assert.equal(mockCalls.length, 6, "the first public page request should execute six SELECTs");

  const newsRequestAt = Date.now();
  const newsA = await requestPage(productionPort, "/news");
  const pageNowA = requestTimeFrom(newsA, newsRequestAt);
  const deadlinesA = await requestPage(productionPort, "/deadlines");
  assert.match(newsA, /キャッシュ検証用の出演情報 A/);
  assert.match(deadlinesA, /APPLICATION DEADLINES/);
  assert.equal(mockCalls.length, 6, "news and deadlines should hit the same cached data entry");

  await new Promise(resolve => setTimeout(resolve, 20));
  const secondNewsRequestAt = Date.now();
  const newsAgain = await requestPage(productionPort, "/news");
  assert.equal(mockCalls.length, 6, "a later request within TTL should still hit the cache");
  const pageNowB = requestTimeFrom(newsAgain, secondNewsRequestAt);
  assert.ok(pageNowB > pageNowA, "the page clock should advance while the public database result remains cached");

  await writeFile(clockFile, String(90_000));
  const homeAfterStart = await requestPage(productionPort, "/?view=upcoming");
  assert.doesNotMatch(sectionBody(homeAfterStart, "upcoming"), /キャッシュ検証用の出演情報 A/);
  assert.match(sectionBody(homeAfterStart, "history"), /キャッシュ検証用の出演情報 A/, "the same cached appearance should move into history after its start time");
  assert.equal(mockCalls.length, 6, "time-dependent grouping should update without reloading cached database data");

  // Start an independent cache-lifetime segment at its own clock origin.
  await writeFile(clockFile, "0");
  appearanceTitle = "キャッシュ検証用の出演情報 B";
  await invalidate(productionPort);
  const homeB = await requestPage(productionPort, "/");
  assert.match(homeB, /キャッシュ検証用の出演情報 B/);
  assert.doesNotMatch(homeB, /キャッシュ検証用の出演情報 A/);
  assert.equal(mockCalls.length, 12, "tag invalidation should reload all six SELECTs");

  appearanceTitle = "キャッシュ検証用の出演情報 C";
  // The installed Next 16.3.4 default remote handler drops production entries
  // after `revalidate` (600s). The process-local clock shift makes that boundary
  // deterministic without changing app configuration or sleeping ten minutes.
  await writeFile(clockFile, String(601_000));
  const expired = await requestPage(productionPort, "/news");
  assert.match(expired, /キャッシュ検証用の出演情報 C/);
  assert.equal(mockCalls.length, 18, "advancing the server clock beyond revalidate should reload all six SELECTs");

  await writeFile(clockFile, String(1_502_000));
  const expiredAfterIdle = await requestPage(productionPort, "/news");
  assert.match(expiredAfterIdle, /キャッシュ検証用の出演情報 C/);
  assert.equal(mockCalls.length, 24, "advancing 901 seconds after refresh should cause another process-local cache miss");
});

test("Preview bypasses the shared cache", async () => {
  const beforeCalls = mockCalls.length;
  const first = await requestPage(previewPort, "/news");
  assert.match(first, /キャッシュ検証用の出演情報 C/);
  assert.equal(mockCalls.length, beforeCalls + 6);
  await requestPage(previewPort, "/deadlines");
  assert.equal(mockCalls.length, beforeCalls + 12, "Preview requests should query the DB on each request");
  const callsBeforeInvalidate = mockCalls.length;
  const response = await fetch(`http://127.0.0.1:${previewPort}/api/internal/public-cache/invalidate`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ scope: fakeScope }),
  });
  assert.equal(response.status, 503, "Preview invalidation should be disabled");
  assert.equal(mockCalls.length, callsBeforeInvalidate, "invalidation should not query the database");
});

test("production cache kill switch bypasses the cache", async () => {
  const beforeCalls = mockCalls.length;
  await requestPage(disabledPort, "/news");
  assert.equal(mockCalls.length, beforeCalls + 6);
  await requestPage(disabledPort, "/deadlines");
  assert.equal(mockCalls.length, beforeCalls + 12, "the production kill switch should leave both reads uncached");
});

test("admin remains outside public caching and keeps no-store headers", async () => {
  const beforeCalls = mockCalls.length;
  const response = await fetch(`http://127.0.0.1:${productionPort}/admin/login`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  assert.equal(mockCalls.length, beforeCalls, "the unavailable admin route should not query public data");
});
