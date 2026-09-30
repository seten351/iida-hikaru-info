import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { getWriterDb } from "../src/db/client";
import { confirmAdminWrite, validateAdminWritePreview } from "../src/server/admin/write-service";
import { parseAdminWriteInput } from "../src/server/admin/write-input";
import { decodeAppearanceRevisionSnapshot } from "../src/server/appearances/revisions";
import { emptyGuestInfo, normalizeGuestInfo, sameGuestInfo } from "../src/domain/appearance-guests";

test("guest migration and Admin writes preserve publication, evidence and guest assignments", async t => {
  const pg = new PGlite();
  const local = drizzle(pg, { schema });
  const db = local as unknown as ReturnType<typeof getWriterDb>;
  const fields = { id: "guest-test", title: "検証番組", category: "配信", startsAtPrecision: "date", startsOn: "2026-10-10", startsAt: null, seriesId: null, eventGroupId: null, eventTitle: null, sessionLabel: null };
  const source = { canonicalUrl: "https://example.com/official/original", sourceName: "official:test", externalItemId: "original", evidenceKey: "default", precision: "date", publishedAt: null, publishedOn: "2026-09-01" };
  const evidence = { ...source, canonicalUrl: "https://example.com/official/guest", externalItemId: "guest", evidenceKey: "guests", publishedOn: "2026-09-30" };
  const update = (version: number, guestInfo?: ReturnType<typeof emptyGuestInfo>) => ({ kind: "appearance", operation: "update", appearanceId: fields.id, expectedVersion: version, fields: { ...fields, ...(guestInfo === undefined ? {} : { guestInfo }) }, ...(guestInfo === undefined ? {} : { evidenceSources: [evidence] }) });
  try {
    for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
      if (file.startsWith("0006_")) await pg.exec("update appearance_backfill_checkpoints set completed_at=now(), dual_write_confirmed_at=now() where id='phase-1b'");
      // Create a legacy record before the guest migration to verify its additive default.
      if (file.startsWith("0013_")) {
        await pg.exec("update content_management_state set content_mode='admin',admin_activated_at=now(),legacy_import_locked_at=now() where id='singleton'");
        // The pre-migration schema cannot use the new Drizzle columns; the legacy SQL fixture stays isolated.
        await pg.exec(`insert into source_items(id,canonical_url,source_type,first_collected_at,last_collected_at) values('legacy-source','https://example.com/legacy','web',now(),now());
          insert into source_identities(id,source_id,source_name,external_item_id,is_canonical) values('legacy-identity','legacy-source','official:test','legacy',true);
          insert into appearances(id,title,category,starts_at_precision,source_url,source_name,source_item_id,published_at_precision,collected_at,visibility_status,first_visible_at,visibility_changed_at,version)
          values('legacy-guest','従来番組','配信','unknown','https://example.com/legacy','official:test','legacy','unknown',now(),'public',now(),now(),1);
          insert into appearance_source_links(appearance_id,source_id,source_identity_id,evidence_key,active,is_primary,published_at_precision,collected_at) values('legacy-guest','legacy-source','legacy-identity','default',true,true,'unknown',now());`);
      }
      await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    }
    await t.test("legacy guest data defaults to unconfirmed, including JSON null", async () => {
      const [legacy] = await local.select().from(schema.appearancesTable).where(eq(schema.appearancesTable.id, "legacy-guest"));
      assert.deepEqual(legacy.guestInfo, emptyGuestInfo());
      assert.equal(legacy.version, 1);
      await assert.rejects(pg.exec("update appearances set guest_info='{}'::jsonb where id='legacy-guest'"), /guest_info_valid/);
      await assert.rejects(pg.exec("update appearances set guest_info='{\"isHikaruGuest\":null,\"guestNames\":[1]}'::jsonb where id='legacy-guest'"), /guest_info_valid/);
    });
    await t.test("unchanged guest input needs no evidence and legacy primary links keep their metadata", async () => {
      const legacyFields = { ...fields, id: "legacy-guest", startsAtPrecision: "unknown", startsOn: null, title: "従来番組", guestInfo: { guestNames: [], isHikaruGuest: null } };
      const sourcesBefore = await local.select().from(schema.sourceItemsTable);
      const linksBefore = await local.select().from(schema.appearanceSourceLinksTable);
      assert.equal((await confirmAdminWrite({ kind: "appearance", operation: "update", appearanceId: "legacy-guest", expectedVersion: 1, fields: legacyFields }, "legacy-no-change", db)).status, "approved");
      const legacySource = { ...source, canonicalUrl: "https://example.com/legacy", externalItemId: "legacy", precision: "unknown", publishedOn: null };
      await assert.rejects(confirmAdminWrite({ kind: "appearance", operation: "update", appearanceId: "legacy-guest", expectedVersion: 2, fields: { ...legacyFields, guestInfo: { isHikaruGuest: true, guestNames: [] } }, evidenceSources: [{ ...legacySource, precision: "date", publishedOn: "2026-09-30" }] }, "legacy-wrong-date", db), /公開日時/);
      assert.equal((await confirmAdminWrite({ kind: "appearance", operation: "update", appearanceId: "legacy-guest", expectedVersion: 2, fields: { ...legacyFields, guestInfo: { isHikaruGuest: true, guestNames: [] } }, evidenceSources: [legacySource] }, "legacy-guest-change", db)).status, "approved");
      assert.deepEqual(await local.select().from(schema.sourceItemsTable), sourcesBefore);
      assert.deepEqual(await local.select().from(schema.appearanceSourceLinksTable), linksBefore);
    });
    await confirmAdminWrite({ kind: "appearance", operation: "create", expectedVersion: null, fields, source }, "guest-create", db);
    const [original] = await local.select().from(schema.appearancesTable).where(eq(schema.appearancesTable.id, fields.id));
    const originalLinks = await local.select().from(schema.appearanceSourceLinksTable).where(eq(schema.appearanceSourceLinksTable.appearanceId, fields.id));
    await t.test("preview is read-only and guest changes need official evidence", async () => {
      const input = update(1, { isHikaruGuest: true, guestNames: ["青木さん", "佐藤さん"] });
      await validateAdminWritePreview(input, db);
      assert.equal((await local.select().from(schema.appearanceRevisionsTable).where(eq(schema.appearanceRevisionsTable.appearanceId, fields.id))).length, 1);
      await assert.rejects(confirmAdminWrite({ ...input, evidenceSources: undefined }, "no-evidence", db), /公式根拠/);
      assert.equal((await local.select().from(schema.appearancesTable).where(eq(schema.appearancesTable.id, fields.id)))[0].version, 1);
    });
    await t.test("guest evidence appends atomically while primary/publication are unchanged", async () => {
      const input = update(1, { isHikaruGuest: true, guestNames: ["青木さん", "佐藤さん"] });
      assert.equal((await confirmAdminWrite(input, "guest-change", db)).status, "approved");
      const [current] = await local.select().from(schema.appearancesTable).where(eq(schema.appearancesTable.id, fields.id));
      assert.deepEqual(current.guestInfo, input.fields.guestInfo);
      for (const key of ["sourceUrl", "sourceName", "sourceItemId", "publishedAt", "publishedOn", "publishedAtPrecision", "collectedAt", "visibilityStatus", "firstVisibleAt"] as const) assert.deepEqual(current[key], original[key]);
      const links = await local.select().from(schema.appearanceSourceLinksTable).where(eq(schema.appearanceSourceLinksTable.appearanceId, fields.id));
      assert.equal(links.length, 2);
      assert.deepEqual(links.find(link => link.isPrimary), originalLinks[0]);
      assert.equal(links.filter(link => !link.isPrimary && link.active).length, 1);
      const revisions = await local.select().from(schema.appearanceRevisionsTable).where(eq(schema.appearanceRevisionsTable.appearanceId, fields.id));
      assert.equal(revisions[1].snapshotSchemaVersion, 4);
      assert.deepEqual((revisions[1].snapshot as { appearance: { guestInfo: unknown } }).appearance.guestInfo, current.guestInfo);
      assert.equal((await local.select().from(schema.proposalSourceLinksTable)).length, 3);
      assert.equal((await confirmAdminWrite(input, "guest-change", db)).replayed, true);
      assert.equal((await local.select().from(schema.appearanceRevisionsTable).where(eq(schema.appearanceRevisionsTable.appearanceId, fields.id))).length, 2);
      assert.equal((await confirmAdminWrite(update(1), "guest-stale", db)).status, "superseded");
    });
    await t.test("omitted guest fields preserve values and existing primary evidence is reusable", async () => {
      await confirmAdminWrite(update(2), "guest-omitted", db);
      const info = { isHikaruGuest: false, guestNames: ["青木さん"] };
      const sourceItemsBefore = await local.select().from(schema.sourceItemsTable);
      await confirmAdminWrite({ ...update(3, info), evidenceSources: [source] }, "guest-primary-reuse", db);
      assert.deepEqual(await local.select().from(schema.sourceItemsTable), sourceItemsBefore);
      const [current] = await local.select().from(schema.appearancesTable).where(eq(schema.appearancesTable.id, fields.id));
      assert.deepEqual(current.guestInfo, info);
      const links = await local.select().from(schema.appearanceSourceLinksTable).where(eq(schema.appearanceSourceLinksTable.appearanceId, fields.id));
      assert.deepEqual(links.find(link => link.isPrimary), originalLinks[0]);
      assert.equal(links.length, 2);
      await assert.rejects(confirmAdminWrite({ ...update(4, emptyGuestInfo()), evidenceSources: [{ ...source, publishedOn: "2026-09-02" }] }, "primary-time-change", db), /公開日時/);
    });
    await t.test("failed evidence identity rolls back fields, sources and history", async () => {
      const before = await local.select().from(schema.appearanceRevisionsTable);
      await assert.rejects(confirmAdminWrite({ ...update(4, emptyGuestInfo()), evidenceSources: [{ ...evidence, canonicalUrl: "https://example.com/wrong-identity" }] }, "guest-bad-identity", db), /source identity/);
      assert.deepEqual(await local.select().from(schema.appearanceRevisionsTable), before);
      assert.equal((await local.select().from(schema.appearancesTable).where(eq(schema.appearancesTable.id, fields.id)))[0].version, 4);
    });
    await t.test("failure after guest/evidence writes rolls the complete transaction back", async () => {
      const before = {
        appearances: await local.select().from(schema.appearancesTable),
        sources: await local.select().from(schema.sourceItemsTable),
        identities: await local.select().from(schema.sourceIdentitiesTable),
        links: await local.select().from(schema.appearanceSourceLinksTable),
        proposals: await local.select().from(schema.appearanceProposalsTable),
        proposalLinks: await local.select().from(schema.proposalSourceLinksTable),
        revisions: await local.select().from(schema.appearanceRevisionsTable),
      };
      await pg.exec("create function guest_test_fail_revision() returns trigger language plpgsql as $$ begin raise exception 'guest test revision failure'; end; $$; create trigger guest_test_failure before insert on appearance_revisions for each row execute function guest_test_fail_revision();");
      try {
        await assert.rejects(confirmAdminWrite({ ...update(4, emptyGuestInfo()), evidenceSources: [{ ...evidence, canonicalUrl: 'https://example.com/official/rollback', externalItemId: 'rollback' }] }, "guest-rollback", db), (error: unknown) => error instanceof Error && error.cause instanceof Error && error.cause.message === "guest test revision failure");
        assert.deepEqual(await local.select().from(schema.appearancesTable), before.appearances);
        assert.deepEqual(await local.select().from(schema.sourceItemsTable), before.sources);
        assert.deepEqual(await local.select().from(schema.sourceIdentitiesTable), before.identities);
        assert.deepEqual(await local.select().from(schema.appearanceSourceLinksTable), before.links);
        assert.deepEqual(await local.select().from(schema.appearanceProposalsTable), before.proposals);
        assert.deepEqual(await local.select().from(schema.proposalSourceLinksTable), before.proposalLinks);
        assert.deepEqual(await local.select().from(schema.appearanceRevisionsTable), before.revisions);
      } finally {
        await pg.exec("drop trigger guest_test_failure on appearance_revisions; drop function guest_test_fail_revision();");
      }
    });
    await t.test("hide/restore and grouped title update preserve each guest assignment", async () => {
      await confirmAdminWrite({ kind: "appearance", operation: "hide", appearanceId: fields.id, expectedVersion: 4 }, "guest-hide", db);
      await confirmAdminWrite({ kind: "appearance", operation: "restore", appearanceId: fields.id, expectedVersion: 5 }, "guest-restore", db);
      for (const [id, sessionLabel, guestInfo] of [["guest-day", "昼", { isHikaruGuest: true, guestNames: [] }], ["guest-night", "夜", { isHikaruGuest: false, guestNames: ["佐藤さん"] }]] as const) {
        await confirmAdminWrite({ kind: "appearance", operation: "create", expectedVersion: null, fields: { ...fields, id, category: "イベント", eventGroupId: "guest-group", eventTitle: "公演", sessionLabel, guestInfo }, source }, id, db);
      }
      await confirmAdminWrite({ kind: "appearance-group", operation: "update", eventGroupId: "guest-group", eventTitle: "新しい公演", targets: [{ appearanceId: "guest-day", expectedVersion: 1, title: "昼の公演" }, { appearanceId: "guest-night", expectedVersion: 1, title: "夜の公演" }] }, "guest-group-title", db);
      const rows = await local.select().from(schema.appearancesTable);
      assert.deepEqual(rows.find(row => row.id === "guest-day")!.guestInfo, { isHikaruGuest: true, guestNames: [] });
      assert.deepEqual(rows.find(row => row.id === "guest-night")!.guestInfo, { isHikaruGuest: false, guestNames: ["佐藤さん"] });
    });
  } finally { await pg.close(); }
});

