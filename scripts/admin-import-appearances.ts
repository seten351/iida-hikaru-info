import "server-only";
import { randomUUID } from "node:crypto";
import { getWriterDb } from "../src/db/client";
import { appearancesTable, appearanceSeriesTable } from "../src/db/schema";
import { appearanceImportData } from "./appearance-import-data";
import { appearanceSeriesData } from "./appearance-series-data";
import { confirmAdminWrite } from "../src/server/admin/write-service";
import type {
  AdminAppearanceMutationInput,
  AdminSeriesMutationInput,
  AdminSourceMutationInput,
} from "../src/server/admin/write-input";

async function main() {
  const db = getWriterDb();

  // 1. Ensure all series exist
  const existingSeries = await db
    .select({
      id: appearanceSeriesTable.id,
      displayName: appearanceSeriesTable.displayName,
    })
    .from(appearanceSeriesTable);
  const existingSeriesIds = new Set(existingSeries.map((s) => s.id));

  const missingSeries = appearanceSeriesData.filter((s) => !existingSeriesIds.has(s.id));
  if (missingSeries.length > 0) {
    console.log(`Found ${missingSeries.length} series to add via Admin write.`);
    for (const s of missingSeries) {
      console.log(`Adding series ${s.id} (${s.displayName})...`);
      const input: AdminSeriesMutationInput = {
        kind: "series",
        operation: "create",
        seriesId: s.id,
        expectedVersion: null,
        displayName: s.displayName,
      };
      const res = await confirmAdminWrite(input, randomUUID());
      if (res.status !== "approved") {
        throw new Error(`Failed to add series ${s.id}: ${res.message}`);
      }
      console.log(`✔ Added series ${s.id}`);
    }
  }

  // 2. Fetch existing appearances
  const existingRows = await db
    .select({
      id: appearancesTable.id,
      version: appearancesTable.version,
      startsAtPrecision: appearancesTable.startsAtPrecision,
      startsAt: appearancesTable.startsAt,
      startsOn: appearancesTable.startsOn,
      title: appearancesTable.title,
      seriesId: appearancesTable.seriesId,
      eventGroupId: appearancesTable.eventGroupId,
      eventTitle: appearancesTable.eventTitle,
      sessionLabel: appearancesTable.sessionLabel,
      category: appearancesTable.category,
      sourceUrl: appearancesTable.sourceUrl,
      sourceName: appearancesTable.sourceName,
      sourceItemId: appearancesTable.sourceItemId,
      publishedAtPrecision: appearancesTable.publishedAtPrecision,
      publishedAt: appearancesTable.publishedAt,
      publishedOn: appearancesTable.publishedOn,
    })
    .from(appearancesTable);

  const existingMap = new Map(existingRows.map((r) => [r.id, r]));

  const toAdd = appearanceImportData.filter((item) => !existingMap.has(item.id));
  const toUpdate = appearanceImportData.filter((item) => {
    const current = existingMap.get(item.id);
    if (!current) return false;

    const currentStartsAtMs = current.startsAt ? current.startsAt.getTime() : null;
    const itemStartsAtMs = item.startsAt ? new Date(item.startsAt).getTime() : null;

    const fieldsDiff =
      current.startsAtPrecision !== item.startsAtPrecision ||
      currentStartsAtMs !== itemStartsAtMs ||
      current.startsOn !== item.startsOn ||
      current.title !== item.title ||
      current.seriesId !== item.seriesId ||
      current.eventGroupId !== item.eventGroupId ||
      current.eventTitle !== item.eventTitle ||
      current.sessionLabel !== item.sessionLabel ||
      current.category !== item.category;

    const currentPublishedAtMs = current.publishedAt ? current.publishedAt.getTime() : null;
    const itemPublishedAtMs = item.publishedAt ? new Date(item.publishedAt).getTime() : null;

    const sourceDiff =
      current.sourceUrl !== item.sourceUrl ||
      current.sourceName !== item.sourceName ||
      current.sourceItemId !== item.sourceItemId ||
      current.publishedAtPrecision !== item.publishedAtPrecision ||
      currentPublishedAtMs !== itemPublishedAtMs ||
      current.publishedOn !== item.publishedOn;

    return fieldsDiff || sourceDiff;
  });

  console.log(
    `Found ${toAdd.length} appearances to add, ${toUpdate.length} to update via Admin write.`,
  );

  for (const item of toAdd) {
    console.log(`Adding ${item.id} (${item.title})...`);
    const input: AdminAppearanceMutationInput = {
      kind: "appearance",
      operation: "create",
      expectedVersion: null,
      fields: {
        id: item.id,
        startsAtPrecision: item.startsAtPrecision,
        startsAt: item.startsAt,
        startsOn: item.startsOn,
        title: item.title,
        seriesId: item.seriesId,
        eventGroupId: item.eventGroupId,
        eventTitle: item.eventTitle,
        sessionLabel: item.sessionLabel,
        category: item.category,
      },
      source: {
        canonicalUrl: item.sourceUrl,
        sourceName: item.sourceName,
        externalItemId: item.sourceItemId,
        evidenceKey: "default",
        precision: item.publishedAtPrecision,
        publishedAt: item.publishedAt,
        publishedOn: item.publishedOn,
      },
    };

    const res = await confirmAdminWrite(input, randomUUID());
    if (res.status !== "approved") {
      throw new Error(`Failed to add ${item.id}: ${res.message}`);
    }
    console.log(`✔ Added ${item.id}`);
  }

  for (const item of toUpdate) {
    const current = existingMap.get(item.id)!;
    console.log(`Processing updates for ${item.id} (${item.title}) [version ${current.version}]...`);

    const currentStartsAtMs = current.startsAt ? current.startsAt.getTime() : null;
    const itemStartsAtMs = item.startsAt ? new Date(item.startsAt).getTime() : null;

    const fieldsDiff =
      current.startsAtPrecision !== item.startsAtPrecision ||
      currentStartsAtMs !== itemStartsAtMs ||
      current.startsOn !== item.startsOn ||
      current.title !== item.title ||
      current.seriesId !== item.seriesId ||
      current.eventGroupId !== item.eventGroupId ||
      current.eventTitle !== item.eventTitle ||
      current.sessionLabel !== item.sessionLabel ||
      current.category !== item.category;

    if (fieldsDiff) {
      console.log(`  Updating fields for ${item.id}...`);
      const input: AdminAppearanceMutationInput = {
        kind: "appearance",
        operation: "update",
        appearanceId: item.id,
        expectedVersion: current.version,
        fields: {
          id: item.id,
          startsAtPrecision: item.startsAtPrecision,
          startsAt: item.startsAt,
          startsOn: item.startsOn,
          title: item.title,
          seriesId: item.seriesId,
          eventGroupId: item.eventGroupId,
          eventTitle: item.eventTitle,
          sessionLabel: item.sessionLabel,
          category: item.category,
        },
      };

      const res = await confirmAdminWrite(input, randomUUID());
      if (res.status !== "approved") {
        throw new Error(`Failed to update fields for ${item.id}: ${res.message}`);
      }
      current.version += 1;
      console.log(`  ✔ Fields updated for ${item.id} (new version ${current.version})`);
    }

    const currentPublishedAtMs = current.publishedAt ? current.publishedAt.getTime() : null;
    const itemPublishedAtMs = item.publishedAt ? new Date(item.publishedAt).getTime() : null;

    const sourceDiff =
      current.sourceUrl !== item.sourceUrl ||
      current.sourceName !== item.sourceName ||
      current.sourceItemId !== item.sourceItemId ||
      current.publishedAtPrecision !== item.publishedAtPrecision ||
      currentPublishedAtMs !== itemPublishedAtMs ||
      current.publishedOn !== item.publishedOn;

    if (sourceDiff) {
      console.log(`  Updating primary source for ${item.id}...`);
      const sourceInput: AdminSourceMutationInput = {
        kind: "source",
        operation: "replace",
        targets: [{ appearanceId: item.id, expectedVersion: current.version }],
        source: {
          canonicalUrl: item.sourceUrl,
          sourceName: item.sourceName,
          externalItemId: item.sourceItemId,
          evidenceKey: "default",
          precision: item.publishedAtPrecision,
          publishedAt: item.publishedAt,
          publishedOn: item.publishedOn,
        },
      };

      const res = await confirmAdminWrite(sourceInput, randomUUID());
      if (res.status !== "approved") {
        throw new Error(`Failed to update source for ${item.id}: ${res.message}`);
      }
      current.version += 1;
      console.log(`  ✔ Source updated for ${item.id} (new version ${current.version})`);
    }
  }

  console.log("All series and appearances successfully processed via Admin write!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
