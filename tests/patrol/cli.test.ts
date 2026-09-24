import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("CLI dry-run exits nonzero on collection failure and writes a report without secrets", () => {
  const root = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "patrol-cli-"));
  try {
    const mockPath = join(directory, "mock.cjs");
    const reportPath = join(directory, "report.json");
    writeFileSync(mockPath, `globalThis.fetch = async () => new Response("fixture", {status:404});`);
    const result = spawnSync(process.execPath, [
      "--conditions=react-server", "--require", mockPath, "--import", join(root, "node_modules/tsx/dist/loader.mjs"),
      join(root, "scripts/patrol/run-patrol.ts"), "--dry-run",
    ], {
      cwd: directory, encoding: "utf8", timeout: 20000,
      env: { ...process.env, DATABASE_URL: "", DISCORD_WEBHOOK_URL: "secret-webhook", PATROL_REPORT_PATH: reportPath, TSX_TSCONFIG_PATH: join(root, "tsconfig.json"), GITHUB_STEP_SUMMARY: "" },
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.mode, "dry-run");
    assert.equal(report.comparison, "repository");
    assert.equal(report.errors.length, 5);
    assert.equal(report.notificationCount, 0);
    assert.equal((result.stdout + result.stderr + JSON.stringify(report)).includes("secret-webhook"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
