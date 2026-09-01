import { and, eq, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { appearancesTable } from "@/db/schema";
import {
  validateAppearanceImportItems,
  type AppearanceImportItem,
} from "@/domain/appearance";

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
    existing.eventGroupId !== incoming.eventGroupId ||
    existing.eventTitle !== incoming.eventTitle ||
    existing.sessionLabel !== incoming.sessionLabel ||
    existing.category !== incoming.category ||
    existing.sourceUrl !== incoming.sourceUrl ||
    existing.publishedAt.getTime() !== new Date(incoming.publishedAt).getTime()
  );
}

export async function planAppearanceImport(
  items: readonly AppearanceImportItem[],
): Promise<AppearanceImportPlan> {
  validateAppearanceImportItems(items);

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

  const rows = changedItems.map((item) => ({
    id: item.id,
    startsAt: new Date(item.startsAt),
    title: item.title,
    eventGroupId: item.eventGroupId,
    eventTitle: item.eventTitle,
    sessionLabel: item.sessionLabel,
    category: item.category,
    sourceUrl: item.sourceUrl,
    publishedAt: new Date(item.publishedAt),
    sourceName: item.sourceName,
    sourceItemId: item.sourceItemId,
    collectedAt: new Date(),
  }));

  const appliedRows = await getDb()
    .insert(appearancesTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [appearancesTable.sourceName, appearancesTable.sourceItemId],
      targetWhere: sql`${appearancesTable.sourceName} is not null and ${appearancesTable.sourceItemId} is not null`,
      set: {
        startsAt: sql`excluded.starts_at`,
        title: sql`excluded.title`,
        eventGroupId: sql`excluded.event_group_id`,
        eventTitle: sql`excluded.event_title`,
        sessionLabel: sql`excluded.session_label`,
        category: sql`excluded.category`,
        sourceUrl: sql`excluded.source_url`,
        publishedAt: sql`excluded.published_at`,
        collectedAt: sql`now()`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${appearancesTable.startsAt} is distinct from excluded.starts_at
        or ${appearancesTable.title} is distinct from excluded.title
        or ${appearancesTable.eventGroupId} is distinct from excluded.event_group_id
        or ${appearancesTable.eventTitle} is distinct from excluded.event_title
        or ${appearancesTable.sessionLabel} is distinct from excluded.session_label
        or ${appearancesTable.category} is distinct from excluded.category
        or ${appearancesTable.sourceUrl} is distinct from excluded.source_url
        or ${appearancesTable.publishedAt} is distinct from excluded.published_at`,
    })
    .returning({ id: appearancesTable.id });

  return appliedRows.length;
}
