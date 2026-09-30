import "server-only";

import { asc, desc, eq, or } from "drizzle-orm";

import { closeWriterDb, getWriterDb } from "../src/db/client";
import {
  appearanceSourceLinksTable,
  appearancesTable,
  appearanceProposalsTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "../src/db/schema";
import { AdminWriteValidationError } from "../src/server/admin/write-input";
import {
  confirmAdminWrite,
  validateAdminWritePreview,
} from "../src/server/admin/write-service";
import {
  parsePublicationImportArgs,
  readPublicationOperationFile,
  runPublicationOperation,
  type PublicationAppearanceSnapshot,
} from "./admin-publication-operation";

async function readAppearance(
  appearanceId: string,
): Promise<PublicationAppearanceSnapshot | null> {
  const db = getWriterDb();
  const [appearance] = await db
    .select({
      id: appearancesTable.id,
      title: appearancesTable.title,
      category: appearancesTable.category,
      version: appearancesTable.version,
      visibilityStatus: appearancesTable.visibilityStatus,
      precision: appearancesTable.publishedAtPrecision,
      publishedAt: appearancesTable.publishedAt,
      publishedOn: appearancesTable.publishedOn,
    })
    .from(appearancesTable)
    .where(eq(appearancesTable.id, appearanceId));
  if (!appearance) return null;

  const links = await db
    .select({
      sourceId: appearanceSourceLinksTable.sourceId,
      evidenceKey: appearanceSourceLinksTable.evidenceKey,
      active: appearanceSourceLinksTable.active,
      isPrimary: appearanceSourceLinksTable.isPrimary,
      canonicalUrl: sourceItemsTable.canonicalUrl,
      sourceName: sourceIdentitiesTable.sourceName,
      externalItemId: sourceIdentitiesTable.externalItemId,
      precision: appearanceSourceLinksTable.publishedAtPrecision,
      publishedAt: appearanceSourceLinksTable.publishedAt,
      publishedOn: appearanceSourceLinksTable.publishedOn,
    })
    .from(appearanceSourceLinksTable)
    .innerJoin(sourceItemsTable, eq(appearanceSourceLinksTable.sourceId, sourceItemsTable.id))
    .leftJoin(
      sourceIdentitiesTable,
      eq(appearanceSourceLinksTable.sourceIdentityId, sourceIdentitiesTable.id),
    )
    .where(eq(appearanceSourceLinksTable.appearanceId, appearanceId))
    .orderBy(
      desc(appearanceSourceLinksTable.active),
      desc(appearanceSourceLinksTable.isPrimary),
      asc(appearanceSourceLinksTable.evidenceKey),
    );

  return {
    id: appearance.id,
    title: appearance.title,
    category: appearance.category,
    version: appearance.version,
    visibilityStatus: appearance.visibilityStatus,
    publication: {
      precision: appearance.precision,
      publishedAt: appearance.publishedAt?.toISOString() ?? null,
      publishedOn: appearance.publishedOn,
    },
    sourceLinks: links.map((link) => ({
      ...link,
      publishedAt: link.publishedAt?.toISOString() ?? null,
    })),
  };
}

async function hasReplay(idempotencyKey: string): Promise<boolean> {
  const [proposal] = await getWriterDb()
    .select({ id: appearanceProposalsTable.id })
    .from(appearanceProposalsTable)
    .where(
      or(
        eq(appearanceProposalsTable.idempotencyKey, idempotencyKey),
        eq(appearanceProposalsTable.adminBatchId, idempotencyKey),
      ),
    )
    .limit(1);
  return Boolean(proposal);
}

async function main() {
  try {
    const options = parsePublicationImportArgs(process.argv.slice(2));
    await runPublicationOperation(
      await readPublicationOperationFile(options.inputPath!),
      options,
      {
        readAppearance,
        hasReplay,
        validatePreview: validateAdminWritePreview,
        confirm: confirmAdminWrite,
        log: console.log,
      },
    );
  } finally {
    await closeWriterDb();
  }
}

main().catch((error) => {
  if (error instanceof AdminWriteValidationError) {
    console.error("Publication import failed:", error.message);
  } else {
    console.error("Publication import failed due to an unexpected error. Database details are hidden.");
  }
  process.exitCode = 1;
});
