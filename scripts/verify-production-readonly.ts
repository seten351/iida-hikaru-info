import assert from "node:assert/strict";

import { sql } from "drizzle-orm";

import { getDb } from "../src/db/client";

async function main() {
  const result = await getDb().execute<{
    migrations: number;
    appearances: number;
    cards: number;
    series: number;
    sources: number;
    source_identities: number;
    source_links: number;
    appearance_revisions: number;
    series_revisions: number;
    content_fingerprint: string;
    bad_content_state: number;
    bad_primary: number;
    bad_canonical_identity: number;
    bad_event_group: number;
    bad_appearance_revision_chain: number;
    bad_series_revision_chain: number;
    bad_start_precision: number;
    bad_publication_precision: number;
  }>(sql`
    select
      (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
      (select count(*)::int from appearances) as appearances,
      (select count(distinct coalesce(event_group_id, 'appearance:' || id))::int from appearances) as cards,
      (select count(*)::int from appearance_series) as series,
      (select count(*)::int from source_items) as sources,
      (select count(*)::int from source_identities) as source_identities,
      (select count(*)::int from appearance_source_links) as source_links,
      (select count(*)::int from appearance_revisions) as appearance_revisions,
      (select count(*)::int from appearance_series_revisions) as series_revisions,
      md5(jsonb_build_array(
        (select jsonb_agg(to_jsonb(t) order by id) from appearances t),
        (select jsonb_agg(to_jsonb(t) order by id) from appearance_series t),
        (select jsonb_agg(to_jsonb(t) order by id) from source_items t),
        (select jsonb_agg(to_jsonb(t) order by id) from source_identities t),
        (select jsonb_agg(to_jsonb(t) order by appearance_id, source_id, evidence_key) from appearance_source_links t),
        (select jsonb_agg(to_jsonb(t) order by appearance_id, version) from appearance_revisions t),
        (select jsonb_agg(to_jsonb(t) order by series_id, version) from appearance_series_revisions t),
        (select to_jsonb(t) from content_management_state t where id = 'singleton')
      )::text) as content_fingerprint,
      (select count(*)::int from content_management_state where id <> 'singleton'
        or content_mode <> 'admin' or admin_activated_at is null or legacy_import_locked_at is null
        or admin_activated_at <> legacy_import_locked_at) as bad_content_state,
      (select count(*)::int from appearances a where
        (select count(*) from appearance_source_links l
          where l.appearance_id = a.id and l.active and l.is_primary) <> 1) as bad_primary,
      (select count(*)::int from source_items s where
        (select count(*) from source_identities i where i.source_id = s.id and i.is_canonical) <> 1) as bad_canonical_identity,
      (select count(*)::int from (
        select event_group_id from appearances where event_group_id is not null group by event_group_id
        having count(distinct event_title) <> 1 or count(distinct category) <> 1
          or count(distinct coalesce(series_id, '<null>')) <> 1 or count(*) <> count(distinct session_label)
      ) violations) as bad_event_group,
      (select count(*)::int from appearances a where
        not exists (select 1 from appearance_revisions r where r.appearance_id = a.id and r.version = 1 and r.snapshot_schema_version > 0)
        or not exists (select 1 from appearance_revisions r where r.appearance_id = a.id and r.version = a.version)
        or (select count(*) from appearance_revisions r where r.appearance_id = a.id) <> a.version
        or (select max(version) from appearance_revisions r where r.appearance_id = a.id) <> a.version) as bad_appearance_revision_chain,
      (select count(*)::int from appearance_series s where
        not exists (select 1 from appearance_series_revisions r where r.series_id = s.id and r.version = 1 and r.snapshot_schema_version > 0)
        or not exists (select 1 from appearance_series_revisions r where r.series_id = s.id and r.version = s.version)
        or (select count(*) from appearance_series_revisions r where r.series_id = s.id) <> s.version
        or (select max(version) from appearance_series_revisions r where r.series_id = s.id) <> s.version) as bad_series_revision_chain,
      (select count(*)::int from appearances where
        (starts_at_precision = 'exact' and (starts_at is null or starts_on is not null))
        or (starts_at_precision = 'date' and (starts_at is not null or starts_on is null))
        or (starts_at_precision = 'unknown' and (starts_at is not null or starts_on is not null))) as bad_start_precision,
      ((select count(*) from appearances where
          (published_at_precision = 'exact' and (published_at is null or published_on is not null))
          or (published_at_precision = 'date' and (published_at is not null or published_on is null))
          or (published_at_precision = 'unknown' and (published_at is not null or published_on is not null)))
        + (select count(*) from appearance_source_links where
          (published_at_precision = 'exact' and (published_at is null or published_on is not null))
          or (published_at_precision = 'date' and (published_at is not null or published_on is null))
          or (published_at_precision = 'unknown' and (published_at is not null or published_on is not null))))::int as bad_publication_precision
  `);
  const baseline = result.rows[0];
  assert.ok(baseline, "Production read-only baseline was empty.");
  if (Number(baseline.bad_appearance_revision_chain) !== 0) {
    const invalidRevisions = await getDb().execute<{
      id: string;
      version: number;
      revision_count: number;
      max_revision: number | null;
      has_initial_revision: boolean;
      has_current_revision: boolean;
      snapshot_schema_versions: number[];
      actor_types: string[];
    }>(sql`
      select a.id, a.version, count(r.version)::int as revision_count, max(r.version)::int as max_revision,
        bool_or(r.version = 1 and r.snapshot_schema_version > 0) as has_initial_revision,
        bool_or(r.version = a.version) as has_current_revision,
        array_agg(r.snapshot_schema_version order by r.version) as snapshot_schema_versions,
        array_agg(r.actor_type::text order by r.version) as actor_types
      from appearances a left join appearance_revisions r on r.appearance_id = a.id
      group by a.id, a.version
      having not bool_or(r.version = 1 and r.snapshot_schema_version > 0)
        or not bool_or(r.version = a.version) or count(r.version) <> a.version or max(r.version) <> a.version
      order by a.id
    `);
    console.error(JSON.stringify({ invalidRevisions: invalidRevisions.rows }));
  }
  assert.ok(Number(baseline.migrations) >= 11, "Expected migrations through 0010.");
  for (const [name, value] of Object.entries(baseline)) {
    if (name.startsWith("bad_")) assert.equal(Number(value), 0, `${name} must be zero.`);
  }
  console.log(JSON.stringify(baseline));
}

void main();
