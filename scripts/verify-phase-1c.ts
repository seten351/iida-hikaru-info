import assert from "node:assert/strict";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { closeWriterDb, getDb, getWriterDb } from "../src/db/client";
import {
  appearanceRevisionsTable,
  appearanceSeriesTable,
  appearanceSourceLinksTable,
  appearancesTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "../src/db/schema";
import { buildAppearanceCards } from "../src/lib/appearances";
import {
  applyAppearanceImport,
  planAppearanceImport,
} from "../src/server/appearances/import-service";
import { getAppearancePageData } from "../src/server/appearances/repository";
import { appearanceImportData } from "./appearance-import-data";
import { appearanceSeriesData } from "./appearance-series-data";

const args = process.argv.slice(2);
const injectPreflightViolation = args.includes("--inject-preflight-violation");
const repairPreflightViolation = args.includes("--repair-preflight-violation");
const sharedIdentityTestId = "phase1c-shared-identity-test";

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; cause?: unknown };
  return (
    candidate.code === code || hasPostgresErrorCode(candidate.cause, code)
  );
}

async function changePreflightFixture(mode: "inject" | "repair") {
  const result =
    mode === "inject"
      ? await getWriterDb().execute(sql`
          with target as (
            select appearance_id, source_id, evidence_key
            from appearance_source_links
            where active and is_primary
            order by appearance_id
            limit 1
          )
          update appearance_source_links l
          set source_identity_id = null
          from target
          where l.appearance_id = target.appearance_id
            and l.source_id = target.source_id
            and l.evidence_key = target.evidence_key
          returning l.appearance_id
        `)
      : await getWriterDb().execute(sql`
          with target as (
            select l.appearance_id,
              l.source_id,
              l.evidence_key,
              i.id as source_identity_id
            from appearance_source_links l
            join appearances a on a.id = l.appearance_id
            join source_identities i
              on i.source_id = l.source_id
              and i.source_name = a.source_name
              and i.external_item_id = a.source_item_id
            where l.source_identity_id is null
            order by l.appearance_id
            limit 1
          )
          update appearance_source_links l
          set source_identity_id = target.source_identity_id
          from target
          where l.appearance_id = target.appearance_id
            and l.source_id = target.source_id
            and l.evidence_key = target.evidence_key
          returning l.appearance_id
        `);

  assert.equal(result.rows.length, 1);
  console.log(
    mode === "inject"
      ? "Injected one Phase 1C preflight violation."
      : "Repaired the Phase 1C preflight violation.",
  );
}

async function verifySchemaShape() {
  const result = await getWriterDb().execute<{
    active_primary_index: number;
    old_identity_index: number;
    ownership_constraints: number;
    required_not_null_columns: number;
    invariant_triggers: number;
    deferred_constraint_triggers: number;
  }>(sql`
    select
      (select count(*)::int
        from pg_indexes
        where schemaname = 'public'
          and indexname = 'appearance_source_links_one_active_primary'
      ) as active_primary_index,
      (select count(*)::int
        from pg_indexes
        where schemaname = 'public'
          and indexname = 'appearances_source_item_unique'
      ) as old_identity_index,
      (select count(*)::int
        from pg_constraint
        where conname in (
          'appearance_source_links_identity_source_fk',
          'proposal_source_links_identity_source_fk'
        )
      ) as ownership_constraints,
      (select count(*)::int
        from pg_attribute
        where (
          (attrelid = 'appearances'::regclass and attname in (
              'source_name',
              'source_item_id',
              'visibility_status',
              'first_visible_at',
              'visibility_changed_at',
              'version'
            ))
          or (attrelid = 'appearance_source_links'::regclass and attname in (
              'source_identity_id',
              'published_at_precision',
              'collected_at'
            ))
        )
          and attnotnull
      ) as required_not_null_columns,
      (select count(*)::int
        from pg_trigger
        where not tgisinternal
          and tgname like 'appearance_%'
      ) as invariant_triggers,
      (select count(*)::int
        from pg_trigger
        where tgname in (
          'appearance_active_primary_exactly_one_from_link',
          'appearance_active_primary_exactly_one_from_appearance'
        )
          and tgdeferrable
          and tginitdeferred
      ) as deferred_constraint_triggers
  `);

  assert.deepEqual(result.rows[0], {
    active_primary_index: 1,
    old_identity_index: 0,
    ownership_constraints: 2,
    required_not_null_columns: 9,
    invariant_triggers: 7,
    deferred_constraint_triggers: 2,
  });
}

