import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeWriterDb, getWriterDb } from "../src/db/client";
import { appearancesTable } from "../src/db/schema";
import { appearanceImportData } from "./appearance-import-data";
import { deriveEvidenceKey } from "../src/server/appearances/source-foundation";
import { confirmAdminWrite } from "../src/server/admin/write-service";
import type {
  AdminAppearanceMutationInput,
  AdminSourceMutationInput,
} from "../src/server/admin/write-input";

const targetIds = [
  "hatsuboshi-houkago-talk-2026-09-09",
  "sugar-lies-tgs2026-special",
  "machikane-sai-talkshow-2026",
  "hikaroom-route-okinawa-osaka-1",
  "hikaroom-route-okinawa-osaka-2",
  "hikaroom-route-okinawa-osaka-3",
  "seifuku-kanojo-3",
  "fire-emblem-banshisankou",
  "sugar-lies-game",
  "hikaroom-episode-36",
  "kannahikaru-episode-15",
  "pikanono-episode-12",
  "pikanono-episode-13",
  "hatsuboshi-housoubu-episode-106",
  "oshigoto-neiro-encore-biyoushi",
  "toushindai-no-kanojo-school-stay",
  "sugar-lies-asmr-series",
];

async function main() {
  const db = getWriterDb();

  for (const id of targetIds) {
    const item = appearanceImportData.find((d) => d.id === id);
    if (!item) {
      throw new Error(`Item ${id} not found in appearanceImportData`);
    }

    const [current] = await db
      .select({ version: appearancesTable.version })
      .from(appearancesTable)
      .where(eq(appearancesTable.id, id));

    if (!current) {
      throw new Error(`Appearance ${id} not found in DB`);
    }

    let currentVersion = current.version;

    // hatsuboshi-housoubu-episode-106 needs fields update (startsAt changed)
    if (id === "hatsuboshi-housoubu-episode-106") {
      console.log(`Updating fields for ${id} (version ${currentVersion})...`);
      const updateFieldsInput: AdminAppearanceMutationInput = {
        kind: "appearance",
        operation: "update",
        appearanceId: id,
        expectedVersion: currentVersion,
        fields: {
          id: item.id,
          startsAtPrecision: item.startsAtPrecision,
          startsAt: item.startsAt ? new Date(item.startsAt).toISOString() : null,
          startsOn: item.startsOn,
          title: item.title,
          seriesId: item.seriesId,
          eventGroupId: item.eventGroupId,
          eventTitle: item.eventTitle,
          sessionLabel: item.sessionLabel,
          category: item.category,
        },
      };

      const res = await confirmAdminWrite(updateFieldsInput, randomUUID());
      if (res.status !== "approved") {
        throw new Error(`Failed to update fields for ${id}: ${res.message}`);
      }
      currentVersion = res.targets[0].version;
      console.log(`✔ Updated fields for ${id}, new version: ${currentVersion}`);
    }

    // Now update source
    console.log(`Updating source for ${id} (version ${currentVersion})...`);
    const evidenceKey = deriveEvidenceKey(item);
    const sourceMutationInput: AdminSourceMutationInput = {
      kind: "source",
      operation: "replace",
      targets: [{ appearanceId: id, expectedVersion: currentVersion }],
      source: {
        canonicalUrl: item.sourceUrl,
        sourceName: item.sourceName,
        externalItemId: item.sourceItemId,
        evidenceKey,
        precision: item.publishedAtPrecision,
        publishedAt: item.publishedAt
          ? new Date(item.publishedAt).toISOString()
          : null,
        publishedOn: item.publishedOn,
      },
    };

    const res = await confirmAdminWrite(sourceMutationInput, randomUUID());
    if (res.status !== "approved") {
      throw new Error(`Failed to update source for ${id}: ${res.message}`);
    }
    console.log(
      `✔ Successfully updated source for ${id}, new version: ${res.targets[0].version}`,
    );
  }

  console.log("All 17 appearances updated successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(closeWriterDb);
