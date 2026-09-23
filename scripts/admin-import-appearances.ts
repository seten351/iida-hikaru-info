import "server-only";
import { randomUUID } from "node:crypto";
import { getWriterDb } from "../src/db/client";
import { appearancesTable } from "../src/db/schema";
import { appearanceImportData } from "./appearance-import-data";
import { confirmAdminWrite } from "../src/server/admin/write-service";
import type { AdminAppearanceMutationInput } from "../src/server/admin/write-input";

async function main() {
  const db = getWriterDb();
  const existingRows = await db.select({ id: appearancesTable.id }).from(appearancesTable);
  const existingIds = new Set(existingRows.map((r) => r.id));

  const toAdd = appearanceImportData.filter((item) => !existingIds.has(item.id));
  console.log(`Found ${toAdd.length} appearances to add via Admin write.`);

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

  console.log("All appearances successfully added via Admin write!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
