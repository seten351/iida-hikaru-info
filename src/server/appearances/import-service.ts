import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  appearanceSeriesTable,
  appearanceSourceLinksTable,
  appearancesTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "@/db/schema";
import {
  validateAppearanceImportItems,
  type AppearanceImportItem,
  type AppearanceSeries,
} from "@/domain/appearance";
import {
  canonicalizeSourceUrl,
  dualWriteAppearance,
  withBootstrapImportTransaction,
} from "@/server/appearances/source-foundation";

type ImportStatus = "insert" | "update" | "unchanged";

export type AppearanceImportPlanItem = {
  id: string;
  sourceName: string;
  sourceItemId: string;
  status: ImportStatus;
};

export type AppearanceImportPlan = {
  items: AppearanceImportPlanItem[];
  counts: Record<ImportStatus, number>;
};

export type AppearanceSeriesImportPlanItem = {
  id: string;
  status: ImportStatus;
};

export type AppearanceSeriesImportPlan = {
  items: AppearanceSeriesImportPlanItem[];
  counts: Record<ImportStatus, number>;
};

type ExistingAppearance = Pick<
  typeof appearancesTable.$inferSelect,
  | "id"
  | "startsAt"
  | "title"
  | "seriesId"
  | "eventGroupId"
  | "eventTitle"
  | "sessionLabel"
  | "category"
> & {
  sourceUrl: string;
  publishedAt: Date | null;
  publishedOn: string | null;
  publishedAtPrecision: AppearanceImportItem["publishedAtPrecision"];
  sourceName: string;
  sourceItemId: string;
};

function hasContentChanged(
  existing: ExistingAppearance,
  incoming: AppearanceImportItem,
) {
  return (
    existing.startsAt.getTime() !== new Date(incoming.startsAt).getTime() ||
    existing.title !== incoming.title ||
    existing.seriesId !== incoming.seriesId ||
    existing.eventGroupId !== incoming.eventGroupId ||
    existing.eventTitle !== incoming.eventTitle ||
    existing.sessionLabel !== incoming.sessionLabel ||
    existing.category !== incoming.category ||
    existing.sourceUrl !== canonicalizeSourceUrl(incoming.sourceUrl) ||
    existing.sourceName !== incoming.sourceName ||
    existing.sourceItemId !== incoming.sourceItemId ||
    existing.publishedAtPrecision !== incoming.publishedAtPrecision ||
    (existing.publishedAt?.getTime() ?? null) !==
      (incoming.publishedAt === null
        ? null
        : new Date(incoming.publishedAt).getTime()) ||
    existing.publishedOn !== incoming.publishedOn
  );
}

export async function planAppearanceImport(
  items: readonly AppearanceImportItem[],
  series: readonly AppearanceSeries[],
): Promise<AppearanceImportPlan> {
  validateAppearanceImportItems(items, series);

  const existingRows = await getDb()
    .select({
      id: appearancesTable.id,
      startsAt: appearancesTable.startsAt,
      title: appearancesTable.title,
      seriesId: appearancesTable.seriesId,
      eventGroupId: appearancesTable.eventGroupId,
      eventTitle: appearancesTable.eventTitle,
      sessionLabel: appearancesTable.sessionLabel,
      category: appearancesTable.category,
      sourceUrl: sourceItemsTable.canonicalUrl,
      publishedAt: appearanceSourceLinksTable.publishedAt,
      publishedOn: appearanceSourceLinksTable.publishedOn,
      publishedAtPrecision: appearanceSourceLinksTable.publishedAtPrecision,
      sourceName: sourceIdentitiesTable.sourceName,
      sourceItemId: sourceIdentitiesTable.externalItemId,
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
    .innerJoin(
      sourceIdentitiesTable,
      eq(
        appearanceSourceLinksTable.sourceIdentityId,
        sourceIdentitiesTable.id,
      ),
    )
    .where(
      inArray(
        appearancesTable.id,
        items.map((item) => item.id),
      ),
    );
  const byId = new Map(existingRows.map((row) => [row.id, row]));

  const planItems = items.map((item): AppearanceImportPlanItem => {
    const existing = byId.get(item.id);

    return {
      id: item.id,
      sourceName: item.sourceName,
      sourceItemId: item.sourceItemId,
      status: existing
        ? hasContentChanged(existing, item)
          ? "update"
          : "unchanged"
        : "insert",
    };
  });

  return {
    items: planItems,
    counts: {
      insert: planItems.filter((item) => item.status === "insert").length,
      update: planItems.filter((item) => item.status === "update").length,
      unchanged: planItems.filter((item) => item.status === "unchanged").length,
    },
  };
}

export async function planAppearanceSeriesImport(
  series: readonly AppearanceSeries[],
): Promise<AppearanceSeriesImportPlan> {
  const existingRows = await getDb()
    .select()
    .from(appearanceSeriesTable)
    .where(inArray(appearanceSeriesTable.id, series.map((item) => item.id)));
  const byId = new Map(existingRows.map((row) => [row.id, row]));
  const items = series.map((item) => {
    const existing = byId.get(item.id);
    return {
      id: item.id,
      status: existing
        ? existing.displayName === item.displayName
          ? "unchanged"
          : "update"
        : "insert",
    } satisfies AppearanceSeriesImportPlanItem;
  });

  return {
    items,
    counts: {
      insert: items.filter((item) => item.status === "insert").length,
      update: items.filter((item) => item.status === "update").length,
      unchanged: items.filter((item) => item.status === "unchanged").length,
    },
  };
}

export async function applyAppearanceSeriesImport(
  series: readonly AppearanceSeries[],
  plan: AppearanceSeriesImportPlan,
) {
  const changedIds = new Set(
    plan.items
      .filter((item) => item.status !== "unchanged")
      .map((item) => item.id),
  );
  const changedSeries = series.filter((item) => changedIds.has(item.id));

  if (changedSeries.length === 0) {
    return 0;
  }

  const appliedRows = await withBootstrapImportTransaction((tx) =>
    tx
      .insert(appearanceSeriesTable)
      .values(changedSeries)
      .onConflictDoUpdate({
        target: appearanceSeriesTable.id,
        set: {
          displayName: sql`excluded.display_name`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${appearanceSeriesTable.displayName} is distinct from excluded.display_name`,
      })
      .returning({ id: appearanceSeriesTable.id }),
  );

  return appliedRows.length;
}

export async function applyAppearanceImport(
  items: readonly AppearanceImportItem[],
  plan: AppearanceImportPlan,
) {
  const changedIds = new Set(
    plan.items
      .filter((item) => item.status !== "unchanged")
      .map((item) => item.id),
  );
  const changedItems = items.filter((item) => changedIds.has(item.id));

  if (changedItems.length === 0) {
    return 0;
  }

  for (const item of changedItems) {
    await dualWriteAppearance(item);
  }

  return changedItems.length;
}
