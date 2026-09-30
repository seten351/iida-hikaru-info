import "server-only";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { closeWriterDb, getWriterDb } from "../src/db/client";
import { appearanceProposalsTable, appearanceRevisionsTable, appearancesTable } from "../src/db/schema";
import type { WriterTransaction } from "../src/server/appearances/source-foundation";
import { confirmAdminWrite } from "../src/server/admin/write-service";
import type { AppearanceRevisionSnapshotV4 } from "../src/server/appearances/revisions";

// One-off recovery of the value observed before the 2026-09-30 guest update.
// This is deliberately not a general timestamp editor or a guest backfill.
export const repairTargetId = "saesuzu-event-2026";
export const originalVisibilityChangedAt = "2026-09-02T00:28:46.138395Z";
const roundedVisibilityChangedAt = "2026-09-02T00:28:46.138Z";
const guestProposalId = "prp_224856b6f4f9fd57cafaecf62642bafd";
type Database = ReturnType<typeof getWriterDb>;
type RawAppearance = Record<string, unknown> & {
  id: string; version: number; starts_at: string | null; starts_on: string | null;
  starts_at_precision: string; title: string; category: string; series_id: string | null;
  event_group_id: string | null; event_title: string | null; session_label: string | null;
  guest_info: unknown; visibility_changed_at: string; first_visible_at: string;
};

async function readState(tx: WriterTransaction) {
  const { rows: [state] } = await tx.execute<{
    appearance: RawAppearance; links: unknown[]; originalProof: boolean; rounded: boolean;
  }>(sql`select to_jsonb(a) as appearance,
    a.first_visible_at = ${originalVisibilityChangedAt}::timestamptz
      and a.created_at = ${originalVisibilityChangedAt}::timestamptz as "originalProof",
    a.visibility_changed_at = ${roundedVisibilityChangedAt}::timestamptz as rounded,
    coalesce((select jsonb_agg(to_jsonb(l) order by l.source_id, l.evidence_key)
      from appearance_source_links l where l.appearance_id = a.id), '[]'::jsonb) as links
    from appearances a where a.id = ${repairTargetId}`);
  if (!state) throw new Error("復旧対象が存在しません。");
  return state;
}

function validateState(state: Awaited<ReturnType<typeof readState>>) {
  const a = state.appearance;
  assert.equal(a.version, 3, "復旧対象のversionが変わっています。");
  assert.equal(a.visibility_status, "public");
  assert.equal(a.source_url, "https://x.com/onsenradio/status/2074840747455766865");
  assert.deepEqual(a.guest_info, { isHikaruGuest: true, guestNames: ["中村カンナ"] });
  assert(state.originalProof && state.rounded, "復旧根拠または現在値が一致しません。");
}

function previewFor(state: Awaited<ReturnType<typeof readState>>) {
  validateState(state);
  const change = {
    targetId: repairTargetId,
    expectedVersion: 3,
    before: state.appearance,
    sourceLinks: state.links,
    originalVisibilityChangedAt,
  };
  return { ...change, inputHash: createHash("sha256").update(JSON.stringify(change)).digest("hex") };
}

export async function previewVisibilityPrecisionRepair(db: Database) {
  return db.transaction(async tx => {
    const state = await readState(tx);
    const [revision] = await tx.select().from(appearanceRevisionsTable)
      .where(sql`${appearanceRevisionsTable.appearanceId} = ${repairTargetId} and ${appearanceRevisionsTable.version} = 3`);
    assert.equal(revision?.proposalId, guestProposalId, "直前のゲスト更新履歴が一致しません。");
    return previewFor(state);
  });
}

