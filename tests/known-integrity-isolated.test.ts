import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { getWriterDb } from "../src/db/client";
import { confirmAdminWrite } from "../src/server/admin/write-service";
import { applyIsolatedObservation, observationTarget, previewIsolatedObservation, readIsolatedSnapshot } from "../scripts/verify-known-integrity-isolated";

async function fixture() {
  const pg = new PGlite();
  const db = drizzle(pg, { schema }) as unknown as ReturnType<typeof getWriterDb>;
  for (const file of (await readdir("drizzle")).filter(f => f.endsWith(".sql")).sort()) {
    if (file.startsWith("0006_")) await pg.exec("update appearance_backfill_checkpoints set completed_at=now(),dual_write_confirmed_at=now() where id='phase-1b'");
    await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
  }
  await pg.exec("update content_management_state set content_mode='admin',admin_activated_at=now(),legacy_import_locked_at=now() where id='singleton'");
  const fields = { id: observationTarget, title: "ゲーム『バンドリ！ アワーノーツ』（沢海奏多 役）", category: "ゲーム", startsAtPrecision: "date", startsAt: null, startsOn: "2026-09-24", seriesId: null, eventGroupId: null, eventTitle: null, sessionLabel: null } as const;
  await confirmAdminWrite({ kind: "appearance", operation: "create", expectedVersion: null, fields,
    source: { canonicalUrl: "https://bang-dream.com/", sourceName: "official:bang-dream", externalItemId: "bang-dream:our-notes", evidenceKey: "default", precision: "date", publishedAt: null, publishedOn: "2026-09-24" } }, "isolated-create", db);
  await confirmAdminWrite({ kind: "source", operation: "replace", targets: [{ appearanceId: observationTarget, expectedVersion: 1 }],
    source: { canonicalUrl: "https://x.com/Iida_Hikaru_828/status/2103119925682557035", sourceName: "x:iida-hikaru", externalItemId: "2103119925682557035", evidenceKey: "default", precision: "exact", publishedAt: "2026-09-24T13:50:39.018Z", publishedOn: null } }, "isolated-source", db);
  // Reproduce the observed gap in this fixture only. The repair must preserve
  // these exact microseconds and keep both old approved proposals/revisions.
  await pg.query("update appearances set title=$1,version=3,created_at='2026-09-25T06:03:50.547799Z',first_visible_at='2026-09-25T06:03:51.225123Z',visibility_changed_at='2026-09-25T06:03:51.225123Z',updated_at='2026-09-26T04:34:39.520456Z' where id=$2", ["『バンドリ！ アワーノーツ』（沢海奏多 役）", observationTarget]);
  await pg.query("update appearance_source_links set created_at='2026-09-25T06:03:50.547799Z',updated_at='2026-09-26T04:34:39.520456Z',collected_at='2026-09-25T06:03:51.225123Z' where appearance_id=$1", [observationTarget]);
  return pg;
}

test("late observation preserves raw microseconds and old approvals, and replays without additions", async () => {
  const pg = await fixture();
  try {
    const before = await readIsolatedSnapshot(pg);
    const preview = await previewIsolatedObservation(pg);
    await assert.rejects(applyIsolatedObservation({} as PGlite, preview.inputHash), /隔離PGlite/);
    assert.deepEqual(await readIsolatedSnapshot(pg), before);
    assert.deepEqual(await applyIsolatedObservation(pg, preview.inputHash), { replayed: false, version: 3 });
    const after = await readIsolatedSnapshot(pg);
    for (const [table, rows] of Object.entries(before)) {
      if (table !== "appearance_revisions") assert.deepEqual(after[table as keyof typeof after], rows);
      else for (const row of rows) assert(after.appearance_revisions.some(r => JSON.stringify(r) === JSON.stringify(row)));
    }
    assert.equal(after.appearance_revisions.length, before.appearance_revisions.length + 1);
    const revision = after.appearance_revisions.find(r => r.version === 3)!;
    assert.equal(revision.actor_type, "integrity-repair-observation");
    assert.equal(revision.proposal_id, null);
    const snapshot = revision.snapshot as { appearance: { createdAt: string; updatedAt: string }; visibility: { version: number; firstVisibleAt: string; visibilityChangedAt: string }; repairMetadata: { historicalOperationAt: unknown; historicalProposalId: unknown } };
    assert.equal(snapshot.appearance.createdAt, before.appearances[0].created_at);
    assert.equal(snapshot.appearance.updatedAt, before.appearances[0].updated_at);
    assert.equal(snapshot.visibility.firstVisibleAt, before.appearances[0].first_visible_at);
    assert.equal(snapshot.visibility.visibilityChangedAt, before.appearances[0].visibility_changed_at);
    assert.equal(snapshot.visibility.version, 3);
    assert.equal(snapshot.repairMetadata.historicalOperationAt, null);
    assert.equal(snapshot.repairMetadata.historicalProposalId, null);
    assert.deepEqual(await applyIsolatedObservation(pg, preview.inputHash), { replayed: true, version: 3 });
    assert.deepEqual(await readIsolatedSnapshot(pg), after);
  } finally { await pg.close(); }
});

test("review hash rejects changed raw values, source links, history, version and historical targets", async () => {
  const pg = await fixture();
  try {
    const preview = await previewIsolatedObservation(pg);
    await assert.rejects(applyIsolatedObservation(pg, "0".repeat(64)), /Preview/);
    await assert.rejects(previewIsolatedObservation(pg, "seifuku-kanojo-3"), /過去/);
    await assert.rejects(previewIsolatedObservation(pg, "sugar-lies-game"), /過去/);
    for (const [change, restore] of [
      ["update appearances set visibility_changed_at=visibility_changed_at+interval '1 microsecond'", "update appearances set visibility_changed_at=visibility_changed_at-interval '1 microsecond'"],
      ["update appearance_source_links set collected_at=collected_at+interval '1 microsecond'", "update appearance_source_links set collected_at=collected_at-interval '1 microsecond'"],
      ["update appearance_proposals set review_note='changed'", "update appearance_proposals set review_note=null"],
      ["update appearance_revisions set actor_type='changed'", "update appearance_revisions set actor_type='admin'"],
    ]) {
      await pg.exec(change);
      const beforeRejection = await readIsolatedSnapshot(pg);
      await assert.rejects(applyIsolatedObservation(pg, preview.inputHash), /Preview/);
      assert.deepEqual(await readIsolatedSnapshot(pg), beforeRejection);
      await pg.exec(restore);
    }
    await pg.exec("update appearances set version=4");
    await assert.rejects(applyIsolatedObservation(pg, preview.inputHash), /version 3/);
  } finally { await pg.close(); }
});

test("late audit failure rolls back the new revision without changing any existing row", async () => {
  const pg = await fixture();
  try {
    const preview = await previewIsolatedObservation(pg);
    const before = await readIsolatedSnapshot(pg);
    await pg.exec("create function fail_observation() returns trigger language plpgsql as $$ begin raise exception 'late audit failure'; end; $$; create trigger fail_observation after insert on appearance_revisions for each row execute function fail_observation();");
    await assert.rejects(applyIsolatedObservation(pg, preview.inputHash));
    assert.deepEqual(await readIsolatedSnapshot(pg), before);
    await pg.exec("drop trigger fail_observation on appearance_revisions; drop function fail_observation();");
    await applyIsolatedObservation(pg, preview.inputHash);
    await pg.exec("update appearances set collected_at=collected_at+interval '1 microsecond'");
    await assert.rejects(applyIsolatedObservation(pg, preview.inputHash), /元データ/);
  } finally { await pg.close(); }
});
