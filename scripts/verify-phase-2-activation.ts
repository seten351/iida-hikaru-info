import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { closeWriterDb, getWriterDb } from "../src/db/client";
import {
  adminAuthAttemptsTable,
  appearanceRevisionsTable,
  appearanceSeriesProposalsTable,
  appearanceSeriesRevisionsTable,
  appearanceSeriesTable,
} from "../src/db/schema";
import { adminActivationConfirmationPhrase } from "../src/lib/admin-constants";
import { assertBootstrapImportIsAllowed } from "../src/server/appearances/source-foundation";
import {
  activateAdminContent,
  readAdminActivationState,
} from "../src/server/admin/activation-service";
import { createAdminActivationReauthProof } from "../src/server/admin/reauth-proof";
import {
  clearAdminActivationAttempts,
  clearAdminLoginAttempts,
  reserveAdminActivationAttempt,
  reserveAdminLoginAttempt,
} from "../src/server/admin/rate-limit";
import { confirmAdminWrite } from "../src/server/admin/write-service";

const sessionSecret = "phase-2-activation-test-session-secret-at-least-32-bytes";

async function contentFingerprint() {
  const result = await getWriterDb().execute(sql`select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(t) order by id) from appearances t),
    (select jsonb_agg(to_jsonb(t) order by id) from appearance_series t),
    (select jsonb_agg(to_jsonb(t) order by id) from appearance_proposals t),
    (select jsonb_agg(to_jsonb(t) order by id) from appearance_series_proposals t),
    (select jsonb_agg(to_jsonb(t) order by appearance_id, version) from appearance_revisions t),
    (select jsonb_agg(to_jsonb(t) order by series_id, version) from appearance_series_revisions t),
    (select jsonb_agg(to_jsonb(t) order by id) from source_items t),
    (select jsonb_agg(to_jsonb(t) order by id) from source_identities t),
    (select jsonb_agg(to_jsonb(t) order by appearance_id, source_id, evidence_key) from appearance_source_links t),
    (select jsonb_agg(to_jsonb(t) order by proposal_id, source_id, evidence_key) from proposal_source_links t),
    (select to_jsonb(t) from content_management_state t where id = 'singleton')
  )::text) as fingerprint`);
  return result.rows[0];
}

function activationInput(sessionId: string, now = new Date()) {
  return {
    confirmation: adminActivationConfirmationPhrase,
    proof: createAdminActivationReauthProof(sessionSecret, sessionId, now),
    sessionId,
    sessionSecret,
    writeEnabled: true,
    now,
  };
}