async function verifyDataAndRepository() {
  const data = await getAppearancePageData();
  const [seriesCount] = await getDb()
    .select({ value: count() })
    .from(appearanceSeriesTable);

  assert.equal(data.appearances.length, 120);
  assert.equal(buildAppearanceCards(data.appearances).length, 97);
  assert.equal(seriesCount.value, 31);

  const invariants = await getWriterDb().execute<{
    active_primary_violations: number;
    identity_ownership_violations: number;
    legacy_mismatches: number;
    missing_initial_revisions: number;
  }>(sql`
    select
      (select count(*)::int from appearances a
        where (
          select count(*)
          from appearance_source_links l
          where l.appearance_id = a.id and l.active and l.is_primary
        ) <> 1
      ) as active_primary_violations,
      (select count(*)::int
        from appearance_source_links l
        join source_identities i on i.id = l.source_identity_id
        where i.source_id is distinct from l.source_id
      ) as identity_ownership_violations,
      (select count(*)::int
        from appearances a
        join appearance_source_links l
          on l.appearance_id = a.id and l.active and l.is_primary
        join source_items s on s.id = l.source_id
        join source_identities i on i.id = l.source_identity_id
        where a.source_name is distinct from i.source_name
          or a.source_item_id is distinct from i.external_item_id
          or a.source_url is distinct from s.canonical_url
          or a.published_at is distinct from l.published_at
          or a.published_on is distinct from l.published_on
          or a.published_at_precision is distinct from l.published_at_precision
      ) as legacy_mismatches,
      (select count(*)::int from appearances a
        where not exists (
          select 1 from appearance_revisions r
          where r.appearance_id = a.id
            and r.version = 1
            and r.snapshot_schema_version = 1
        )
      ) as missing_initial_revisions
  `);
  assert.deepEqual(invariants.rows[0], {
    active_primary_violations: 0,
    identity_ownership_violations: 0,
    legacy_mismatches: 0,
    missing_initial_revisions: 0,
  });

  const legacyRows = await getDb()
    .select({
      id: appearancesTable.id,
      sourceUrl: appearancesTable.sourceUrl,
      publishedAt: appearancesTable.publishedAt,
      publishedOn: appearancesTable.publishedOn,
      publishedAtPrecision: appearancesTable.publishedAtPrecision,
      collectedAt: appearancesTable.collectedAt,
    })
    .from(appearancesTable)
    .orderBy(asc(appearancesTable.id));
  const repositoryRows = [...data.appearances].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  assert.equal(legacyRows.length, repositoryRows.length);
  for (let index = 0; index < legacyRows.length; index += 1) {
    const legacy = legacyRows[index];
    const repository = repositoryRows[index];
    assert.equal(repository.id, legacy.id);
    assert.equal(repository.sourceUrl, legacy.sourceUrl);
    assert.equal(
      repository.publishedAt,
      legacy.publishedAt?.toISOString() ?? null,
    );
    assert.equal(repository.publishedOn, legacy.publishedOn);
    assert.equal(
      repository.publishedAtPrecision,
      legacy.publishedAtPrecision,
    );
    assert.equal(repository.collectedAt, legacy.collectedAt.toISOString());
  }

  const plan = await planAppearanceImport(
    appearanceImportData,
    appearanceSeriesData,
  );
  assert.deepEqual(plan.counts, { insert: 0, update: 0, unchanged: 120 });
  assert.equal(await applyAppearanceImport(appearanceImportData, plan), 0);
}

