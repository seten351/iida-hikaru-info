import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { getWriterDb } from "../src/db/client";
import { confirmAdminWrite } from "../src/server/admin/write-service";
import { applyVisibilityPrecisionRepair, originalVisibilityChangedAt, previewVisibilityPrecisionRepair, repairTargetId } from "../scripts/repair-saesuzu-visibility-precision";

async function fixture() {
  const pg = new PGlite();
  const db = drizzle(pg, { schema }) as unknown as ReturnType<typeof getWriterDb>;
  for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
    if (file.startsWith("0006_")) await pg.exec("update appearance_backfill_checkpoints set completed_at=now(),dual_write_confirmed_at=now() where id='phase-1b'");
    await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
  }
  await pg.exec("update content_management_state set content_mode='admin',admin_activated_at=now(),legacy_import_locked_at=now() where id='singleton'");
  const fields = { id: repairTargetId, title: "さえすずイベント", category: "イベント", startsAtPrecision: "exact", startsAt: "2026-11-21T05:00:00.000Z", startsOn: null, seriesId: null, eventGroupId: null, eventTitle: null, sessionLabel: null };
  const source = { canonicalUrl: "https://x.com/onsenradio/status/2074840747455766865", sourceName: "x:onsenradio", externalItemId: "2074840747455766865", evidenceKey: "default", precision: "exact", publishedAt: "2026-07-08T12:59:17.527Z", publishedOn: null };
  await confirmAdminWrite({ kind: "appearance", operation: "create", expectedVersion: null, fields, source }, "repair-create", db);
  await pg.query("update appearances set first_visible_at=$1,created_at=$1,visibility_changed_at=$1 where id=$2", [originalVisibilityChangedAt, repairTargetId]);
  await confirmAdminWrite({ kind: "appearance", operation: "update", appearanceId: repairTargetId, expectedVersion: 1, fields }, "repair-second", db);
  await confirmAdminWrite({ kind: "appearance", operation: "update", appearanceId: repairTargetId, expectedVersion: 2, fields: { ...fields, guestInfo: { isHikaruGuest: true, guestNames: ["中村カンナ"] } }, evidenceSources: [source] }, `appearance-import-${"33aac5e0f84841652da0679c1478f4817630ea5a88d0494407eca1e6300dc96f".slice(0, 40)}`, db);
  // Reproduce the already observed production damage, only in isolated Postgres.
  await pg.query("update appearances set visibility_changed_at='2026-09-02T00:28:46.138Z' where id=$1", [repairTargetId]);
  const snapshot = async () => {
    const data: Record<string, unknown[]> = {};
    for (const table of ["appearances", "source_items", "source_identities", "appearance_source_links", "appearance_proposals", "appearance_revisions", "proposal_source_links"]) {
      data[table] = (await pg.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows.map(row => (row as { row: unknown }).row);
    }
    return data;
  };
  return { pg, db, snapshot };
}

test("one-record precision recovery preserves sources and old history and replays safely", async () => {
  const { pg, db, snapshot } = await fixture();
  try {
    const before = await snapshot();
    const preview = await previewVisibilityPrecisionRepair(db);
    assert.deepEqual(await snapshot(), before, "Preview must be read-only");
    await assert.rejects(applyVisibilityPrecisionRepair(db, "0".repeat(64)), /Preview/);
    assert.deepEqual(await snapshot(), before);
    const result = await applyVisibilityPrecisionRepair(db, preview.inputHash);
    assert.equal(result.status, "approved");
    assert.equal(result.replayed, false);
    const after = await snapshot();
    const row = after.appearances[0] as Record<string, unknown>;
    assert.deepEqual(row, { ...before.appearances[0] as object, visibility_changed_at: (before.appearances[0] as Record<string, unknown>).first_visible_at, version: 4, updated_at: row.updated_at });
    for (const table of ["source_items", "source_identities", "appearance_source_links", "proposal_source_links"]) assert.deepEqual(after[table], before[table]);
    for (const table of ["appearance_proposals", "appearance_revisions"]) {
      assert.equal(after[table].length, before[table].length + 1);
      for (const old of before[table]) assert(after[table].some(item => JSON.stringify(item) === JSON.stringify(old)));
    }
    const revision = (await pg.query<{ timestamp: string }>("select snapshot->'visibility'->>'visibilityChangedAt' as timestamp from appearance_revisions where appearance_id=$1 and version=4", [repairTargetId])).rows[0];
    assert.equal(revision.timestamp, originalVisibilityChangedAt);
    assert.equal((await applyVisibilityPrecisionRepair(db, preview.inputHash)).replayed, true);
    assert.deepEqual(await snapshot(), after);
  } finally { await pg.close(); }
});

test("precision recovery rejects changed rows or missing proof and rolls back late failure", async () => {
  const { pg, db, snapshot } = await fixture();
  try {
    const preview = await previewVisibilityPrecisionRepair(db);
    await pg.exec("create function reject_repair_note() returns trigger language plpgsql as $$ begin raise exception 'repair audit failure'; end; $$; create trigger reject_repair before update of review_note on appearance_proposals for each row execute function reject_repair_note();");
    const beforeFailure = await snapshot();
    await assert.rejects(applyVisibilityPrecisionRepair(db, preview.inputHash));
    assert.deepEqual(await snapshot(), beforeFailure, "Late failure must roll back the timestamp and its new audit history");
    await pg.exec("drop trigger reject_repair on appearance_proposals; drop function reject_repair_note();");
    await pg.query("update appearances set title='別の更新' where id=$1", [repairTargetId]);
    const changed = await snapshot();
    await assert.rejects(applyVisibilityPrecisionRepair(db, preview.inputHash), /Preview/);
    assert.deepEqual(await snapshot(), changed);
    await pg.query("update appearances set version=4 where id=$1", [repairTargetId]);
    await assert.rejects(applyVisibilityPrecisionRepair(db, preview.inputHash), /version/);
    await pg.query("update appearances set version=3,created_at='2026-09-02T00:28:46.999999Z' where id=$1", [repairTargetId]);
    await assert.rejects(previewVisibilityPrecisionRepair(db), /復旧根拠/);
  } finally { await pg.close(); }
});
