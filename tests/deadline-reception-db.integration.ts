import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import { getReceptionStatus, getReceptionFields } from "../src/domain/deadline";
import type { getDb, getWriterDb } from "../src/db/client";
import { deadlineOperationHash, runDeadlineOperation } from "../scripts/deadline-operation";
import { confirmAdminWrite, validateAdminWritePreview } from "../src/server/admin/write-service";
import { readDeadlineRecords } from "../src/server/deadlines/record-reader";

const legacyTableSnapshots = [
  ["deadlines", "id"],
  ["deadline_appearance_links", "deadline_id, appearance_id"],
  ["deadline_source_links", "deadline_id, source_id, evidence_key"],
  ["deadline_proposals", "id"],
  ["deadline_revisions", "id"],
  ["source_items", "id"],
  ["source_identities", "id"],
] as const;

async function snapshotLegacyRows(pg: PGlite) {
  const result: Record<string, string> = {};
  for (const [table, order] of legacyTableSnapshots) {
    const projection = table === "deadlines"
      ? `id, label, project_title, organizer, project_type, series_id, deadline_precision, deadline_at, deadline_on, application_url, note, state, fingerprint, visibility_status, version, created_at, updated_at`
      : "*";
    const rows = await pg.query<{ rows: unknown }>(
      `select coalesce(jsonb_agg(to_jsonb(row_value) order by ${order}), '[]'::jsonb) as rows from (select ${projection} from ${table}) row_value`,
    );
    result[table] = JSON.stringify(rows.rows[0].rows);
  }
  return result;
}

