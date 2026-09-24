import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { closeWriterDb, getWriterDb } from "../../src/db/client";
import { appearanceProposalsTable, contentManagementStateTable, proposalSourceLinksTable } from "../../src/db/schema";
import { executePatrol } from "../../scripts/patrol/service";
import { createPatrolStore, withPatrolLock } from "../../scripts/patrol/store";
import { candidateId, type PatrolCandidate } from "../../scripts/patrol/types";

async function main() {
  assert.equal(process.env.PATROL_TEST_DATABASE, "1", "Use only an isolated test database.");
  assert.match(process.env.PATROL_TEST_BRANCH_ID ?? "", /^br-/);
  assert.ok(process.env.PATROL_TEST_ENDPOINT);
  assert.equal(new URL(process.env.DATABASE_URL!).hostname.split(".")[0].replace(/-pooler$/, ""), process.env.PATROL_TEST_ENDPOINT);
  const db = getWriterDb();
  const prefix = `patrol-test-${randomUUID()}`;
  const actualStore = createPatrolStore();
  const store = { ...actualStore, pending: async () => (await actualStore.pending()).filter(item => item.candidate.key.startsWith(prefix)) };
  const publicFingerprint = async () => (await db.execute(sql`select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(t) order by id) from appearances t),
    (select jsonb_agg(to_jsonb(t) order by appearance_id, source_id, evidence_key) from appearance_source_links t),
    (select jsonb_agg(to_jsonb(t) order by appearance_id, version) from appearance_revisions t),
    (select jsonb_agg(to_jsonb(t) order by id) from source_items t where exists (select 1 from appearance_source_links l where l.source_id = t.id))
  )::text) as value`)).rows[0].value;
  const before = await publicFingerprint();
  const items: PatrolCandidate[] = Array.from({ length: 12 }, (_, index) => ({
    key: `${prefix}:${index}`, kind: "news", title: `${prefix} 候補${index}`, category: "その他",
    // Reusing an existing public source must not bump its last-updated timestamp.
    sourceUrl: index === 0 ? "https://www.onsen.ag/program/umauma" : `https://news.google.com/rss/articles/${prefix}-${index}`,
    publishedAt: null, note: "隔離DBの補助巡回テスト",
  }));
  const collectors = [{ name: "fixture", collect: async () => items }];
  let report = await withPatrolLock(() => executePatrol({
    dryRun: false, store, collectors,
    notify: async (batch, sent) => { await sent(batch.slice(0, 10)); throw new Error("simulated partial failure"); },
  }));
  // The shared Onsen URL is already registered and should be skipped for news.
  assert.equal(report.notificationCount, 10);
  assert.equal(report.errors.length, 1);
  report = await withPatrolLock(() => executePatrol({
    dryRun: false, store, collectors: [], notify: async (batch, sent) => sent(batch),
  }));
  assert.equal(report.notificationCount, 1);
  const pendingBefore = (await store.pending()).filter(item => item.candidate.key.startsWith(prefix));
  assert.equal(pendingBefore.length, 11);
  assert.ok(pendingBefore.every(item => item.notified));
  report = await executePatrol({ dryRun: false, store, collectors, notify: async batch => { assert.equal(batch.length, 0); } });
  assert.equal(report.notificationCount, 0);
  const id = pendingBefore[0].id;
  const [sourceLink] = await db.select().from(proposalSourceLinksTable).where(eq(proposalSourceLinksTable.proposalId, id));
  assert.equal(sourceLink.isPrimary, false, "Discovery links must not become primary announcements.");
  assert.equal(sourceLink.publishedAtPrecision, null, "Unverified publication dates must not be invented.");
  await store.markRegistered([id]);
  const [resolved] = await db.select().from(appearanceProposalsTable).where(eq(appearanceProposalsTable.id, id));
  assert.equal(resolved.status, "superseded");
  // Repeated discovery must not reactivate a resolved/rejected candidate.
  await store.enqueue(pendingBefore[0].candidate);
  assert.equal((await store.pending()).some(item => item.id === id), false);
  // Candidates may refer to a source already used by public records.
  const sharedSource = { ...items[0], kind: "profile" as const };
  await store.enqueue(sharedSource);
  assert.ok((await store.pending()).some(item => item.id === candidateId(sharedSource)));
  assert.equal(await publicFingerprint(), before);
  await withPatrolLock(async () => {
    await assert.rejects(withPatrolLock(async () => {}), /already running/);
  });
  const [state] = await db.select().from(contentManagementStateTable).where(eq(contentManagementStateTable.id, "singleton"));
  assert.equal(state.contentMode, "admin");
  try {
    await db.update(contentManagementStateTable).set({ contentMode: "bootstrap", adminActivatedAt: null, legacyImportLockedAt: null }).where(eq(contentManagementStateTable.id, "singleton"));
    const blocked = { ...items[1], key: `${prefix}:blocked` };
    await assert.rejects(store.enqueue(blocked), /activation/);
    const rows = await db.select().from(appearanceProposalsTable).where(eq(appearanceProposalsTable.id, candidateId(blocked)));
    assert.equal(rows.length, 0);
  } finally {
    await db.update(contentManagementStateTable).set({ contentMode: state.contentMode, adminActivatedAt: state.adminActivatedAt, legacyImportLockedAt: state.legacyImportLockedAt }).where(eq(contentManagementStateTable.id, "singleton"));
  }
  assert.equal(await publicFingerprint(), before);
  console.log("Patrol DB integration passed: persistence, retry, idempotency, activation, lock, and unchanged public content.");
}

main().catch(error => {
  // Only assertion text is safe to print; driver errors can contain credentials.
  console.error(error instanceof assert.AssertionError ? error.message : "Patrol DB integration failed.");
  process.exitCode = 1;
}).finally(closeWriterDb);