test("guest normalization and source timestamps do not infer unconfirmed roles", () => {
  assert.ok(sameGuestInfo({ isHikaruGuest: null, guestNames: ["青木さん"] }, { guestNames: ["青木さん"], isHikaruGuest: null }));
  assert.ok(sameGuestInfo(undefined, emptyGuestInfo()));
  assert.equal(sameGuestInfo(emptyGuestInfo(), { isHikaruGuest: false, guestNames: [] }), false);
  assert.deepEqual(normalizeGuestInfo({ isHikaruGuest: null, guestNames: [" 青木さん ", "青木さん", "佐藤さん"] }), { isHikaruGuest: null, guestNames: ["青木さん", "佐藤さん"] });
  assert.throws(() => normalizeGuestInfo({ isHikaruGuest: "false", guestNames: [] }));
  assert.throws(() => normalizeGuestInfo({ isHikaruGuest: null, guestNames: ["飯田 ヒカル"] }));
  assert.throws(() => normalizeGuestInfo({ isHikaruGuest: null, guestNames: [""] }));
  const parsed = parseAdminWriteInput({ kind: "appearance", operation: "update", appearanceId: "test", expectedVersion: 1, fields: { id: "test", title: "番組", category: "配信", startsAtPrecision: "unknown", startsAt: null, startsOn: null, seriesId: null, eventGroupId: null, eventTitle: null, sessionLabel: null, guestInfo: emptyGuestInfo() }, evidenceSources: [{ canonicalUrl: "https://x.com/onsenradio/status/2059487531423641885", sourceName: "x:onsenradio", externalItemId: "2059487531423641885", evidenceKey: "guests", precision: "unknown", publishedAt: null, publishedOn: null }] });
  assert.equal(parsed.kind, "appearance");
  if (parsed.kind !== "appearance" || parsed.operation !== "update") assert.fail();
  assert.equal(parsed.evidenceSources![0].precision, "exact");
  assert.equal(parsed.fields.guestInfo!.isHikaruGuest, null);
  for (const version of [1, 2, 3, 4]) assert.ok(decodeAppearanceRevisionSnapshot(version, { appearance: {} }));
});
