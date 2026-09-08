import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

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
      startsOn: appearancesTable.startsOn,
      startsAtPrecision: appearancesTable.startsAtPrecision,
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
    .orderBy(asc(appearancesTable.id));

  // Publication metadata intentionally comes from the active primary link above.
  // Fetch all active links separately so secondary sources do not affect it.
  const activeSources = await getDb()
    .select({
      appearanceId: appearanceSourceLinksTable.appearanceId,
      sourceUrl: sourceItemsTable.canonicalUrl,
    })
    .from(appearanceSourceLinksTable)
    .innerJoin(
      appearancesTable,
      eq(appearanceSourceLinksTable.appearanceId, appearancesTable.id),
    )
    .innerJoin(
      sourceItemsTable,
      eq(appearanceSourceLinksTable.sourceId, sourceItemsTable.id),
    )
    .where(
      and(
        eq(appearanceSourceLinksTable.active, true),
        publicAppearanceCondition,
      ),
    )
    .orderBy(
      asc(appearanceSourceLinksTable.appearanceId),
      desc(appearanceSourceLinksTable.isPrimary),
      asc(sourceItemsTable.canonicalUrl),
    );

  const sourceUrlsByAppearanceId = new Map<string, string[]>();
  for (const source of activeSources) {
    const urls = sourceUrlsByAppearanceId.get(source.appearanceId) ?? [];
    if (!urls.includes(source.sourceUrl)) {
      urls.push(source.sourceUrl);
      sourceUrlsByAppearanceId.set(source.appearanceId, urls);
    }
  }

  const lastUpdatedAt = rows.reduce<Date | null>(
    (latest, row) =>
      latest === null || row.updatedAt > latest ? row.updatedAt : latest,
    null,
  );

  return {
    appearances: rows.map((row) => ({
      id: row.id,
      startsAt: row.startsAt?.toISOString() ?? null,
      startsOn: row.startsOn,
      startsAtPrecision: row.startsAtPrecision,
      title: row.title,
      seriesId: row.seriesId,
      seriesName: row.seriesName,
      eventGroupId: row.eventGroupId,
      eventTitle: row.eventTitle,
      sessionLabel: row.sessionLabel,
      category: row.category,
      sourceUrls: sourceUrlsByAppearanceId.get(row.id) ?? [row.sourceUrl],
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publishedOn: row.publishedOn,
      publishedAtPrecision: row.publishedAtPrecision,
      collectedAt: row.collectedAt.toISOString(),
    })),
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
  };
}