async function main() {
  assert.equal(
    process.env.PHASE_2_ACTIVATION_TEST_DATABASE,
    "1",
    "Refusing to run without PHASE_2_ACTIVATION_TEST_DATABASE=1.",
  );
  assert.match(
    process.env.PHASE_2_ACTIVATION_TEST_BRANCH_ID ?? "",
    /^br-/,
    "PHASE_2_ACTIVATION_TEST_BRANCH_ID must identify the isolated Neon branch.",
  );

  const db = getWriterDb();
  const initial = await readAdminActivationState();
  assert.equal(initial.classification, "ready");
  await assertBootstrapImportIsAllowed();
  const baselineFingerprint = await contentFingerprint();
  const sessionId = randomUUID();
  const now = new Date();
  const valid = activationInput(sessionId, now);

  await assert.rejects(
    activateAdminContent({ ...valid, writeEnabled: false }),
    /authorization failed/,
  );
  await assert.rejects(
    activateAdminContent({ ...valid, confirmation: "ACTIVATE ADMIN " }),
    /authorization failed/,
  );
  await assert.rejects(
    activateAdminContent({ ...valid, sessionId: randomUUID() }),
    /authorization failed/,
  );
  const signatureBytes = Buffer.from(valid.proof.split(".")[1], "base64url");
  signatureBytes[0] ^= 0x01;
  await assert.rejects(
    activateAdminContent({
      ...valid,
      proof: `${valid.proof.split(".")[0]}.${signatureBytes.toString("base64url")}`,
    }),
    /authorization failed/,
  );
  const expiredAt = new Date(now.getTime() - 6 * 60 * 1000);
  const expired = activationInput(sessionId, expiredAt);
  await assert.rejects(
    activateAdminContent({ ...expired, now }),
    /authorization failed/,
  );
  assert.deepEqual(await contentFingerprint(), baselineFingerprint);

  const rateHash = `activation-test-${randomUUID()}`;
  const loginReservation = await reserveAdminLoginAttempt(rateHash, now);
  assert.equal(loginReservation.allowed, true);
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await reserveAdminActivationAttempt(rateHash, now)).allowed, true);
  }
  assert.equal((await reserveAdminActivationAttempt(rateHash, now)).allowed, false);
  await clearAdminActivationAttempts(rateHash);
  const [loginAttempt] = await db
    .select()
    .from(adminAuthAttemptsTable)
    .where(eq(adminAuthAttemptsTable.ipHash, rateHash));
  assert.equal(loginAttempt?.purpose, "login");
  await clearAdminLoginAttempts(rateHash);

  const [revision] = await db
    .select()
    .from(appearanceRevisionsTable)
    .orderBy(appearanceRevisionsTable.appearanceId)
    .limit(1);
  assert.ok(revision);
  await db
    .update(appearanceRevisionsTable)
    .set({ snapshot: {} })
    .where(
      sql`${appearanceRevisionsTable.appearanceId} = ${revision.appearanceId}
        and ${appearanceRevisionsTable.version} = ${revision.version}`,
    );
  await assert.rejects(activateAdminContent(valid), /revision invariant/);
  const afterFailedActivation = await readAdminActivationState();
  assert.equal(afterFailedActivation.classification, "ready");
  await db
    .update(appearanceRevisionsTable)
    .set({ snapshot: revision.snapshot })
    .where(
      sql`${appearanceRevisionsTable.appearanceId} = ${revision.appearanceId}
        and ${appearanceRevisionsTable.version} = ${revision.version}`,
    );
  assert.deepEqual(await contentFingerprint(), baselineFingerprint);

  const concurrent = await Promise.all([
    activateAdminContent(valid),
    activateAdminContent(valid),
  ]);
  assert.deepEqual(
    concurrent.map((result) => result.status).sort(),
    ["activated", "already-activated"],
  );
  const activated = await readAdminActivationState();
  assert.equal(activated.classification, "activated");
  assert.equal(
    activated.state.adminActivatedAt?.getTime(),
    activated.state.legacyImportLockedAt?.getTime(),
  );
  assert.equal((await activateAdminContent(valid)).status, "already-activated");
  await assert.rejects(assertBootstrapImportIsAllowed(), /locked after Admin activation/);

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const seriesId = `activation-test-${suffix}`;
  const result = await confirmAdminWrite(
    {
      kind: "series",
      operation: "create",
      seriesId,
      expectedVersion: null,
      displayName: `Activation test ${suffix}`,
    },
    randomUUID(),
  );
  assert.equal(result.status, "approved");
  const proposalId = result.proposalIds[0];
  await db.transaction(async (tx) => {
    await tx
      .delete(appearanceSeriesRevisionsTable)
      .where(eq(appearanceSeriesRevisionsTable.seriesId, seriesId));
    if (proposalId) {
      await tx
        .delete(appearanceSeriesProposalsTable)
        .where(eq(appearanceSeriesProposalsTable.id, proposalId));
    }
    await tx.delete(appearanceSeriesTable).where(eq(appearanceSeriesTable.id, seriesId));
  });

  const finalCounts = await db.execute<{
    appearances: number;
    cards: number;
    series: number;
    proposals: number;
  }>(sql`select
    (select count(*)::int from appearances) as appearances,
    (select count(distinct coalesce(event_group_id, 'appearance:' || id))::int from appearances) as cards,
    (select count(*)::int from appearance_series) as series,
    ((select count(*) from appearance_proposals) + (select count(*) from appearance_series_proposals))::int as proposals`);
  assert.deepEqual(finalCounts.rows[0], {
    appearances: 120,
    cards: 97,
    series: 31,
    proposals: 0,
  });
  console.log("Phase 2 activation integration verification passed; branch remains irreversibly activated.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeWriterDb();
  });
