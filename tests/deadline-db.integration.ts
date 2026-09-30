import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { confirmAdminWrite, rejectAdminWrite, validateAdminWritePreview } from "../src/server/admin/write-service";
import { readDeadlineRecords, getPublicDeadlineData } from "../src/server/deadlines/record-reader";
import type { getDb, getWriterDb } from "../src/db/client";
import type { AdminDeadlineFields } from "../src/domain/deadline";
import { deadlineOperationHash, runDeadlineOperation } from "../scripts/deadline-operation";

test("migrations and deadline Admin write run against isolated in-memory Postgres", async t => {
  const pg = new PGlite();
  const local = drizzle(pg, { schema });
  // Both adapters execute identical Postgres queries; injection never reads DATABASE_URL.
  const db = local as unknown as ReturnType<typeof getWriterDb>;
  const fields: AdminDeadlineFields = {
    id: "ticket-first", label: "先行抽選", projectTitle: "テスト企画", organizer: "主催", projectType: "official", seriesId: null,
    deadlinePrecision: "exact", deadlineAt: "2026-10-08T12:00:00+09:00", deadlineOn: null,
    applicationUrl: "https://example.com/apply", note: null, state: "scheduled", appearanceIds: [],
  };
  const source = { canonicalUrl: "https://example.com/news/first", sourceName: "official:test", externalItemId: "first", evidenceKey: "first", precision: "date", publishedAt: null, publishedOn: "2026-09-30" };
  const create = { kind: "deadline", operation: "create", expectedVersion: null, fields, source };
  try {
    for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
      if (file.startsWith("0006_")) {
        // Historical Phase 1C requires the prior backfill checkpoint. This empty
        // fixture has no legacy records; mark its isolated checkpoint complete.
        await pg.exec("update appearance_backfill_checkpoints set completed_at=now(), dual_write_confirmed_at=now() where id='phase-1b'");
      }
      await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    }
    await t.test("entire migration history applies without remote database access", async () => {
      assert.equal((await pg.query<{ count: number }>("select count(*)::int from deadlines")).rows[0].count, 0);
    });
    await t.test("activation gate refuses mutation before Admin activation", async () => {
      await assert.rejects(confirmAdminWrite(create, "not-activated", db), /activation/);
      await pg.exec("update content_management_state set content_mode='admin', admin_activated_at='2026-09-30T00:00:00Z', legacy_import_locked_at='2026-09-30T00:00:00Z' where id='singleton'");
    });
    await t.test("preview is read-only and create atomically persists proposal/content/source/revision", async () => {
      await validateAdminWritePreview(create, db);
      assert.equal((await local.select().from(schema.deadlinesTable)).length, 0);
      assert.equal((await local.select().from(schema.deadlineProposalsTable)).length, 0);
      const result = await confirmAdminWrite(create, "create-key", db);
      assert.equal(result.status, "approved");
      assert.deepEqual(result.status === "approved" ? result.targets : [], [{ id: fields.id, version: 1 }]);
      assert.equal((await local.select().from(schema.deadlineRevisionsTable)).length, 1);
      const links = await local.select().from(schema.deadlineSourceLinksTable);
      assert.equal(links.length, 1);
      assert.equal(links[0].active && links[0].isPrimary, true);
    });
    await t.test("public repository round-trips timestamps and strips management fields", async () => {
      const reader = db as unknown as ReturnType<typeof getDb>;
      const [record] = await readDeadlineRecords(reader);
      assert.equal(record.deadlineAt, "2026-10-08T03:00:00.000Z");
      assert.equal(record.sourceEvidence.length, 1);
      const data = await getPublicDeadlineData([], reader);
      assert.equal(data.deadlines.length, 1);
      assert.equal(data.deadlines[0].projectTitle, fields.projectTitle);
      assert.equal("version" in data.deadlines[0], false);
      assert.equal("sourceEvidence" in data.deadlines[0], false);
      assert.ok(data.lastUpdatedAt);
    });
    await t.test("confirmation replay is idempotent and a reused key with different content is refused", async () => {
      const replay = await confirmAdminWrite(create, "create-key", db);
      assert.equal(replay.replayed, true);
      assert.equal((await local.select().from(schema.deadlineRevisionsTable)).length, 1);
      await assert.rejects(confirmAdminWrite({ ...create, fields: { ...fields, note: "changed" } }, "create-key", db), /確定キー/);
    });
    await t.test("deadline extension keeps identity and replaces source with auditable history", async () => {
      const result = await confirmAdminWrite({ kind: "deadline", operation: "update", deadlineId: fields.id, expectedVersion: 1,
        fields: { ...fields, deadlineAt: "2026-10-09T12:00:00+09:00" }, source: { ...source, canonicalUrl: "https://example.com/news/extension", externalItemId: "extension" },
      }, "extension-key", db);
      assert.equal(result.status, "approved");
      const [record] = await local.select().from(schema.deadlinesTable);
      assert.equal(record.version, 2);
      assert.equal(record.deadlineAt?.toISOString(), "2026-10-09T03:00:00.000Z");
      const sources = await local.select().from(schema.deadlineSourceLinksTable);
      assert.equal(sources.length, 2);
      assert.equal(sources.filter(item => item.active && item.isPrimary).length, 1);
      const revisions = await local.select().from(schema.deadlineRevisionsTable);
      assert.equal(revisions.length, 2);
      assert.equal((revisions[1].snapshot.sourceLinks as unknown[]).length, 2);
      const replay = await confirmAdminWrite(create, "create-key", db);
      assert.equal(replay.status === "approved" ? replay.targets[0].version : 0, 1);
    });
    await t.test("stale edits become superseded and duplicate stages become rejected", async () => {
      const stale = await confirmAdminWrite({ kind: "deadline", operation: "update", deadlineId: fields.id, expectedVersion: 1, fields, source }, "stale-key", db);
      assert.equal(stale.status, "superseded");
      const duplicate = await confirmAdminWrite({ ...create, fields: { ...fields, id: "another-id" } }, "duplicate-key", db);
      assert.equal(duplicate.status, "rejected");
      const [record] = await local.select().from(schema.deadlinesTable);
      assert.equal(record.version, 2);
      assert.equal((await local.select().from(schema.deadlineRevisionsTable)).length, 2);
    });
    await t.test("hide and restore retain record, source and revision history", async () => {
      assert.equal((await confirmAdminWrite({ kind: "deadline", operation: "hide", deadlineId: fields.id, expectedVersion: 2 }, "hide-key", db)).status, "approved");
      assert.equal((await local.select().from(schema.deadlinesTable))[0].visibilityStatus, "hidden");
      assert.equal((await getPublicDeadlineData([], db as unknown as ReturnType<typeof getDb>)).deadlines.length, 0);
      assert.equal((await confirmAdminWrite({ kind: "deadline", operation: "restore", deadlineId: fields.id, expectedVersion: 3 }, "restore-key", db)).status, "approved");
      assert.equal((await local.select().from(schema.deadlinesTable))[0].visibilityStatus, "public");
      assert.equal((await local.select().from(schema.deadlineRevisionsTable)).length, 4);
    });
    await t.test("discarded preview persists rejection without creating content and replays safely", async () => {
      const input = { ...create, fields: { ...fields, id: "discarded", label: "別企画" } };
      assert.equal((await rejectAdminWrite(input, "reject-key", db)).status, "rejected");
      assert.equal((await rejectAdminWrite(input, "reject-key", db)).replayed, true);
      assert.equal((await local.select().from(schema.deadlinesTable).where(eq(schema.deadlinesTable.id, "discarded"))).length, 0);
    });
    await t.test("Postgres rejects missing primary source and invalid precision without partial content", async () => {
      await assert.rejects(pg.exec("insert into deadlines(id,label,project_title,organizer,project_type,deadline_precision,fingerprint) values('no-source','受付','企画','主催','fan','unknown','no-source')"), /primary source/);
      await assert.rejects(pg.exec("insert into deadlines(id,label,project_title,organizer,project_type,deadline_precision,fingerprint) values('no-date','受付','企画','主催','fan','exact','no-date')"), /precision/);
      assert.equal((await pg.query<{ count: number }>("select count(*)::int from deadlines where id in ('no-source','no-date')")).rows[0].count, 0);
    });
    await t.test("shared event deadlines validate targets and survive group title updates", async () => {
      const event = { id: "event-day", title: "公演・昼", startsAtPrecision: "date", startsAt: null, startsOn: "2026-10-20", seriesId: null,
        eventGroupId: "event-group", eventTitle: "共通公演", sessionLabel: "昼", category: "イベント" };
      const evening = { ...event, id: "event-night", title: "公演・夜", sessionLabel: "夜" };
      for (const item of [event, evening]) {
        const result = await confirmAdminWrite({ kind: "appearance", operation: "create", expectedVersion: null, fields: item,
          source: { ...source, canonicalUrl: "https://example.com/news/event", externalItemId: "event" } }, item.id, db);
        assert.equal(result.status, "approved");
      }
      const shared = { ...fields, id: "shared-entry", label: "共通受付", appearanceIds: [event.id, evening.id] };
      assert.equal((await confirmAdminWrite({ ...create, fields: shared, source: { ...source, evidenceKey: "shared-entry" } }, "shared-key", db)).status, "approved");
      await assert.rejects(validateAdminWritePreview({ kind: "appearance", operation: "update", appearanceId: event.id, expectedVersion: 1,
        fields: { ...event, eventGroupId: null, eventTitle: null, sessionLabel: null } }, db), /共通締切/);
      const invalid = await confirmAdminWrite({ ...create, fields: { ...fields, id: "missing-target", appearanceIds: ["not-present"] }, source: { ...source, evidenceKey: "missing-target" } }, "missing-target-key", db);
      assert.equal(invalid.status, "rejected");
      const collision = await confirmAdminWrite({ ...create, fields: { ...fields, id: "source-collision", label: "別受付" }, source: { ...source, evidenceKey: "shared-entry" } }, "source-collision-key", db);
      assert.equal(collision.status, "rejected");
      const groupResult = await confirmAdminWrite({ kind: "appearance-group", operation: "update", eventGroupId: "event-group", eventTitle: "変更後の公演名",
        targets: [ { appearanceId: event.id, expectedVersion: 1, title: event.title }, { appearanceId: evening.id, expectedVersion: 1, title: evening.title } ] }, "group-title-key", db);
      assert.equal(groupResult.status, "approved");
    });
    await t.test("moving a primary link cannot leave its original deadline without a source", async () => {
      await assert.rejects(local.transaction(async tx => {
        await tx.update(schema.deadlineSourceLinksTable).set({ active: false, isPrimary: false }).where(eq(schema.deadlineSourceLinksTable.deadlineId, "shared-entry"));
        await tx.update(schema.deadlineSourceLinksTable).set({ deadlineId: "shared-entry" }).where(eq(schema.deadlineSourceLinksTable.deadlineId, fields.id));
      }), /primary source/);
      const links = await local.select().from(schema.deadlineSourceLinksTable).where(eq(schema.deadlineSourceLinksTable.deadlineId, fields.id));
      assert.equal(links.filter(link => link.active && link.isPrimary).length, 1);
    });
    await t.test("manual closure and cancellation are versioned updates", async () => {
      for (const [index, state] of ["closed", "cancelled"].entries()) {
        const result = await confirmAdminWrite({ kind: "deadline", operation: "update", deadlineId: fields.id, expectedVersion: 4 + index, fields: { ...fields, state },
          source: { ...source, canonicalUrl: "https://example.com/news/extension", externalItemId: "extension" } }, "manual-" + state, db);
        assert.equal(result.status, "approved");
        assert.equal((await local.select().from(schema.deadlinesTable).where(eq(schema.deadlinesTable.id, fields.id)))[0].state, state);
      }
    });
    await t.test("JSON adapter previews and confirms all normal operations, detects races and safely replays", async () => {
      const input = { ...create, fields: { ...fields, id: "cli-ticket", label: "CLI受付" }, source: { ...source, evidenceKey: "cli-ticket" } };
      let output = "";
      const dependencies = {
        readRecords: () => readDeadlineRecords(db as unknown as ReturnType<typeof getDb>),
        validatePreview: (value: unknown) => validateAdminWritePreview(value, db),
        confirm: (value: unknown, key: string) => confirmAdminWrite(value, key, db),
        log: (value: string) => { output = value; },
      };
      const apply = (value: unknown) => runDeadlineOperation(value, { apply: true, reviewedHash: deadlineOperationHash(value) }, dependencies);
      const count = async () => (await local.select().from(schema.deadlineRevisionsTable)).length;
      const initial = await count();
      await runDeadlineOperation(input, { apply: false }, dependencies);
      assert.equal(JSON.parse(output).before, null);
      assert.equal(await count(), initial);
      assert.equal((await apply(input))?.status, "approved");
      const operations = [
        { ...input, operation: "update", deadlineId: "cli-ticket", expectedVersion: 1, fields: { ...input.fields, deadlineAt: "2026-10-10T12:00:00+09:00" } },
        { ...input, operation: "update", deadlineId: "cli-ticket", expectedVersion: 2, fields: { ...input.fields, state: "closed" } },
        { ...input, operation: "update", deadlineId: "cli-ticket", expectedVersion: 3, fields: { ...input.fields, state: "cancelled" } },
        { kind: "deadline", operation: "hide", deadlineId: "cli-ticket", expectedVersion: 4 },
        { kind: "deadline", operation: "restore", deadlineId: "cli-ticket", expectedVersion: 5 },
      ];
      for (const value of operations) {
        const beforeCount = await count();
        await runDeadlineOperation(value, { apply: false }, dependencies);
        assert.equal(await count(), beforeCount);
        const result = await apply(value);
        assert.equal(result?.status, "approved");
      }
      const stale = { ...input, operation: "update", deadlineId: "cli-ticket", expectedVersion: 6, fields: { ...input.fields, note: "reviewed" } };
      await runDeadlineOperation(stale, { apply: false }, dependencies);
      await apply({ ...stale, fields: { ...input.fields, note: "concurrent change" } });
      await assert.rejects(apply(stale), /superseded/);
      const [current] = await local.select().from(schema.deadlinesTable).where(eq(schema.deadlinesTable.id, "cli-ticket"));
      assert.equal(current.version, 7);
      assert.equal(current.note, "concurrent change");
      const finalCount = await count();
      assert.equal((await apply(input))?.replayed, true);
      assert.equal((await apply(operations[3]))?.replayed, true);
      assert.equal(await count(), finalCount);
      assert.equal((await local.select().from(schema.deadlinesTable).where(eq(schema.deadlinesTable.id, "cli-ticket")))[0].visibilityStatus, "public");
    });
    await t.test("transaction rolls back content if a related reference is invalid", async () => {
      await assert.rejects(local.transaction(async tx => {
        await tx.insert(schema.deadlinesTable).values({ ...fields, id: "rollback", deadlineAt: new Date(fields.deadlineAt!), fingerprint: "rollback" });
        await tx.insert(schema.deadlineAppearanceLinksTable).values({ deadlineId: "rollback", appearanceId: "missing-event" });
      }));
      assert.equal((await local.select().from(schema.deadlinesTable).where(eq(schema.deadlinesTable.id, "rollback"))).length, 0);
    });
  } finally { await pg.close(); }
});
