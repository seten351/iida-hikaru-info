import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";

import { closeWriterDb, getDb, getWriterDb } from "../src/db/client";
import {
  adminAuthAttemptsTable,
  appearanceProposalsTable,
  appearanceRevisionsTable,
  appearanceSeriesRevisionsTable,
  appearanceSeriesTable,
  appearancesTable,
  contentManagementStateTable,
  proposalSourceLinksTable,
} from "../src/db/schema";
import { buildAppearanceCards } from "../src/lib/appearances";
import { getAppearancePageData } from "../src/server/appearances/repository";
import {
  clearAdminLoginAttempts,
  reserveAdminLoginAttempt,
} from "../src/server/admin/rate-limit";

async function main() {
  assert.equal(
    process.env.PHASE_2A_TEST_DATABASE,
    "1",
    "Refusing to run Phase 2A DB tests without PHASE_2A_TEST_DATABASE=1.",
  );

  const pageData = await getAppearancePageData();
  assert.equal(pageData.appearances.length, 120);
  assert.equal(buildAppearanceCards(pageData.appearances).length, 97);

  const db = getDb();
  const [[appearanceCount], [seriesCount], [seriesRevisionCount], [revisionCount]] =
    await Promise.all([
      db.select({ value: count() }).from(appearancesTable),
      db.select({ value: count() }).from(appearanceSeriesTable),
      db.select({ value: count() }).from(appearanceSeriesRevisionsTable),
      db.select({ value: count() }).from(appearanceRevisionsTable),
    ]);
  assert.equal(appearanceCount.value, 120);
  assert.equal(seriesCount.value, 31);
  assert.equal(seriesRevisionCount.value, 31);
  assert.equal(revisionCount.value, 120);

  const [seriesVersions] = await db
    .select({
      invalid: sql<number>`count(*) filter (where ${appearanceSeriesTable.version} <> 1)::int`,
    })
    .from(appearanceSeriesTable);
  assert.equal(seriesVersions.invalid, 0);

  const [proposalState] = await db
    .select({
      proposals: count(),
      duplicateIdempotencyKeys: sql<number>`(
        select count(*)::int from (
          select idempotency_key from appearance_proposals
          where idempotency_key is not null
          group by idempotency_key having count(*) > 1
        ) duplicates
      )`,
    })
    .from(appearanceProposalsTable);
  assert.equal(proposalState.proposals, 0);
  assert.equal(proposalState.duplicateIdempotencyKeys, 0);

  const [nullPrimary] = await db
    .select({ value: count() })
    .from(proposalSourceLinksTable)
    .where(sql`${proposalSourceLinksTable.isPrimary} is null`);
  assert.equal(nullPrimary.value, 0);

  const [contentState] = await db
    .select()
    .from(contentManagementStateTable)
    .where(eq(contentManagementStateTable.id, "singleton"));
  assert.equal(contentState.contentMode, "bootstrap");
  assert.equal(contentState.adminActivatedAt, null);
  assert.equal(contentState.legacyImportLockedAt, null);

  const testHash = `phase2a-test-${randomUUID()}`;
  try {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const reservation = await reserveAdminLoginAttempt(testHash);
      assert.equal(reservation.allowed, true);
    }
    const blocked = await reserveAdminLoginAttempt(testHash);
    assert.equal(blocked.allowed, false);
  } finally {
    await clearAdminLoginAttempts(testHash);
  }

  const [remainingTestRows] = await getWriterDb()
    .select({ value: count() })
    .from(adminAuthAttemptsTable)
    .where(eq(adminAuthAttemptsTable.ipHash, testHash));
  assert.equal(remainingTestRows.value, 0);

  console.log("Phase 2A verification passed: 120 appearances / 97 cards / 31 series.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeWriterDb();
  });
