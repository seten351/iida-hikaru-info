import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";

// Production is only read via an explicit READ ONLY transaction. The candidate
// insertion below accepts PGlite only; there is deliberately no production apply CLI.
export const observationTarget = "bang-dream-our-notes";
const chainTargets = [observationTarget, "seifuku-kanojo-3", "sugar-lies-game"];
const correctionTargets = ["hatsuboshi-housoubu-episode-106", "small-childhood-friend-night", "yuri-relation-game-27"];
const copiedTables = ["appearance_series", "source_items", "source_identities", "appearances", "appearance_proposals", "appearance_source_links", "proposal_source_links", "appearance_revisions"] as const;
const protectedTables = ["appearance_backfill_checkpoints", "content_management_state", ...copiedTables, "appearance_series_proposals", "appearance_series_revisions", "deadlines", "deadline_appearance_links", "deadline_source_links", "deadline_proposals", "deadline_revisions"];
type Row = Record<string, unknown>;
type Snapshot = Record<typeof copiedTables[number], Row[]>;

export function integrityHash(value: unknown): string {
  const canonical = (item: unknown): string => {
    if (Array.isArray(item)) return `[${item.map(canonical).join(",")}]`;
    if (item && typeof item === "object") return `{${Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
    return JSON.stringify(item);
  };
  return createHash("sha256").update(canonical(value)).digest("hex");
}

const localSnapshotSql = `select jsonb_build_object(${copiedTables.map(table => `'${table}', (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) from ${table} t)`).join(", ")}) as snapshot`;
export async function readIsolatedSnapshot(pg: PGlite): Promise<Snapshot> {
  assert(pg instanceof PGlite, "隔離PGlite以外のDBは使用できません。");
  return (await pg.query<{ snapshot: Snapshot }>(localSnapshotSql)).rows[0].snapshot;
}

type LocalReader = Pick<PGlite, "query">;
async function readObservationState(pg: LocalReader) {
  const { rows: [state] } = await pg.query<{ appearance: Row; series: Row | null; links: Row[]; revisions: Row[]; proposals: Row[] }>(`
    select to_jsonb(a) as appearance,
      (select to_jsonb(s) from appearance_series s where s.id=a.series_id) as series,
      coalesce((select jsonb_agg(jsonb_build_object('link',to_jsonb(l),'source',to_jsonb(s),'identity',to_jsonb(i)) order by l.source_id,l.evidence_key)
        from appearance_source_links l join source_items s on s.id=l.source_id
        left join source_identities i on i.id=l.source_identity_id and i.source_id=l.source_id where l.appearance_id=a.id),'[]'::jsonb) as links,
      coalesce((select jsonb_agg(to_jsonb(r) order by r.version) from appearance_revisions r where r.appearance_id=a.id),'[]'::jsonb) as revisions,
      coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from appearance_proposals p where p.appearance_id=a.id),'[]'::jsonb) as proposals
    from appearances a where a.id=$1`, [observationTarget]);
  assert(state, "観測対象がありません。");
  return state;
}
type ObservationState = Awaited<ReturnType<typeof readObservationState>>;

function validateObservationState(state: ObservationState) {
  assert.equal(state.appearance.version, 3, "現在のversion 3だけを観測できます。");
  assert.deepEqual(state.revisions.map(r => r.version), [1, 2], "既存revisionが想定と異なります。");
  assert.equal(state.appearance.title, "『バンドリ！ アワーノーツ』（沢海奏多 役）");
  assert.equal(state.appearance.visibility_status, "public");
  for (const r of state.revisions) {
    const p = state.proposals.find(p => p.id === r.proposal_id);
    assert(p && p.status === "approved", "既存approved履歴がありません。");
    assert.equal(p.expected_appearance_version, r.version === 1 ? null : 1);
  }
  assert.equal(state.proposals.length, 2, "未解明のproposalがあるため停止します。");
  const primary = state.links.filter(row => (row.link as Row).active && (row.link as Row).is_primary);
  assert.equal(primary.length, 1);
  for (const item of state.links) {
    const link = item.link as Row, source = item.source as Row, identity = item.identity as Row | null;
    assert(identity && identity.id === link.source_identity_id && identity.source_id === source.id, "情報元の対応関係が不正です。");
  }
  const link = primary[0].link as Row, source = primary[0].source as Row, identity = primary[0].identity as Row;
  assert.equal(state.appearance.source_url, source.canonical_url);
  assert.equal(state.appearance.source_name, identity.source_name);
  assert.equal(state.appearance.source_item_id, identity.external_item_id);
  for (const column of ["published_at", "published_on", "published_at_precision"]) assert.equal(state.appearance[column], link[column]);
}

function observationPreview(state: ObservationState) {
  validateObservationState(state);
  const content = { kind: "late-current-version-observation", targetId: observationTarget, expectedVersion: 3, state };
  return { ...content, inputHash: integrityHash(content) };
}

export async function previewIsolatedObservation(pg: PGlite, targetId = observationTarget) {
  assert(pg instanceof PGlite, "隔離PGlite以外のDBは使用できません。");
  assert.equal(targetId, observationTarget, "過去の欠番revisionは復元しません。");
  return observationPreview(await readObservationState(pg));
}

function observedSnapshot(state: ObservationState, reviewedHash: string) {
  const a = state.appearance;
  // to_jsonb keeps Postgres timestamp strings, including all six fractional
  // digits. Never round-trip an unrelated timestamp through JavaScript Date.
  const appearanceKeys = { id: "id", title: "title", category: "category", seriesId: "series_id", startsAtPrecision: "starts_at_precision", startsAt: "starts_at", startsOn: "starts_on", createdAt: "created_at", updatedAt: "updated_at", collectedAt: "collected_at", publishedAt: "published_at", publishedOn: "published_on", publishedAtPrecision: "published_at_precision", eventGroupId: "event_group_id", eventTitle: "event_title", sessionLabel: "session_label", guestInfo: "guest_info" };
  const linkKeys = { sourceId: "source_id", sourceIdentityId: "source_identity_id", evidenceKey: "evidence_key", active: "active", isPrimary: "is_primary", publishedAt: "published_at", publishedOn: "published_on", publishedAtPrecision: "published_at_precision", collectedAt: "collected_at", createdAt: "created_at", updatedAt: "updated_at" };
  const project = (row: Row, keys: Record<string, string>) => Object.fromEntries(Object.entries(keys).map(([key, column]) => [key, row[column]]));
  return {
    appearance: project(a, appearanceKeys),
    visibility: { status: a.visibility_status, firstVisibleAt: a.first_visible_at, visibilityChangedAt: a.visibility_changed_at, version: a.version },
    series: state.series ? { id: state.series.id, displayName: state.series.display_name } : null,
    sourceLinks: state.links.map(item => {
      const source = item.source as Row, identity = item.identity as Row;
      return { ...project(item.link as Row, linkKeys), sourceType: source.source_type, canonicalUrl: source.canonical_url, sourceName: identity.source_name, externalItemId: identity.external_item_id };
    }),
    repairMetadata: {
      kind: "late-current-version-observation", reviewedHash,
      historicalOperationAt: null, historicalProposalId: null,
      note: "現在version 3の生DB値を後日観測。欠落した過去の操作時刻・承認は復元していない。revision.created_atは観測記録の作成時刻。",
    },
  };
}

// This API is deliberately confined to an in-memory PGlite instance. No Neon
// writer, production connection, --apply flag or schema migration is provided.
export async function applyIsolatedObservation(pg: PGlite, reviewedHash: string) {
  assert(pg instanceof PGlite, "隔離PGlite以外のDBは使用できません。");
  assert.match(reviewedHash, /^[a-f0-9]{64}$/);
  return pg.transaction(async tx => {
    await tx.query("select id from appearances where id=$1 for update", [observationTarget]);
    const state = await readObservationState(tx);
    const prior = state.revisions.find(r => r.version === 3);
    if (prior) {
      assert.equal(prior.actor_type, "integrity-repair-observation");
      assert.equal(prior.proposal_id, null);
      assert.equal(prior.snapshot_schema_version, 4);
      assert.equal((prior.snapshot as { repairMetadata: { reviewedHash: string } }).repairMetadata.reviewedHash, reviewedHash);
      const before = { ...state, revisions: state.revisions.filter(r => r.version !== 3) };
      assert.equal(observationPreview(before).inputHash, reviewedHash, "観測後に元データが変化しています。");
      assert.deepEqual(prior.snapshot, observedSnapshot(before, reviewedHash));
      return { replayed: true, version: 3 };
    }
    const preview = observationPreview(state);
    assert.equal(preview.inputHash, reviewedHash, "Preview後に値・履歴・情報元が変化しています。");
    await tx.query(`insert into appearance_revisions(appearance_id,version,operation,snapshot_schema_version,snapshot,proposal_id,actor_type)
      values($1,3,'update',4,$2::jsonb,null,'integrity-repair-observation')`, [observationTarget, JSON.stringify(observedSnapshot(state, reviewedHash))]);
    await tx.query("select phase1c_assert_appearance_invariants($1)", [observationTarget]);
    return { replayed: false, version: 3 };
  });
}

async function main() {
  assert.equal(process.argv.length, 2, "この検証CLIに本番apply引数はありません。");
  const databaseUrl = process.env.DATABASE_URL;
  assert(databaseUrl, "DATABASE_URLが必要です。");
  const audit = JSON.parse(await readFile("docs/guest-audit/2026-10-01.json", "utf8"));
  const knownSources: string[] = audit.verification.preExistingIssues.canonicalIdentity;
  const reader = neon(databaseUrl);
  const files = (await readdir("drizzle")).filter(f => f.endsWith(".sql")).sort();
  const tableFingerprintsSql = `select jsonb_build_object(${protectedTables.map(t => `'${t}',(select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text),''))) from ${t} r)`).join(",")}) as fingerprints`;
  const [settings, history, fingerprints, scoped, integrity] = await reader.transaction([
    reader.query("select current_setting('TimeZone') as timezone,current_setting('transaction_read_only') as read_only,now()::text as captured_at"),
    reader.query("select hash from drizzle.__drizzle_migrations order by created_at"),
    reader.query(tableFingerprintsSql),
    reader.query(`with selected_appearances as (select * from appearances where id=any($1::text[])),
      selected_proposals as (select * from appearance_proposals where appearance_id=any($1::text[]) or id in (select proposal_id from proposal_source_links where source_id=any($2::text[]))),
      selected_links as (select * from appearance_source_links where appearance_id=any($1::text[])),
      selected_proposal_links as (select * from proposal_source_links where proposal_id in(select id from selected_proposals)),
      selected_sources as (select * from source_items where id=any($2::text[]) or id in(select source_id from selected_links union select source_id from selected_proposal_links)),
      selected_identities as (select * from source_identities where id in(select source_identity_id from selected_links union select source_identity_id from selected_proposal_links))
      select jsonb_build_object(
        'appearances',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from selected_appearances t),
        'appearance_series',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from appearance_series t where id in(select series_id from selected_appearances union select series_id from selected_proposals)),
        'appearance_proposals',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from selected_proposals t),
        'appearance_source_links',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from selected_links t),
        'proposal_source_links',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from selected_proposal_links t),
        'source_items',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from selected_sources t),
        'source_identities',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from selected_identities t),
        'appearance_revisions',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from appearance_revisions t where appearance_id=any($1::text[]))) as snapshot`, [chainTargets, knownSources]),
    reader.query(`select
      (select count(*)::int from appearances a where (select count(*) from appearance_source_links l where l.appearance_id=a.id and l.active and l.is_primary)<>1) as bad_primary,
      (select count(*)::int from appearances a join appearance_source_links l on l.appearance_id=a.id and l.active and l.is_primary join source_items s on s.id=l.source_id join source_identities i on i.id=l.source_identity_id
        where a.source_url is distinct from s.canonical_url or a.source_name is distinct from i.source_name or a.source_item_id is distinct from i.external_item_id or a.published_at is distinct from l.published_at or a.published_on is distinct from l.published_on or a.published_at_precision is distinct from l.published_at_precision) as bad_primary_mirror,
      (select count(*)::int from appearance_source_links l left join source_identities i on i.id=l.source_identity_id and i.source_id=l.source_id where i.id is null) as bad_appearance_identity_mapping,
      (select count(*)::int from appearances where
        (starts_at_precision='exact' and (starts_at is null or starts_on is not null)) or (starts_at_precision='date' and (starts_at is not null or starts_on is null)) or (starts_at_precision='unknown' and (starts_at is not null or starts_on is not null))
        or (published_at_precision='exact' and (published_at is null or published_on is not null)) or (published_at_precision='date' and (published_at is not null or published_on is null)) or (published_at_precision='unknown' and (published_at is not null or published_on is not null))) as bad_appearance_precision,
      (select count(*)::int from (select event_group_id from appearances where event_group_id is not null group by event_group_id having count(distinct event_title)<>1 or count(distinct category)<>1 or count(distinct coalesce(series_id,'<null>'))<>1 or count(*)<>count(distinct session_label)) v) as bad_event_group,
      (select count(*)::int from appearance_series s where (select count(*) from appearance_series_revisions r where r.series_id=s.id)<>s.version or not exists(select 1 from appearance_series_revisions r where r.series_id=s.id and r.version=1 and r.snapshot_schema_version>0) or (select max(version) from appearance_series_revisions r where r.series_id=s.id)<>s.version) as bad_series_chain,
      (select count(*)::int from deadlines d where (select count(*) from deadline_source_links l where l.deadline_id=d.id and l.is_primary)<>1) as bad_deadline_primary,
      (select count(*)::int from deadlines d where (select count(*) from deadline_revisions r where r.deadline_id=d.id)<>d.version or not exists(select 1 from deadline_revisions r where r.deadline_id=d.id and r.version=1) or (select max(version) from deadline_revisions r where r.deadline_id=d.id)<>d.version) as bad_deadline_chain,
      (select count(*)::int from deadline_source_links l left join source_identities i on i.id=l.source_identity_id and i.source_id=l.source_id where i.id is null) as bad_deadline_identity_mapping,
      (select coalesce(jsonb_agg(s.id order by s.id),'[]'::jsonb) from source_items s where (select count(*) from source_identities i where i.source_id=s.id and i.is_canonical)<>1) as canonical_issues,
      (select coalesce(jsonb_agg(a.id order by a.id),'[]'::jsonb) from appearances a where (select count(*) from appearance_revisions r where r.appearance_id=a.id)<>a.version or not exists(select 1 from appearance_revisions r where r.appearance_id=a.id and r.version=1 and r.snapshot_schema_version>0) or (select max(version) from appearance_revisions r where r.appearance_id=a.id)<>a.version) as chain_issues`),
  ], { readOnly: true, isolationLevel: "RepeatableRead" });
  assert.equal(settings[0].read_only, "on");
  for (const [key, value] of Object.entries(integrity[0])) if (key.startsWith("bad_")) assert.equal(value, 0, `${key}: 新たな不整合があります。`);
  assert.deepEqual(integrity[0].canonical_issues, [...knownSources].sort());
  assert.deepEqual(integrity[0].chain_issues, [...chainTargets].sort());
  assert.equal(fingerprints[0].fingerprints.appearances.count, 170);
  assert.equal(fingerprints[0].fingerprints.deadlines.count, 8);
  assert.equal(history.length, files.length, "migration数が想定と異なります。");
  for (const [i, file] of files.entries()) assert.equal(history[i].hash, createHash("sha256").update(await readFile(`drizzle/${file}`, "utf8")).digest("hex"), `migration不一致: ${file}`);
  const source = scoped[0].snapshot as Snapshot;
  for (const id of knownSources) {
    assert(source.source_items.some(s => s.id === id));
    assert.equal(source.source_identities.filter(i => i.source_id === id).length, 0);
    assert.equal(source.appearance_source_links.filter(l => l.source_id === id).length, 0);
    const evidence = source.proposal_source_links.filter(l => l.source_id === id);
    assert(evidence.length > 0);
    for (const link of evidence) {
      const candidate = (link.review_metadata as { candidate: Row }).candidate;
      assert.equal(candidate.kind, "news");
      assert.equal(candidate.sourceUrl, source.source_items.find(s => s.id === id)?.canonical_url);
      assert.equal(candidate.sourceName, undefined);
      assert.equal(candidate.externalItemId, undefined);
      assert.equal(link.source_identity_id, null);
    }
  }
  const pg = new PGlite();
  try {
    await pg.query("select set_config('TimeZone',$1,false)", [settings[0].timezone]);
    for (const file of files) {
      if (file.startsWith("0006_")) await pg.exec("update appearance_backfill_checkpoints set completed_at=now(),dual_write_confirmed_at=now() where id='phase-1b'");
      await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    }
    await pg.transaction(async tx => {
      await tx.exec(`truncate ${copiedTables.join(",")} cascade`);
      for (const table of copiedTables) if (source[table]?.length) await tx.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(source[table])]);
    });
    const before = await readIsolatedSnapshot(pg);
    assert.equal(integrityHash(before), integrityHash(source), "隔離コピーの日時・履歴・対応関係が一致しません。");
    const preview = await previewIsolatedObservation(pg);
    assert.deepEqual(await readIsolatedSnapshot(pg), before, "Previewは読み取り専用です。");
    await assert.rejects(applyIsolatedObservation(pg, "0".repeat(64)));
    await pg.exec("create function reject_observation() returns trigger language plpgsql as $$ begin raise exception 'isolated audit failure'; end; $$; create trigger reject_observation before insert on appearance_revisions for each row execute function reject_observation();");
    await assert.rejects(applyIsolatedObservation(pg, preview.inputHash));
    assert.deepEqual(await readIsolatedSnapshot(pg), before, "失敗したトランザクションは全体をロールバックします。");
    await pg.exec("drop trigger reject_observation on appearance_revisions; drop function reject_observation();");
    await applyIsolatedObservation(pg, preview.inputHash);
    const after = await readIsolatedSnapshot(pg);
    for (const table of copiedTables) {
      if (table !== "appearance_revisions") assert.deepEqual(after[table], before[table]);
      else {
        assert.equal(after[table].length, before[table].length + 1);
        for (const old of before[table]) assert(after[table].some(r => integrityHash(r) === integrityHash(old)), "過去revisionは不変です。");
      }
    }
    assert.equal((await applyIsolatedObservation(pg, preview.inputHash)).replayed, true);
    assert.deepEqual(await readIsolatedSnapshot(pg), after);
    for (const id of chainTargets.slice(1)) await assert.rejects(previewIsolatedObservation(pg, id));
    const [remoteAfter, corrections] = await reader.transaction([
      reader.query(tableFingerprintsSql),
      reader.query(`select to_jsonb(a) as appearance, (select jsonb_agg(r.version order by r.version) from appearance_revisions r where r.appearance_id=a.id) as revision_versions,
        (select jsonb_agg(jsonb_build_object('proposalId',r.proposal_id,'snapshot',r.snapshot) order by r.version desc) from appearance_revisions r where r.appearance_id=a.id and r.version=a.version) as latest_revision
        from appearances a where id=any($1::text[]) order by id`, [correctionTargets]),
    ], { readOnly: true, isolationLevel: "RepeatableRead" });
    assert.deepEqual(remoteAfter[0].fingerprints, fingerprints[0].fingerprints, "調査中に本番値が変化しました。");
    console.log(JSON.stringify({ mode: "production-read-only/isolated-PGlite-only", capturedAt: settings[0].captured_at, migrations: files.length,
      copiedCounts: Object.fromEntries(copiedTables.map(t => [t, source[t].length])), isolatedFingerprint: integrityHash(before),
      sourceIdentityUnresolved: knownSources, historicalGapsUnresolved: chainTargets.slice(1),
      observationCandidate: { targetId: observationTarget, version: 3, inputHash: preview.inputHash, actorType: "integrity-repair-observation", proposalId: null, productionApplied: false },
      checks: { exactCopy: true, previewReadOnly: true, wrongHashRejected: true, lateFailureRolledBack: true, oldHistoryPreserved: true, sourceLinksAndMicrosecondsPreserved: true, replayIdempotent: true, historicalBackfillRejected: true, allProductionFingerprintsUnchanged: true },
      productionFingerprints: fingerprints[0].fingerprints, integrity: integrity[0],
      corrections: corrections.map(c => ({ id: c.appearance.id, version: c.appearance.version, title: c.appearance.title, startsAt: c.appearance.starts_at, startsOn: c.appearance.starts_on, primary: c.appearance.source_url, revisionVersions: c.revision_versions, latestProposalId: c.latest_revision[0].proposalId })),
      snapshotPersisted: false, productionApplyAvailable: false }, null, 2));
  } finally { await pg.close(); }
}

if (process.argv[1]?.endsWith("/verify-known-integrity-isolated.ts")) {
  main().catch(() => { console.error("既知不整合の読み取り・隔離検証を停止しました。本番変更は行っていません。接続、migration、対象値とPreviewを確認してください。"); process.exitCode = 1; });
}
