import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  appearanceSeriesTable,
  appearanceSourceLinksTable,
  appearancesTable,
  sourceItemsTable,
} from "@/db/schema";
import type { Appearance } from "@/domain/appearance";
import { publicAppearanceCondition } from "@/server/appearances/visibility";

export async function getAppearancePageData(): Promise<{
  appearances: Appearance[];
  lastUpdatedAt: string | null;
}> {
  const rows = await getDb()
    .select({
      id: appearancesTable.id,
      startsAt: appearancesTable.startsAt,
      title: appearancesTable.title,
      seriesId: appearancesTable.seriesId,
      seriesName: appearanceSeriesTable.displayName,
      eventGroupId: appearancesTable.eventGroupId,
      eventTitle: appearancesTable.eventTitle,
      sessionLabel: appearancesTable.sessionLabel,
      category: appearancesTable.category,
      sourceUrl: sourceItemsTable.canonicalUrl,
      publishedAt: appearanceSourceLinksTable.publishedAt,
      publishedOn: appearanceSourceLinksTable.publishedOn,
      publishedAtPrecision: appearanceSourceLinksTable.publishedAtPrecision,
      collectedAt: appearanceSourceLinksTable.collectedAt,
      updatedAt: sql<Date>`greatest(
          ${appearancesTable.updatedAt},
          ${appearanceSourceLinksTable.updatedAt},
          ${sourceItemsTable.updatedAt}
        )`.mapWith(appearancesTable.updatedAt),
    })
    .from(appearancesTable)
    .innerJoin(
      appearanceSourceLinksTable,
      and(
        eq(appearanceSourceLinksTable.appearanceId, appearancesTable.id),
        eq(appearanceSourceLinksTable.active, true),
        eq(appearanceSourceLinksTable.isPrimary, true),
      ),
    )
    .innerJoin(
      sourceItemsTable,
      eq(appearanceSourceLinksTable.sourceId, sourceItemsTable.id),
    )
    .leftJoin(
      appearanceSeriesTable,
      eq(appearancesTable.seriesId, appearanceSeriesTable.id),
    )
    .where(publicAppearanceCondition)
    .orderBy(asc(appearancesTable.startsAt), asc(appearancesTable.id));

  const lastUpdatedAt = rows.reduce<Date | null>(
    (latest, row) =>
      latest === null || row.updatedAt > latest ? row.updatedAt : latest,
    null,
  );

  return {
    appearances: rows.map((row) => ({
      id: row.id,
      startsAt: row.startsAt.toISOString(),
      title: row.title,
      seriesId: row.seriesId,
      seriesName: row.seriesName,
      eventGroupId: row.eventGroupId,
      eventTitle: row.eventTitle,
      sessionLabel: row.sessionLabel,
      category: row.category,
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publishedOn: row.publishedOn,
      publishedAtPrecision: row.publishedAtPrecision,
      collectedAt: row.collectedAt.toISOString(),
    })),
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
  };
}
