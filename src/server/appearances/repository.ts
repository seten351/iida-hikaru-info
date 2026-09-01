import "server-only";

import { asc } from "drizzle-orm";

import { getDb } from "@/db/client";
import { appearancesTable } from "@/db/schema";
import type { Appearance } from "@/domain/appearance";

export async function getAppearancePageData(): Promise<{
  appearances: Appearance[];
  lastUpdatedAt: string | null;
}> {
  const rows = await getDb()
    .select({
      id: appearancesTable.id,
      startsAt: appearancesTable.startsAt,
      title: appearancesTable.title,
      category: appearancesTable.category,
      sourceUrl: appearancesTable.sourceUrl,
      publishedAt: appearancesTable.publishedAt,
      updatedAt: appearancesTable.updatedAt,
    })
    .from(appearancesTable)
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
      category: row.category,
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt.toISOString(),
    })),
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
  };
}