async function applyLegacyMigrations(pg: PGlite) {
  const files = (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort();
  for (const file of files.filter(name => /^00(?:0[0-9]|1[0-3])_/.test(name))) {
    if (file.startsWith("0006_")) {
      // The historical Phase 1C migration requires the preceding backfill checkpoint.
      await pg.exec("update appearance_backfill_checkpoints set completed_at=now(), dual_write_confirmed_at=now() where id='phase-1b'");
    }
    await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
  }
}

async function seedLegacyDeadline(pg: PGlite) {
  await pg.exec(`
    insert into source_items(id, canonical_url, source_type, first_collected_at, last_collected_at, created_at, updated_at)
    values ('legacy-source', 'https://example.com/news/legacy-ticket', 'web',
      '2026-09-29T01:02:03.123456Z', '2026-09-29T01:02:04.654321Z', '2026-09-29T01:02:05.000123Z', '2026-09-29T01:02:06.000987Z');
    insert into source_identities(id, source_id, source_name, external_item_id, is_canonical, created_at)
    values ('legacy-source-identity', 'legacy-source', 'official:legacy', 'legacy-ticket-announcement', true, '2026-09-29T01:02:07.000456Z');
    insert into deadlines(id, label, project_title, organizer, project_type, series_id,
      deadline_precision, deadline_at, deadline_on, application_url, note, state, fingerprint,
      visibility_status, version, created_at, updated_at)
    values ('legacy-ticket', '先行抽選', 'レガシー企画', '主催者', 'official', null,
      'exact', '2026-10-20T12:34:56.123456+09:00', null, 'https://example.com/apply', '既存記録',
      'scheduled', '["legacy-project","legacy-stage"]', 'public', 3,
      '2026-09-29T01:02:08.123456Z', '2026-09-29T01:02:09.654321Z');
    insert into deadline_source_links(deadline_id, source_id, source_identity_id, evidence_key, active, is_primary,
      published_at_precision, published_at, published_on, collected_at, updated_at)
    values ('legacy-ticket', 'legacy-source', 'legacy-source-identity', 'announcement', true, true,
      'exact', '2026-09-29T10:11:12.123456Z', null,
      '2026-09-29T01:02:10.123456Z', '2026-09-29T01:02:11.654321Z');
    insert into deadline_proposals(id, deadline_id, target_deadline_id, operation, status, expected_version,
      input, reviewed_content_hash, idempotency_key, review_note, created_at, reviewed_at)
    values ('legacy-proposal', 'legacy-ticket', 'legacy-ticket', 'create', 'approved', null,
      '{"legacy":true}'::jsonb, 'legacy-hash', 'legacy-idempotency-key', 'legacy approval',
      '2026-09-29T01:02:12.123456Z', '2026-09-29T01:02:13.654321Z');
    insert into deadline_revisions(id, deadline_id, proposal_id, version, snapshot_schema_version, snapshot, created_at)
    values ('legacy-revision', 'legacy-ticket', 'legacy-proposal', 3, 1,
      '{"legacySnapshot":{"deadlineAt":"2026-10-20T03:34:56.123456Z"}}'::jsonb,
      '2026-09-29T01:02:14.123456Z');
  `);
}

test("0014/0015 upgrade preserves every legacy deadline, audit, and source value", async () => {
  const pg = new PGlite();
  try {
    await applyLegacyMigrations(pg);
    await seedLegacyDeadline(pg);
    const before = await snapshotLegacyRows(pg);

    await pg.exec(await readFile("drizzle/0014_add_deadline_sold_out.sql", "utf8"));
    await pg.exec(await readFile("drizzle/0015_add_reception_sales_fields.sql", "utf8"));

    const after = await snapshotLegacyRows(pg);
    assert.deepEqual(after, before, "all pre-existing deadline, link, proposal, revision, and source columns remain unchanged");
    const enriched = await pg.query<{
      information_type: string;
      starts_at_precision: string;
      starts_at: string | null;
      starts_on: string | null;
      phase_override: string;
      sale_mode: string;
    }>(`select information_type, starts_at_precision, starts_at, starts_on, phase_override, sale_mode from deadlines where id='legacy-ticket'`);
    assert.deepEqual(enriched.rows[0], {
      information_type: "unspecified",
      starts_at_precision: "unknown",
      starts_at: null,
      starts_on: null,
      phase_override: "auto",
      sale_mode: "initial",
    }, "migration defaults do not classify or infer legacy reception details");

    const local = drizzle(pg, { schema });
    const db = local as unknown as ReturnType<typeof getWriterDb>;
    const reader = db as unknown as ReturnType<typeof getDb>;
    await pg.exec("update content_management_state set content_mode='admin', admin_activated_at='2026-09-30T00:00:00Z', legacy_import_locked_at='2026-09-30T00:00:00Z' where id='singleton'");

    const saleFields = {
      id: "goods-sale",
      label: "記念グッズ通販",
      projectTitle: "記念グッズ",
      organizer: "公式ストア",
      projectType: "official",
      seriesId: null,
      deadlinePrecision: "unknown",
      deadlineAt: null,
      deadlineOn: null,
      applicationUrl: "https://example.com/store/item",
      note: null,
      state: "scheduled",
      appearanceIds: [],
      informationType: "online_sale",
      startsAtPrecision: "date",
      startsAt: null,
      startsOn: "2026-10-01",
      phaseOverride: "auto",
      saleMode: "initial",
    } as const;
    const primarySource = {
      canonicalUrl: "https://example.com/news/goods-sale",
      sourceName: "official:store",
      externalItemId: "goods-sale-announcement",
      evidenceKey: "goods-sale",
      precision: "exact",
      publishedAt: "2026-09-30T02:03:04.123Z",
      publishedOn: null,
    } as const;
    const firstEvidence = {
      canonicalUrl: "https://example.com/store/item",
      sourceName: "official:store",
      externalItemId: "goods-sale-page",
      evidenceKey: "store-page",
      precision: "date",
      publishedAt: null,
      publishedOn: "2026-09-30",
    } as const;
    const create = {
      kind: "deadline",
      operation: "create",
      expectedVersion: null,
      schemaVersion: 2,
      fields: saleFields,
      source: primarySource,
      evidenceSources: [firstEvidence],
    } as const;
    let output = "";
    const dependencies = {
      readRecords: () => readDeadlineRecords(reader),
      validatePreview: (input: unknown) => validateAdminWritePreview(input, db),
      confirm: (input: unknown, key: string) => confirmAdminWrite(input, key, db),
      log: (value: string) => { output = value; },
    };
    const apply = (input: unknown) => runDeadlineOperation(input, {
      apply: true,
      reviewedHash: deadlineOperationHash(input),
    }, dependencies);

    await runDeadlineOperation(create, { apply: false }, dependencies);
    const preview = JSON.parse(output);
    assert.equal(preview.before, null);
    assert.equal(preview.after.fields.startsAtPrecision, "date");
    assert.equal(preview.after.fields.startsOn, "2026-10-01");
    assert.equal(preview.after.fields.deadlinePrecision, "unknown");
    assert.equal(preview.after.fields.deadlineAt, null);
    assert.equal(preview.after.sourceEvidence.length, 2);
    assert.equal(preview.inputHash, deadlineOperationHash(create));
    assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from deadlines where id='goods-sale'")).rows[0].count, 0, "Preview is read-only");
    assert.equal((await apply(create))?.status, "approved");
    assert.equal((await apply(create))?.replayed, true, "the same hash and key safely replay an approved operation");
    // Give the existing primary sub-millisecond precision; v2 evidence-only
    // updates must leave this exact stored value and collection times untouched.
    await pg.exec("update deadline_source_links set published_at='2026-09-30T02:03:04.123456Z' where deadline_id='goods-sale' and is_primary");
    const primarySnapshot = async () => (await pg.query("select published_at::text, collected_at::text, updated_at::text from deadline_source_links where deadline_id='goods-sale' and is_primary")).rows;
    const originalPrimary = await primarySnapshot();

    const stored = async () => (await pg.query<{
      version: number; state: string; fingerprint: string; information_type: string; starts_at_precision: string;
      starts_at: string | null; starts_on: string | null; deadline_precision: string; deadline_at: string | null;
      deadline_on: string | null; sale_mode: string;
    }>(`select version, state, fingerprint, information_type, starts_at_precision, starts_at, starts_on::text as starts_on,
      deadline_precision, deadline_at, deadline_on::text as deadline_on, sale_mode from deadlines where id='goods-sale'`)).rows[0];
    const initial = await stored();
    assert.equal(initial.starts_at_precision, "date");
    assert.equal(initial.starts_at, null);
    assert.equal(initial.starts_on, "2026-10-01");
    assert.equal(initial.deadline_precision, "unknown");
    assert.equal(initial.deadline_at, null);
    assert.equal(initial.deadline_on, null);
    assert.equal(getReceptionStatus({ ...saleFields, state: "scheduled" }, new Date("2026-10-01T02:00:00Z")), "start_today");
    assert.equal(getReceptionStatus({ ...saleFields, state: "scheduled" }, new Date("2026-10-01T15:00:00Z")), "open");

    const update = (expectedVersion: number, fields: Record<string, unknown>, evidenceKey: string) => ({
      ...create,
      operation: "update",
      deadlineId: saleFields.id,
      expectedVersion,
      fields: { ...saleFields, ...fields },
      evidenceSources: [{
        ...firstEvidence,
        externalItemId: `goods-sale-${evidenceKey}`,
        evidenceKey,
        canonicalUrl: `https://example.com/news/${evidenceKey}`,
      }],
    });
    const extension = update(1, {
      deadlinePrecision: "exact",
      deadlineAt: "2026-10-10T12:30:00+09:00",
      deadlineOn: null,
      startsAtPrecision: "exact",
      startsAt: "2026-10-01T10:00:00+09:00",
      startsOn: null,
    }, "extension");
    await runDeadlineOperation(extension, { apply: false }, dependencies);
    assert.equal(JSON.parse(output).after.fields.startsAt, "2026-10-01T01:00:00.000Z");
    assert.equal((await apply(extension))?.status, "approved");
    const exactRoundTrip = await stored();
    assert.equal(new Date(exactRoundTrip.starts_at!).toISOString(), "2026-10-01T01:00:00.000Z");
    assert.equal(exactRoundTrip.starts_at_precision, "exact");
    assert.equal(new Date(exactRoundTrip.deadline_at!).toISOString(), "2026-10-10T03:30:00.000Z");
    const soldOut = update(2, { state: "sold_out" }, "sold-out");
    assert.equal((await apply(soldOut))?.status, "approved");
    const resale = update(3, {
      state: "scheduled",
      deadlinePrecision: "unknown",
      deadlineOn: null,
      startsAtPrecision: "date",
      startsOn: "2026-10-15",
      saleMode: "resale",
    }, "resale");
    assert.equal((await apply(resale))?.status, "approved");

    const finalBeforeLegacyUpdate = await stored();
    assert.equal(finalBeforeLegacyUpdate.version, 4);
    assert.equal(finalBeforeLegacyUpdate.state, "scheduled");
    assert.equal(finalBeforeLegacyUpdate.sale_mode, "resale");
    assert.equal(finalBeforeLegacyUpdate.starts_on, "2026-10-15");
    assert.equal(finalBeforeLegacyUpdate.deadline_precision, "unknown");
    assert.equal(finalBeforeLegacyUpdate.deadline_at, null);
    assert.equal(finalBeforeLegacyUpdate.fingerprint, initial.fingerprint, "extension, sell-out and resale keep the same fingerprint identity");
    const revisionCount = (await pg.query<{ count: number }>("select count(*)::int as count from deadline_revisions where deadline_id='goods-sale'")).rows[0].count;
    assert.equal(revisionCount, 4);
    const linksBeforeLegacyUpdate = await pg.query<{ evidence_key: string; active: boolean; is_primary: boolean }>(
      "select evidence_key, active, is_primary from deadline_source_links where deadline_id='goods-sale' order by evidence_key",
    );
    assert.ok(linksBeforeLegacyUpdate.rows.some(link => link.evidence_key === "goods-sale" && link.active && link.is_primary));
    for (const key of ["store-page", "extension", "sold-out", "resale"]) {
      assert.ok(linksBeforeLegacyUpdate.rows.some(link => link.evidence_key === key && link.active));
    }
    assert.equal(linksBeforeLegacyUpdate.rows.filter(link => link.active && link.is_primary).length, 1);
    assert.deepEqual(await primarySnapshot(), originalPrimary, "period/stock/resale changes retain primary publication and collection precision");
    await assert.rejects(validateAdminWritePreview({ ...resale, expectedVersion: 4, fields: { ...resale.fields, state: "sold_out" }, evidenceSources: [] }, db), /追加根拠/);
    await assert.rejects(validateAdminWritePreview({ ...resale, expectedVersion: 4, evidenceSources: [{ ...firstEvidence, evidenceKey: "collision", canonicalUrl: primarySource.canonicalUrl }] }, db), /identity/);
    await assert.rejects(validateAdminWritePreview({ ...resale, expectedVersion: 4, source: { ...primarySource, externalItemId: "different-announcement" } }, db), /source identity/);

    const legacyV1Update = {
      kind: "deadline",
      operation: "update",
      deadlineId: saleFields.id,
      expectedVersion: 4,
      fields: {
        id: saleFields.id, label: saleFields.label, projectTitle: saleFields.projectTitle, organizer: saleFields.organizer,
        projectType: saleFields.projectType, seriesId: null, deadlinePrecision: "unknown", deadlineAt: null, deadlineOn: null,
        applicationUrl: saleFields.applicationUrl, note: "legacy v1 update", state: "scheduled", appearanceIds: [],
      },
      source: primarySource,
    };
    assert.equal((await confirmAdminWrite(legacyV1Update, "legacy-v1-update", db)).status, "approved");
    const preserved = await stored();
    assert.equal(preserved.version, 5);
    assert.equal(preserved.information_type, "online_sale");
    assert.equal(preserved.starts_at_precision, "date");
    assert.equal(preserved.starts_on, "2026-10-15");
    assert.equal(preserved.sale_mode, "resale");

    const stale = update(4, { note: "stale update" }, "stale");
    const staleResult = await confirmAdminWrite(stale, "stale-reception-update", db);
    assert.equal(staleResult.status, "superseded");
    assert.equal((await stored()).version, 5);

    const legacy = (await readDeadlineRecords(reader)).find(row => row.id === "legacy-ticket")!;
    const legacyTimes = async () => (await pg.query("select deadline_at::text from deadlines where id='legacy-ticket'")).rows;
    const sourceTimes = async () => (await pg.query("select published_at::text, collected_at::text, updated_at::text from deadline_source_links where deadline_id='legacy-ticket' and is_primary")).rows;
    const oldDeadlineTimes = await legacyTimes();
    const oldSourceTimes = await sourceTimes();
    let invalidations = 0;
    const noteUpdate = { kind: "deadline", schemaVersion: 2, operation: "update", deadlineId: legacy.id, expectedVersion: legacy.version,
      fields: { ...legacy, ...getReceptionFields(legacy), note: "監査補足" }, source: legacy.source };
    const invalidate = async () => {
      invalidations++;
      const committed = await readDeadlineRecords(reader);
      assert.equal(committed.find(row => row.id === legacy.id)?.note, "監査補足");
      return { status: "invalidated" as const };
    };
    const noteResult = await confirmAdminWrite(noteUpdate, "legacy-note-v2", db, invalidate);
    assert.equal(noteResult.status, "approved");
    assert.equal(noteResult.publicCacheInvalidation?.status, "invalidated");
    const noteReplay = await confirmAdminWrite(noteUpdate, "legacy-note-v2", db, invalidate);
    assert.equal(noteReplay.replayed, true);
    assert.equal(invalidations, 2);
    assert.deepEqual(await legacyTimes(), oldDeadlineTimes, "unchanged deadline microseconds survive ordinary v2 updates");
    assert.deepEqual(await sourceTimes(), oldSourceTimes, "unchanged primary microseconds survive ordinary v2 updates");
  } finally {
    await pg.close();
  }
});
