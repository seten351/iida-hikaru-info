import { and, asc, count, eq, gt, notExists, sql } from "drizzle-orm";

import { getDb, getWriterDb } from "@/db/client";
import {
  appearanceBackfillCheckpointsTable,
  appearanceRevisionsTable,
  appearanceSourceLinksTable,
  appearancesTable,
  contentManagementStateTable,
} from "@/db/schema";
import {
  officialAppearanceSources,
  type AppearanceImportItem,
  type OfficialAppearanceSourceName,
} from "@/domain/appearance";
import { ensureInitialAppearanceRevision } from "@/server/appearances/revisions";
import {
  deriveEvidenceKey,
  upsertSourceFoundation,
  type WriterTransaction,
} from "@/server/appearances/source-foundation";

export const phase1BackfillCheckpointId = "phase-1b";
export const phase1DualWriteConfirmation = "phase-1a-dual-write";

export type AppearanceBackfillHooks = {
  afterAppearanceLocked?: (appearanceId: string) => Promise<void> | void;
};

function legacyAppearanceToImportItem(
  appearance: typeof appearancesTable.$inferSelect,
): AppearanceImportItem {
  if (appearance.sourceName === null || appearance.sourceItemId === null) {
    throw new Error(`${appearance.id}: legacy source identity is incomplete.`);
  }
  if (!(appearance.sourceName in officialAppearanceSources)) {
    throw new Error(`${appearance.id}: legacy source is not registered.`);
  }

  return {
    id: appearance.id,
    startsAt: appearance.startsAt.toISOString(),
    title: appearance.title,
    seriesId: appearance.seriesId,
    eventGroupId: appearance.eventGroupId,
    eventTitle: appearance.eventTitle,
    sessionLabel: appearance.sessionLabel,
    category: appearance.category,
    sourceUrl: appearance.sourceUrl,
    publishedAt: appearance.publishedAt?.toISOString() ?? null,
    publishedOn: appearance.publishedOn,
    publishedAtPrecision: appearance.publishedAtPrecision,
    sourceName: appearance.sourceName as OfficialAppearanceSourceName,
    sourceItemId: appearance.sourceItemId,
  };
}

export async function backfillAppearance(
  tx: WriterTransaction,
  appearanceId: string,
  hooks: AppearanceBackfillHooks = {},
) {
  const [appearance] = await tx
    .select()
    .from(appearancesTable)
    .where(eq(appearancesTable.id, appearanceId))
    .for("update");

  if (!appearance) {
    return { found: false, linkInserted: false, revisionInserted: false };
  }

  await hooks.afterAppearanceLocked?.(appearance.id);

  const item = legacyAppearanceToImportItem(appearance);
  const source = await upsertSourceFoundation(tx, item, appearance.collectedAt);
  const evidenceKey = deriveEvidenceKey(item);
  const [activePrimary] = await tx
    .select({ appearanceId: appearanceSourceLinksTable.appearanceId })
    .from(appearanceSourceLinksTable)
    .where(
      and(
        eq(appearanceSourceLinksTable.appearanceId, appearance.id),
        eq(appearanceSourceLinksTable.active, true),
        eq(appearanceSourceLinksTable.isPrimary, true),
      ),
    )
    .limit(1);

  const insertedLinks = await tx
    .insert(appearanceSourceLinksTable)
    .values({
      appearanceId: appearance.id,
      sourceId: source.sourceId,
      sourceIdentityId: source.sourceIdentityId,
      evidenceKey,
      active: true,
      isPrimary: activePrimary === undefined,
      publishedAt: appearance.publishedAt,
      publishedOn: appearance.publishedOn,
      publishedAtPrecision: appearance.publishedAtPrecision,
      collectedAt: appearance.collectedAt,
    })
    .onConflictDoNothing({
      target: [
        appearanceSourceLinksTable.appearanceId,
        appearanceSourceLinksTable.sourceId,
        appearanceSourceLinksTable.evidenceKey,
      ],
    })
    .returning({ appearanceId: appearanceSourceLinksTable.appearanceId });

  await tx
    .update(appearancesTable)
    .set({
      visibilityStatus: sql`coalesce(${appearancesTable.visibilityStatus}, 'public')`,
      firstVisibleAt: sql`coalesce(${appearancesTable.firstVisibleAt}, ${appearancesTable.createdAt})`,
      visibilityChangedAt: sql`coalesce(${appearancesTable.visibilityChangedAt}, ${appearancesTable.createdAt})`,
      version: sql`coalesce(${appearancesTable.version}, 1)`,
    })
    .where(eq(appearancesTable.id, appearance.id));

  const revisionInserted = await ensureInitialAppearanceRevision(
    tx,
    appearance.id,
    "backfill",
  );

  return {
    found: true,
    linkInserted: insertedLinks.length === 1,
    revisionInserted,
  };
}

async function assertBackfillMode(tx: WriterTransaction) {
  const [state] = await tx
    .select({
      contentMode: contentManagementStateTable.contentMode,
      legacyImportLockedAt: contentManagementStateTable.legacyImportLockedAt,
    })
    .from(contentManagementStateTable)
    .where(eq(contentManagementStateTable.id, "singleton"));

  if (!state) {
    throw new Error("Content management state is not initialized.");
  }
  if (state.contentMode !== "bootstrap" || state.legacyImportLockedAt !== null) {
    throw new Error("Phase 1B backfill is disabled after Admin activation.");
  }
}