async function verifyConstraintViolations() {
  const [primary] = await getDb()
    .select()
    .from(appearanceSourceLinksTable)
    .where(
      and(
        eq(appearanceSourceLinksTable.active, true),
        eq(appearanceSourceLinksTable.isPrimary, true),
      ),
    )
    .orderBy(asc(appearanceSourceLinksTable.appearanceId))
    .limit(1);
  assert.ok(primary);

  await assert.rejects(
    getWriterDb().transaction(async (tx) => {
      await tx
        .update(appearanceSourceLinksTable)
        .set({ active: false, isPrimary: false })
        .where(
          and(
            eq(appearanceSourceLinksTable.appearanceId, primary.appearanceId),
            eq(appearanceSourceLinksTable.sourceId, primary.sourceId),
            eq(appearanceSourceLinksTable.evidenceKey, primary.evidenceKey),
          ),
        );
    }),
    (error) => hasPostgresErrorCode(error, "23514"),
  );

  await assert.rejects(
    getWriterDb().transaction(async (tx) => {
      await tx.insert(appearanceSourceLinksTable).values({
        appearanceId: primary.appearanceId,
        sourceId: primary.sourceId,
        sourceIdentityId: primary.sourceIdentityId,
        evidenceKey: "phase1c-secondary",
        active: true,
        isPrimary: true,
        publishedAt: primary.publishedAt,
        publishedOn: primary.publishedOn,
        publishedAtPrecision: primary.publishedAtPrecision,
        collectedAt: primary.collectedAt,
      });
    }),
    (error) => hasPostgresErrorCode(error, "23505"),
  );

  const [foreignIdentity] = await getDb()
    .select({ id: sourceIdentitiesTable.id })
    .from(sourceIdentitiesTable)
    .where(sql`${sourceIdentitiesTable.sourceId} <> ${primary.sourceId}`)
    .limit(1);
  assert.ok(foreignIdentity);
  await assert.rejects(
    getWriterDb().transaction(async (tx) => {
      await tx
        .update(appearanceSourceLinksTable)
        .set({ sourceIdentityId: foreignIdentity.id })
        .where(
          and(
            eq(appearanceSourceLinksTable.appearanceId, primary.appearanceId),
            eq(appearanceSourceLinksTable.sourceId, primary.sourceId),
            eq(appearanceSourceLinksTable.evidenceKey, primary.evidenceKey),
          ),
        );
    }),
    (error) => hasPostgresErrorCode(error, "23503"),
  );

  await assert.rejects(
    getWriterDb().transaction(async (tx) => {
      await tx.execute(
        sql`update appearances set version = null where id = ${primary.appearanceId}`,
      );
    }),
    (error) => hasPostgresErrorCode(error, "23502"),
  );
}

async function verifyMirrorSynchronization() {
  const [primary] = await getDb()
    .select({
      appearanceId: appearanceSourceLinksTable.appearanceId,
      sourceId: appearanceSourceLinksTable.sourceId,
      evidenceKey: appearanceSourceLinksTable.evidenceKey,
      publishedAt: appearanceSourceLinksTable.publishedAt,
      publishedOn: appearanceSourceLinksTable.publishedOn,
      publishedAtPrecision: appearanceSourceLinksTable.publishedAtPrecision,
      canonicalUrl: sourceItemsTable.canonicalUrl,
    })
    .from(appearanceSourceLinksTable)
    .innerJoin(
      sourceItemsTable,
      eq(appearanceSourceLinksTable.sourceId, sourceItemsTable.id),
    )
    .where(
      and(
        eq(appearanceSourceLinksTable.active, true),
        eq(appearanceSourceLinksTable.isPrimary, true),
      ),
    )
    .orderBy(asc(appearanceSourceLinksTable.appearanceId))
    .limit(1);
  assert.ok(primary);

  await getWriterDb().transaction(async (tx) => {
    const target = and(
      eq(appearanceSourceLinksTable.appearanceId, primary.appearanceId),
      eq(appearanceSourceLinksTable.sourceId, primary.sourceId),
      eq(appearanceSourceLinksTable.evidenceKey, primary.evidenceKey),
    );
    await tx
      .update(appearanceSourceLinksTable)
      .set({
        publishedAt: null,
        publishedOn: null,
        publishedAtPrecision: "unknown",
      })
      .where(target);
    const [unknownMirror] = await tx
      .select({
        publishedAt: appearancesTable.publishedAt,
        publishedOn: appearancesTable.publishedOn,
        publishedAtPrecision: appearancesTable.publishedAtPrecision,
      })
      .from(appearancesTable)
      .where(eq(appearancesTable.id, primary.appearanceId));
    assert.deepEqual(unknownMirror, {
      publishedAt: null,
      publishedOn: null,
      publishedAtPrecision: "unknown",
    });

    await tx
      .update(appearanceSourceLinksTable)
      .set({
        publishedAt: primary.publishedAt,
        publishedOn: primary.publishedOn,
        publishedAtPrecision: primary.publishedAtPrecision,
      })
      .where(target);
    await tx
      .update(appearancesTable)
      .set({ sourceUrl: "https://example.invalid/direct-legacy-write" })
      .where(eq(appearancesTable.id, primary.appearanceId));
    const [restoredMirror] = await tx
      .select({ sourceUrl: appearancesTable.sourceUrl })
      .from(appearancesTable)
      .where(eq(appearancesTable.id, primary.appearanceId));
    assert.equal(restoredMirror.sourceUrl, primary.canonicalUrl);
  });
}

