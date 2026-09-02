import { and, eq, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { appearanceSeriesTable, appearancesTable } from "@/db/schema";
import {
  validateAppearanceImportItems,
  type AppearanceImportItem,
  type AppearanceSeries,
} from "@/domain/appearance";
import {
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

type ExistingAppearance = typeof appearancesTable.$inferSelect;

function sourceKey(sourceName: string, sourceItemId: string) {
  return `${sourceName}\u0000${sourceItemId}`;
}

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
    existing.sourceUrl !== incoming.sourceUrl ||
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

  const sourceConditions = items.map((item) =>
    and(
      eq(appearancesTable.sourceName, item.sourceName),
      eq(appearancesTable.sourceItemId, item.sourceItemId),
    ),
  );
  const existingRows = await getDb()
    .select()
    .from(appearancesTable)
    .where(
      or(
        inArray(
          appearancesTable.id,
          items.map((item) => item.id),
        ),
        ...sourceConditions,
      ),
    );
  const byId = new Map(existingRows.map((row) => [row.id, row]));
  const bySource = new Map(
    existingRows
      .filter(
        (row): row is ExistingAppearance & {
          sourceName: string;
          sourceItemId: string;
        } => row.sourceName !== null && row.sourceItemId !== null,
      )
      .map((row) => [sourceKey(row.sourceName, row.sourceItemId), row]),
  );

  const planItems = items.map((item): AppearanceImportPlanItem => {
    const existingById = byId.get(item.id);
    const existingBySource = bySource.get(
      sourceKey(item.sourceName, item.sourceItemId),
    );

    if (existingById && existingBySource && existingById.id !== existingBySource.id) {
      throw new Error(`${item.id}: id and source identity refer to different rows.`);
    }

    const existing = existingById ?? existingBySource;

    if (existing && existing.id !== item.id) {
      throw new Error(
        `${item.id}: source identity is already assigned to ${existing.id}.`,
      );
    }

    if (
      existing &&
      (existing.sourceName !== item.sourceName ||
        existing.sourceItemId !== item.sourceItemId)
    ) {
      throw new Error(`${item.id}: id is already assigned to another source.`);
    }

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
