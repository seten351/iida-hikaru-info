import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "../src/db/schema";
import type { getWriterDb } from "../src/db/client";
import { confirmAdminWrite, validateAdminWritePreview } from "../src/server/admin/write-service";
import type { AdminAppearanceFields, AdminSourceInput } from "../src/server/admin/write-input";

test("guest-only Admin writes retain PostgreSQL microsecond timestamps", async () => {
  const pg = new PGlite();
  const local = drizzle(pg, { schema });
  const db = local as unknown as ReturnType<typeof getWriterDb>;
  const appearanceId = "timestamp-micros";
  const primary: AdminSourceInput = {
    canonicalUrl: "https://example.com/news/primary",
    sourceName: "official:test",
    externalItemId: "primary-item",
    evidenceKey: "default",
    precision: "exact",
    // This is the editor's millisecond view of the stored .678912 value.
    publishedAt: "2026-08-02T03:04:05.678Z",
    publishedOn: null,
  };
  const guestEvidence: AdminSourceInput = {
    canonicalUrl: "https://example.com/news/guest",
    sourceName: "official:test",
    externalItemId: "guest-item",
    evidenceKey: "guests",
    precision: "exact",
    publishedAt: "2026-08-03T04:05:06.789Z",
    publishedOn: null,
  };
  const fields = (title = "マイクロ秒検証") : AdminAppearanceFields => ({
    id: appearanceId,
    title,
    category: "配信",
    startsAtPrecision: "exact",
    // This is the editor's millisecond view of the stored .123456 value.
    startsAt: "2026-10-10T01:02:03.123Z",
    startsOn: null,
    seriesId: null,
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
  });
  const rawTimestamps = async () => {
    const result = await pg.query(`
      select
        to_jsonb(a)->>'starts_at' as "startsAt",
        to_jsonb(a)->>'published_at' as "publishedAt",
        to_jsonb(a)->>'collected_at' as "collectedAt",
        to_jsonb(a)->>'created_at' as "createdAt",
        to_jsonb(a)->>'first_visible_at' as "firstVisibleAt",
        to_jsonb(a)->>'visibility_changed_at' as "visibilityChangedAt",
        to_jsonb(a)->>'visibility_status' as "visibilityStatus",
        to_jsonb(l)->>'published_at' as "primaryLinkPublishedAt",
        to_jsonb(l)->>'collected_at' as "primaryLinkCollectedAt",
        to_jsonb(l)->>'created_at' as "primaryLinkCreatedAt",
        to_jsonb(l)->>'updated_at' as "primaryLinkUpdatedAt",
        to_jsonb(s)->>'first_collected_at' as "sourceFirstCollectedAt",
        to_jsonb(s)->>'last_collected_at' as "sourceLastCollectedAt",
        to_jsonb(s)->>'created_at' as "sourceCreatedAt",
        to_jsonb(s)->>'updated_at' as "sourceUpdatedAt"
      from appearances a
      join appearance_source_links l on l.appearance_id = a.id and l.active and l.is_primary
      join source_items s on s.id = l.source_id
      where a.id = '${appearanceId}'
    `);
    assert.equal(result.rows.length, 1);
    return result.rows[0] as Record<string, string>;
  };
  const counts = async () => {
    const result = await pg.query(`
      select
        (select count(*) from appearance_proposals where appearance_id = '${appearanceId}') as proposals,
        (select count(*) from appearance_revisions where appearance_id = '${appearanceId}') as revisions,
        (select count(*) from appearance_source_links where appearance_id = '${appearanceId}') as links,
        (select count(*) from source_items) as sources
    `);
    return result.rows[0] as Record<string, number | string>;
  };
  const version = async () => {
    const result = await pg.query(`select version from appearances where id = '${appearanceId}'`);
    return Number((result.rows[0] as { version: number | string }).version);
  };
  const withoutVisibility = (timestamps: Record<string, string>) => Object.fromEntries(
    Object.entries(timestamps).filter(([key]) => !["visibilityStatus", "visibilityChangedAt"].includes(key)),
  );

  try {
    for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
      if (file.startsWith("0006_")) {
        await pg.exec("update appearance_backfill_checkpoints set completed_at=now(), dual_write_confirmed_at=now() where id='phase-1b'");
      }
      await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    }
    await pg.exec("update content_management_state set content_mode='admin', admin_activated_at=now(), legacy_import_locked_at=now() where id='singleton'");
    await pg.exec(`
      insert into source_items(id, canonical_url, source_type, first_collected_at, last_collected_at, created_at, updated_at)
      values ('timestamp-primary-source', 'https://example.com/news/primary', 'web',
        '2026-01-01 01:02:03.112233+00', '2026-01-01 01:02:03.223344+00',
        '2026-01-01 01:02:03.334455+00', '2026-01-01 01:02:03.445566+00');
      insert into source_identities(id, source_id, source_name, external_item_id, is_canonical, created_at)
      values ('timestamp-primary-identity', 'timestamp-primary-source', 'official:test', 'primary-item', true, '2026-01-01 01:02:03.556677+00');
      insert into appearances(
        id, starts_at, starts_on, starts_at_precision, title, category, guest_info,
        source_url, source_name, source_item_id, published_at, published_on, published_at_precision,
        visibility_status, first_visible_at, visibility_changed_at, version, collected_at, created_at, updated_at
      ) values (
        '${appearanceId}', '2026-10-10 01:02:03.123456+00', null, 'exact', 'マイクロ秒検証', '配信',
        '{"isHikaruGuest":null,"guestNames":[]}'::jsonb,
        'https://example.com/news/primary', 'official:test', 'primary-item',
        '2026-08-02 03:04:05.678912+00', null, 'exact', 'public',
        '2026-01-01 01:02:03.345678+00', '2026-01-01 01:02:03.234567+00', 1,
        '2026-01-01 01:02:03.567891+00', '2026-01-01 01:02:03.456789+00', '2026-01-01 01:02:03.778899+00'
      );
      insert into appearance_source_links(
        appearance_id, source_id, source_identity_id, evidence_key, active, is_primary,
        published_at, published_on, published_at_precision, collected_at, created_at, updated_at
      ) values (
        '${appearanceId}', 'timestamp-primary-source', 'timestamp-primary-identity', 'default', true, true,
        '2026-08-02 03:04:05.678912+00', null, 'exact',
        '2026-01-01 01:02:03.889912+00', '2026-01-01 01:02:03.991234+00', '2026-01-01 01:02:03.102345+00'
      );
      insert into appearance_revisions(appearance_id, version, operation, snapshot_schema_version, snapshot, actor_type, created_at)
      values ('${appearanceId}', 1, 'create', 1, '{}'::jsonb, 'admin', '2026-01-01 01:02:03.213456+00');
    `);

    const before = await rawTimestamps();
    for (const [key, microseconds] of Object.entries({
      startsAt: "123456", publishedAt: "678912", collectedAt: "567891", createdAt: "456789",
      firstVisibleAt: "345678", visibilityChangedAt: "234567", primaryLinkPublishedAt: "678912",
      primaryLinkCollectedAt: "889912", primaryLinkCreatedAt: "991234", primaryLinkUpdatedAt: "102345",
      sourceFirstCollectedAt: "112233", sourceLastCollectedAt: "223344", sourceCreatedAt: "334455", sourceUpdatedAt: "445566",
    })) assert.match(before[key], new RegExp(`\\.${microseconds}`));

    const guestUpdate = {
      kind: "appearance" as const,
      operation: "update" as const,
      appearanceId,
      expectedVersion: 1,
      fields: { ...fields(), guestInfo: { isHikaruGuest: true, guestNames: ["青木さん"] } },
      evidenceSources: [primary, guestEvidence],
    };
    const beforePreview = await counts();
    await validateAdminWritePreview(guestUpdate, db);
    assert.deepEqual(await rawTimestamps(), before);
    assert.deepEqual(await counts(), beforePreview);

    assert.equal((await confirmAdminWrite(guestUpdate, "timestamp-guest", db)).status, "approved");
    const afterGuest = await rawTimestamps();
    assert.deepEqual(afterGuest, before);
    assert.deepEqual(await counts(), { proposals: 1, revisions: 2, links: 2, sources: 2 });
    assert.equal(await version(), 2);

    const afterFirstApply = await counts();
    assert.equal((await confirmAdminWrite(guestUpdate, "timestamp-guest", db)).replayed, true);
    assert.deepEqual(await counts(), afterFirstApply);
    assert.deepEqual(await rawTimestamps(), before);

    const stale = await confirmAdminWrite({ ...guestUpdate, fields: fields("古い更新") }, "timestamp-stale", db);
    assert.equal(stale.status, "superseded");
    assert.equal(stale.replayed, false);
    assert.deepEqual(await counts(), { proposals: 2, revisions: 2, links: 2, sources: 2 });
    assert.deepEqual(await rawTimestamps(), before);

    assert.equal((await confirmAdminWrite({
      kind: "appearance", operation: "update", appearanceId, expectedVersion: 2,
      fields: { ...fields("題名だけ変更"), guestInfo: { isHikaruGuest: true, guestNames: ["青木さん"] } },
    }, "timestamp-title", db)).status, "approved");
    assert.deepEqual(await rawTimestamps(), before);
    assert.equal(await version(), 3);

    const beforeStartEdit = await rawTimestamps();
    assert.equal((await confirmAdminWrite({
      kind: "appearance", operation: "update", appearanceId, expectedVersion: 3,
      fields: { ...fields("題名だけ変更"), startsAt: "2026-10-10T11:22:33.987Z", guestInfo: { isHikaruGuest: true, guestNames: ["青木さん"] } },
    }, "timestamp-start", db)).status, "approved");
    const afterStartEdit = await rawTimestamps();
    const { startsAt: beforeStart, ...otherBeforeStart } = beforeStartEdit;
    const { startsAt: afterStart, ...otherAfterStart } = afterStartEdit;
    assert.notEqual(afterStart, beforeStart);
    assert.deepEqual(otherAfterStart, otherBeforeStart);
    assert.equal(await version(), 4);

    const beforeHide = await rawTimestamps();
    assert.equal((await confirmAdminWrite({ kind: "appearance", operation: "hide", appearanceId, expectedVersion: 4 }, "timestamp-hide", db)).status, "approved");
    const hidden = await rawTimestamps();
    assert.equal(hidden.visibilityStatus, "hidden");
    assert.notEqual(hidden.visibilityChangedAt, beforeHide.visibilityChangedAt);
    assert.deepEqual(withoutVisibility(hidden), withoutVisibility(beforeHide));
    assert.equal(await version(), 5);

    assert.equal((await confirmAdminWrite({ kind: "appearance", operation: "restore", appearanceId, expectedVersion: 5 }, "timestamp-restore", db)).status, "approved");
    const restored = await rawTimestamps();
    assert.equal(restored.visibilityStatus, "public");
    assert.notEqual(restored.visibilityChangedAt, before.visibilityChangedAt);
    assert.deepEqual(withoutVisibility(restored), withoutVisibility(hidden));
    assert.equal(await version(), 6);
  } finally {
    await pg.close();
  }
});
