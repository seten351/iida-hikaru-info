import "server-only";

import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { appearanceSeriesTable, appearancesTable } from "@/db/schema";
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
      sourceUrl: appearancesTable.sourceUrl,
      publishedAt: appearancesTable.publishedAt,
      publishedOn: appearancesTable.publishedOn,
      publishedAtPrecision: appearancesTable.publishedAtPrecision,
      collectedAt: appearancesTable.collectedAt,
      updatedAt: appearancesTable.updatedAt,
    })
    .from(appearancesTable)
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
