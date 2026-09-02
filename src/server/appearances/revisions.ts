import { and, asc, eq } from "drizzle-orm";

import {
  appearanceRevisionsTable,
  appearanceSourceLinksTable,
  appearancesTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "@/db/schema";
import type { WriterTransaction } from "@/server/appearances/source-foundation";

export const appearanceSnapshotSchemaVersion = 1;

export type AppearanceRevisionSnapshotV1 = {
  appearance: {
    id: string;
    startsAt: string;
    title: string;
    seriesId: string | null;
    eventGroupId: string | null;
    eventTitle: string | null;
    sessionLabel: string | null;
    category: string;
    publishedAt: string | null;
    publishedOn: string | null;
    publishedAtPrecision: string;
    collectedAt: string;
    createdAt: string;
    updatedAt: string;
  };
  visibility: {
    status: "public" | "hidden";
    firstVisibleAt: string;
    visibilityChangedAt: string;
    version: number;
  };
  sourceLinks: Array<{
    sourceId: string;
    sourceIdentityId: string | null;
    sourceName: string | null;
    externalItemId: string | null;
    canonicalUrl: string;
    evidenceKey: string;
    active: boolean;
    isPrimary: boolean;
    publishedAt: string | null;
    publishedOn: string | null;
    publishedAtPrecision: string | null;
    collectedAt: string | null;
  }>;
};

export function decodeAppearanceRevisionSnapshot(
  snapshotSchemaVersion: number,
  snapshot: unknown,
) {
  if (snapshotSchemaVersion !== appearanceSnapshotSchemaVersion) {
    throw new Error(
      `Unsupported appearance revision snapshot schema version: ${snapshotSchemaVersion}.`,
    );
  }
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Appearance revision snapshot must be an object.");
  }

  return snapshot as AppearanceRevisionSnapshotV1;
}

export async function buildAppearanceRevisionSnapshot(
  tx: WriterTransaction,
  appearanceId: string,
): Promise<AppearanceRevisionSnapshotV1> {
  const [appearance] = await tx
    .select()
    .from(appearancesTable)
    .where(eq(appearancesTable.id, appearanceId));

  if (
    !appearance ||
    appearance.visibilityStatus === null ||
    appearance.firstVisibleAt === null ||
    appearance.visibilityChangedAt === null ||
    appearance.version === null
  ) {
    throw new Error(`${appearanceId}: appearance is not ready for an initial revision.`);
  }

  const links = await tx
    .select({
      sourceId: appearanceSourceLinksTable.sourceId,
      sourceIdentityId: appearanceSourceLinksTable.sourceIdentityId,
      sourceName: sourceIdentitiesTable.sourceName,
      externalItemId: sourceIdentitiesTable.externalItemId,
      canonicalUrl: sourceItemsTable.canonicalUrl,
      evidenceKey: appearanceSourceLinksTable.evidenceKey,
      active: appearanceSourceLinksTable.active,
      isPrimary: appearanceSourceLinksTable.isPrimary,
      publishedAt: appearanceSourceLinksTable.publishedAt,
      publishedOn: appearanceSourceLinksTable.publishedOn,
      publishedAtPrecision: appearanceSourceLinksTable.publishedAtPrecision,
      collectedAt: appearanceSourceLinksTable.collectedAt,
    })
    .from(appearanceSourceLinksTable)
    .innerJoin(
      sourceItemsTable,
      eq(appearanceSourceLinksTable.sourceId, sourceItemsTable.id),
    )
    .leftJoin(
      sourceIdentitiesTable,
      eq(appearanceSourceLinksTable.sourceIdentityId, sourceIdentitiesTable.id),
    )
    .where(
      and(
        eq(appearanceSourceLinksTable.appearanceId, appearanceId),
        eq(appearanceSourceLinksTable.active, true),
      ),
    )
    .orderBy(
      asc(appearanceSourceLinksTable.sourceId),
      asc(appearanceSourceLinksTable.evidenceKey),
    );

  return {
    appearance: {
      id: appearance.id,
      startsAt: appearance.startsAt.toISOString(),
      title: appearance.title,
      seriesId: appearance.seriesId,
      eventGroupId: appearance.eventGroupId,
      eventTitle: appearance.eventTitle,
      sessionLabel: appearance.sessionLabel,
      category: appearance.category,
      publishedAt: appearance.publishedAt?.toISOString() ?? null,
      publishedOn: appearance.publishedOn,
      publishedAtPrecision: appearance.publishedAtPrecision,
      collectedAt: appearance.collectedAt.toISOString(),
      createdAt: appearance.createdAt.toISOString(),
      updatedAt: appearance.updatedAt.toISOString(),
    },
    visibility: {
      status: appearance.visibilityStatus,
      firstVisibleAt: appearance.firstVisibleAt.toISOString(),
      visibilityChangedAt: appearance.visibilityChangedAt.toISOString(),
      version: appearance.version,
    },
    sourceLinks: links.map((link) => ({
      ...link,
      publishedAt: link.publishedAt?.toISOString() ?? null,
      collectedAt: link.collectedAt?.toISOString() ?? null,
    })),
  };
}

export async function ensureInitialAppearanceRevision(
  tx: WriterTransaction,
  appearanceId: string,
  actorType: "backfill" | "bootstrap",
) {
  const [existing] = await tx
    .select({ appearanceId: appearanceRevisionsTable.appearanceId })
    .from(appearanceRevisionsTable)
    .where(
      and(
        eq(appearanceRevisionsTable.appearanceId, appearanceId),
        eq(appearanceRevisionsTable.version, 1),
      ),
    );

  if (existing) {
    return false;
  }

  const snapshot = await buildAppearanceRevisionSnapshot(tx, appearanceId);
  const inserted = await tx
    .insert(appearanceRevisionsTable)
    .values({
      appearanceId,
      version: 1,
      operation: "create",
      snapshotSchemaVersion: appearanceSnapshotSchemaVersion,
      snapshot,
      actorType,
    })
    .onConflictDoNothing({
      target: [
        appearanceRevisionsTable.appearanceId,
        appearanceRevisionsTable.version,
      ],
    })
    .returning({ appearanceId: appearanceRevisionsTable.appearanceId });

  return inserted.length === 1;
}