export async function applyVisibilityPrecisionRepair(db: Database, reviewedHash: string) {
  if (!/^[a-f0-9]{64}$/.test(reviewedHash)) throw new Error("確認済みPreviewのhashが必要です。");
  const key = `repair-saesuzu-visibility-${reviewedHash}`;
  const note = `日時精度復旧: visibility_changed_at ${roundedVisibilityChangedAt} → ${originalVisibilityChangedAt}; 前回のDB取得値とfirst_visible_at・created_atで照合; reviewedHash=${reviewedHash}`;
  return db.transaction(async tx => {
    // Same lock order as Admin write. The whole recovery, including its new
    // proposal/revision, commits or rolls back together.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`admin-write:${key}`}, 0))`);
    await tx.execute(sql`select id from content_management_state where id = 'singleton' for update`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`appearance:${repairTargetId}`}, 0))`);
    await tx.execute(sql`select id from appearances where id = ${repairTargetId} for update`);
    const [prior] = await tx.select().from(appearanceProposalsTable).where(eq(appearanceProposalsTable.idempotencyKey, key));
    if (prior) {
      assert.equal(prior.status, "approved");
      assert.equal(prior.reviewNote, note);
      const { rows: [check] } = await tx.execute<{ restored: boolean }>(sql`select visibility_changed_at = ${originalVisibilityChangedAt}::timestamptz as restored from appearances where id = ${repairTargetId}`);
      assert(check?.restored, "復旧後の日時が変わっています。再試行は停止しました。");
      return { status: "approved", proposalIds: [prior.id], version: 4, replayed: true };
    }
    const state = await readState(tx);
    const preview = previewFor(state);
    assert.equal(preview.inputHash, reviewedHash, "Preview後に対象または情報元が変わっています。");
    const [previousRevision] = await tx.select().from(appearanceRevisionsTable)
      .where(sql`${appearanceRevisionsTable.appearanceId} = ${repairTargetId} and ${appearanceRevisionsTable.version} = 3`);
    assert.equal(previousRevision?.proposalId, guestProposalId);
    const a = state.appearance;
    const input = {
      kind: "appearance", operation: "update", appearanceId: repairTargetId, expectedVersion: 3,
      fields: {
        id: a.id, startsAtPrecision: a.starts_at_precision,
        startsAt: a.starts_at ? new Date(a.starts_at).toISOString() : null, startsOn: a.starts_on,
        title: a.title, category: a.category, seriesId: a.series_id, eventGroupId: a.event_group_id,
        eventTitle: a.event_title, sessionLabel: a.session_label, guestInfo: a.guest_info,
      },
    };
    // Run the existing Admin service in this already locked transaction, so
    // activation, version checking, idempotency, invariants and history remain.
    const scopedDb = { transaction: (callback: (scope: WriterTransaction) => unknown) => callback(tx) } as unknown as Database;
    const result = await confirmAdminWrite(input, key, scopedDb);
    assert.equal(result.status, "approved");
    await tx.update(appearancesTable).set({ visibilityChangedAt: sql`${originalVisibilityChangedAt}::timestamptz` })
      .where(sql`${appearancesTable.id} = ${repairTargetId} and ${appearancesTable.version} = 4`);
    const [revision] = await tx.select().from(appearanceRevisionsTable)
      .where(sql`${appearanceRevisionsTable.appearanceId} = ${repairTargetId} and ${appearanceRevisionsTable.version} = 4`);
    assert.equal(revision.proposalId, result.proposalIds[0]);
    const snapshot = revision.snapshot as AppearanceRevisionSnapshotV4;
    // Only this transaction's newly inserted revision is finalized; past
    // snapshots stay immutable. Keep the exact recovered timestamp in history.
    await tx.update(appearanceRevisionsTable).set({ snapshot: {
      ...snapshot, visibility: { ...snapshot.visibility, visibilityChangedAt: originalVisibilityChangedAt },
    } }).where(sql`${appearanceRevisionsTable.appearanceId} = ${repairTargetId} and ${appearanceRevisionsTable.version} = 4`);
    await tx.update(appearanceProposalsTable).set({ reviewNote: note }).where(eq(appearanceProposalsTable.id, result.proposalIds[0]));
    const after = await readState(tx);
    assert.deepEqual(after.appearance, { ...a, version: 4, updated_at: after.appearance.updated_at, visibility_changed_at: a.first_visible_at });
    assert.deepEqual(after.links, state.links);
    await tx.execute(sql`select phase1c_assert_appearance_invariants(${repairTargetId})`);
    return { ...result, inputHash: reviewedHash, before: a.visibility_changed_at, after: after.appearance.visibility_changed_at };
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 3 || args[0] !== "--apply" || args[1] !== "--reviewed-hash")) throw new Error("引数は --apply --reviewed-hash <hash> のみ使用できます。");
  try {
    const db = getWriterDb();
    console.log(JSON.stringify(args.length ? await applyVisibilityPrecisionRepair(db, args[2]) : await previewVisibilityPrecisionRepair(db), null, 2));
  } finally { await closeWriterDb(); }
}

if (process.argv[1]?.endsWith("/repair-saesuzu-visibility-precision.ts")) {
  main().catch(() => { console.error("日時精度復旧を停止しました。接続・version・Previewの一致を確認してください（接続情報は非表示）。"); process.exitCode = 1; });
}
