import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import { confirmAdminWrite, validateAdminWritePreview } from "../src/server/admin/write-service";
import type { getWriterDb } from "../src/db/client";

test("real isolated transactions invalidate only after commit and retry on replay", async () => {
  const pg = new PGlite();
  const local = drizzle(pg, { schema });
  const db = local as unknown as ReturnType<typeof getWriterDb>;
  let notifications = 0;
  const input = { kind: "series", operation: "create", expectedVersion: null,
    seriesId: "cache-test-series", displayName: "キャッシュ確認" };
  try {
    for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
      if (file.startsWith("0006_")) await pg.exec("update appearance_backfill_checkpoints set completed_at=now(), dual_write_confirmed_at=now() where id='phase-1b'");
      await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    }
    await pg.exec("update content_management_state set content_mode='admin', admin_activated_at='2026-09-30T00:00:00Z', legacy_import_locked_at='2026-09-30T00:00:00Z' where id='singleton'");
    const invalidate = async () => {
      notifications++;
      // Read from outside the transaction: committed content must already exist.
      assert.equal((await local.select().from(schema.appearanceSeriesTable)).length, 1);
      return { status: "invalidated" as const };
    };
    await validateAdminWritePreview(input, db);
    assert.equal(notifications, 0);
    assert.equal((await local.select().from(schema.appearanceSeriesTable)).length, 0);
    const first = await confirmAdminWrite(input, "cache-create", db, async () => {
      notifications++;
      assert.equal((await local.select().from(schema.appearanceSeriesTable)).length, 1);
      throw new Error("notification unavailable");
    });
    assert.equal(first.status, "approved");
    assert.equal(first.publicCacheInvalidation?.status, "failed");
    const replay = await confirmAdminWrite(input, "cache-create", db, invalidate);
    assert.equal(replay.status, "approved");
    assert.equal(replay.replayed, true);
    assert.equal(replay.publicCacheInvalidation?.status, "invalidated");
    assert.equal(notifications, 2);
    const invalid = { ...input, operation: "update", seriesId: "cache-test-series", expectedVersion: 99 };
    const conflict = await confirmAdminWrite(invalid, "cache-conflict", db, invalidate);
    assert.equal(conflict.status, "superseded");
    assert.equal(notifications, 2);
    await assert.rejects(confirmAdminWrite({ ...input, seriesId: "rollback-series" }, "cache-create", db, invalidate));
    assert.equal(notifications, 2);
    assert.equal((await local.select().from(schema.appearanceSeriesTable)).length, 1);
  } finally { await pg.close(); }
});