export async function resetAppearanceBackfillCheckpoint() {
  return getWriterDb().transaction(async (tx) => {
    await assertBackfillMode(tx);
    const [checkpoint] = await tx
      .select({ id: appearanceBackfillCheckpointsTable.id })
      .from(appearanceBackfillCheckpointsTable)
      .where(eq(appearanceBackfillCheckpointsTable.id, phase1BackfillCheckpointId))
      .for("update");

    if (!checkpoint) {
      throw new Error("Phase 1B backfill checkpoint is not initialized.");
    }

    await tx
      .update(appearanceBackfillCheckpointsTable)
      .set({
        lastAppearanceId: null,
        processedCount: 0,
        startedAt: null,
        completedAt: null,
        updatedAt: sql`now()`,
      })
      .where(eq(appearanceBackfillCheckpointsTable.id, phase1BackfillCheckpointId));
  });
}

export type RunAppearanceBackfillOptions = {
  confirmDualWrite: boolean;
  restart?: boolean;
  maxAppearances?: number;
  hooks?: AppearanceBackfillHooks;
};

export async function runAppearanceBackfill({
  confirmDualWrite,
  restart = false,
  maxAppearances,
  hooks,
}: RunAppearanceBackfillOptions) {
  if (
    maxAppearances !== undefined &&
    (!Number.isInteger(maxAppearances) || maxAppearances < 1)
  ) {
    throw new Error("maxAppearances must be a positive integer.");
  }
  if (restart) {
    await resetAppearanceBackfillCheckpoint();
  }

  let processedThisRun = 0;
  let linksInserted = 0;
  let revisionsInserted = 0;
  let completed = false;

  while (maxAppearances === undefined || processedThisRun < maxAppearances) {
    const step = await getWriterDb().transaction(async (tx) => {
      await assertBackfillMode(tx);
      const [checkpoint] = await tx
        .select()
        .from(appearanceBackfillCheckpointsTable)
        .where(eq(appearanceBackfillCheckpointsTable.id, phase1BackfillCheckpointId))
        .for("update");

      if (!checkpoint) {
        throw new Error("Phase 1B backfill checkpoint is not initialized.");
      }
      if (checkpoint.dualWriteConfirmedAt === null && !confirmDualWrite) {
        throw new Error(
          `Applying Phase 1B requires --confirm=${phase1DualWriteConfirmation}.`,
        );
      }
      if (checkpoint.completedAt !== null) {
        return { done: true, linkInserted: false, revisionInserted: false };
      }

      const [nextAppearance] = await tx
        .select({ id: appearancesTable.id })
        .from(appearancesTable)
        .where(
          checkpoint.lastAppearanceId === null
            ? undefined
            : gt(appearancesTable.id, checkpoint.lastAppearanceId),
        )
        .orderBy(asc(appearancesTable.id))
        .limit(1);

      if (!nextAppearance) {
        await tx
          .update(appearanceBackfillCheckpointsTable)
          .set({
            completedAt: new Date(),
            dualWriteConfirmedAt: checkpoint.dualWriteConfirmedAt ?? new Date(),
            updatedAt: sql`now()`,
          })
          .where(
            eq(
              appearanceBackfillCheckpointsTable.id,
              phase1BackfillCheckpointId,
            ),
          );
        return { done: true, linkInserted: false, revisionInserted: false };
      }

      const result = await backfillAppearance(tx, nextAppearance.id, hooks);
      await tx
        .update(appearanceBackfillCheckpointsTable)
        .set({
          lastAppearanceId: nextAppearance.id,
          processedCount: checkpoint.processedCount + 1,
          startedAt: checkpoint.startedAt ?? new Date(),
          dualWriteConfirmedAt: checkpoint.dualWriteConfirmedAt ?? new Date(),
          updatedAt: sql`now()`,
        })
        .where(
          eq(appearanceBackfillCheckpointsTable.id, phase1BackfillCheckpointId),
        );

      return {
        done: false,
        linkInserted: result.linkInserted,
        revisionInserted: result.revisionInserted,
      };
    });

    if (step.done) {
      completed = true;
      break;
    }

    processedThisRun += 1;
    linksInserted += Number(step.linkInserted);
    revisionsInserted += Number(step.revisionInserted);
  }

  return { processedThisRun, linksInserted, revisionsInserted, completed };
}

export async function getAppearanceBackfillStatus() {
  const [checkpoint] = await getDb()
    .select()
    .from(appearanceBackfillCheckpointsTable)
    .where(eq(appearanceBackfillCheckpointsTable.id, phase1BackfillCheckpointId));
  if (!checkpoint) {
    throw new Error("Phase 1B backfill checkpoint is not initialized.");
  }

  const [totals] = await getDb()
    .select({
      appearances: count(),
      visibilityPending: sql<number>`count(*) filter (where ${appearancesTable.visibilityStatus} is null)::int`,
    })
    .from(appearancesTable);
  const [missingLinks] = await getDb()
    .select({ value: count() })
    .from(appearancesTable)
    .where(
      notExists(
        getDb()
          .select({ appearanceId: appearanceSourceLinksTable.appearanceId })
          .from(appearanceSourceLinksTable)
          .where(eq(appearanceSourceLinksTable.appearanceId, appearancesTable.id))
          .limit(1),
      ),
    );
  const [revisionCount] = await getDb()
    .select({ value: count() })
    .from(appearanceRevisionsTable)
    .where(eq(appearanceRevisionsTable.version, 1));

  return {
    checkpoint,
    appearances: totals.appearances,
    visibilityPending: totals.visibilityPending,
    missingLinks: missingLinks.value,
    initialRevisions: revisionCount.value,
  };
}
