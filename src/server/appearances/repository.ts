import "server-only";

import { asc } from "drizzle-orm";

import { getDb } from "@/db/client";
import { appearancesTable } from "@/db/schema";
import type { Appearance } from "@/domain/appearance";

export async function listAppearances(): Promise<Appearance[]> {
  const rows = await getDb()
    .select({
      id: appearancesTable.id,
      startsAt: appearancesTable.startsAt,
      title: appearancesTable.title,
      category: appearancesTable.category,
      sourceUrl: appearancesTable.sourceUrl,
      publishedAt: appearancesTable.publishedAt,
    })
    .from(appearancesTable)
    .orderBy(asc(appearancesTable.startsAt), asc(appearancesTable.id));

  return rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    title: row.title,
    category: row.category,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt.toISOString(),
  }));
}