async function verifyImportUpdateCutover() {
  const original = appearanceImportData[0];
  const changed = {
    ...original,
    title: `${original.title} [Phase 1C update test]`,
  };
  const changedPlan = await planAppearanceImport(
    [changed],
    appearanceSeriesData,
  );
  assert.deepEqual(changedPlan.counts, {
    insert: 0,
    update: 1,
    unchanged: 0,
  });

  try {
    assert.equal(await applyAppearanceImport([changed], changedPlan), 1);
    const changedData = await getAppearancePageData();
    assert.equal(
      changedData.appearances.find((item) => item.id === original.id)?.title,
      changed.title,
    );
  } finally {
    const restorePlan = await planAppearanceImport(
      [original],
      appearanceSeriesData,
    );
    assert.equal(await applyAppearanceImport([original], restorePlan), 1);
  }

  const restoredData = await getAppearancePageData();
  assert.equal(
    restoredData.appearances.find((item) => item.id === original.id)?.title,
    original.title,
  );
}

async function verifySharedIdentityAndRollbackCompatibility() {
  const base = appearanceImportData[0];
  const sharedIdentityItem = {
    ...base,
    id: sharedIdentityTestId,
    title: "Phase 1C shared identity test",
    eventGroupId: null,
    eventTitle: null,
    sessionLabel: null,
  };

  const plan = await planAppearanceImport(
    [sharedIdentityItem],
    appearanceSeriesData,
  );
  assert.deepEqual(plan.counts, { insert: 1, update: 0, unchanged: 0 });

  try {
    assert.equal(await applyAppearanceImport([sharedIdentityItem], plan), 1);
    const sharedLinks = await getDb()
      .select({ appearanceId: appearanceSourceLinksTable.appearanceId })
      .from(appearanceSourceLinksTable)
      .innerJoin(
        sourceIdentitiesTable,
        eq(
          appearanceSourceLinksTable.sourceIdentityId,
          sourceIdentitiesTable.id,
        ),
      )
      .where(
        and(
          eq(sourceIdentitiesTable.sourceName, base.sourceName),
          eq(sourceIdentitiesTable.externalItemId, base.sourceItemId),
          inArray(appearanceSourceLinksTable.appearanceId, [
            base.id,
            sharedIdentityTestId,
          ]),
        ),
      );
    assert.deepEqual(
      new Set(sharedLinks.map((link) => link.appearanceId)),
      new Set([base.id, sharedIdentityTestId]),
    );

    const [legacyMirror] = await getDb()
      .select({
        sourceName: appearancesTable.sourceName,
        sourceItemId: appearancesTable.sourceItemId,
      })
      .from(appearancesTable)
      .where(eq(appearancesTable.id, sharedIdentityTestId));
    assert.deepEqual(legacyMirror, {
      sourceName: base.sourceName,
      sourceItemId: base.sourceItemId,
    });
  } finally {
    await getWriterDb().transaction(async (tx) => {
      await tx
        .delete(appearanceRevisionsTable)
        .where(eq(appearanceRevisionsTable.appearanceId, sharedIdentityTestId));
      await tx
        .delete(appearancesTable)
        .where(eq(appearancesTable.id, sharedIdentityTestId));
    });
  }

  const finalData = await getAppearancePageData();
  assert.equal(finalData.appearances.length, 120);
  assert.equal(buildAppearanceCards(finalData.appearances).length, 97);
}

async function main() {
  assert.equal(
    process.env.PHASE_1C_TEST_DATABASE,
    "1",
    "Refusing to run Phase 1C write tests without PHASE_1C_TEST_DATABASE=1.",
  );

  if (injectPreflightViolation || repairPreflightViolation) {
    assert.notEqual(
      injectPreflightViolation,
      repairPreflightViolation,
      "Choose exactly one preflight fixture action.",
    );
    await changePreflightFixture(
      injectPreflightViolation ? "inject" : "repair",
    );
    return;
  }

  await verifySchemaShape();
  await verifyDataAndRepository();
  await verifyConstraintViolations();
  await verifyMirrorSynchronization();
  await verifyImportUpdateCutover();
  await verifySharedIdentityAndRollbackCompatibility();
  await verifyDataAndRepository();

  console.log(
    "Verified Phase 1C strong constraints / source-structure repository and import / legacy mirror sync / rollback compatibility / 120 appearances / 97 cards / 31 series.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeWriterDb);
