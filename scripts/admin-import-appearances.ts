import "server-only";
import { randomUUID } from "node:crypto";
import { getWriterDb } from "../src/db/client";
import { appearancesTable } from "../src/db/schema";
import { appearanceImportData } from "./appearance-import-data";
import { confirmAdminWrite } from "../src/server/admin/write-service";
import type { AdminAppearanceMutationInput } from "../src/server/admin/write-input";

async function main() {
  const db = getWriterDb();
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
    })
    .from(appearancesTable);

  const existingMap = new Map(existingRows.map((r) => [r.id, r]));

  const toAdd = appearanceImportData.filter((item) => !existingMap.has(item.id));
  const toUpdate = appearanceImportData.filter((item) => {
    const current = existingMap.get(item.id);
    if (!current) return false;

    const currentStartsAtMs = current.startsAt ? current.startsAt.getTime() : null;
    const itemStartsAtMs = item.startsAt ? new Date(item.startsAt).getTime() : null;

    return (
      current.startsAtPrecision !== item.startsAtPrecision ||
      currentStartsAtMs !== itemStartsAtMs ||
      current.startsOn !== item.startsOn ||
      current.title !== item.title ||
      current.seriesId !== item.seriesId ||
      current.eventGroupId !== item.eventGroupId ||
      current.eventTitle !== item.eventTitle ||
      current.sessionLabel !== item.sessionLabel ||
      current.category !== item.category
    );
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
    console.log(`Updating ${item.id} (${item.title}) [current version ${current.version}]...`);
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
      throw new Error(`Failed to update ${item.id}: ${res.message}`);
    }
    console.log(`✔ Updated ${item.id}`);
  }

  console.log("All appearances successfully processed via Admin write!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
