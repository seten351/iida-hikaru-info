import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { deadlineAppearanceLinksTable, deadlineSourceLinksTable, deadlinesTable, sourceIdentitiesTable, sourceItemsTable, appearanceSeriesTable } from "@/db/schema";
import type { AdminDeadlineFields } from "@/domain/deadline";
import type { Appearance } from "@/domain/appearance";
import type { AdminSourceInput } from "@/server/admin/write-input";
import { projectPublicDeadlines } from "@/lib/deadline-projection";

export type DeadlineAdminRecord = AdminDeadlineFields & {
  version: number;
  visibilityStatus: "public" | "hidden";
  createdAt: string;
  updatedAt: string;
  source: AdminSourceInput;
  sourceUrls: string[];
  sourceEvidence: { canonicalUrl: string; evidenceKey: string }[];
  sourceUpdatedAt: string;
};

/** Internal read path for import tools. Admin UI entry points authenticate below. */
export async function readDeadlineRecords(database?: ReturnType<typeof getDb>): Promise<DeadlineAdminRecord[]> {
  const db = database ?? getDb();
  const fetchRows = async () => {
    try {
      return await db.select({ deadline: deadlinesTable, source: {
        canonicalUrl: sourceItemsTable.canonicalUrl,
        sourceName: sourceIdentitiesTable.sourceName,
        externalItemId: sourceIdentitiesTable.externalItemId,
        evidenceKey: deadlineSourceLinksTable.evidenceKey,
        precision: deadlineSourceLinksTable.publishedAtPrecision,
        publishedAt: deadlineSourceLinksTable.publishedAt,
        publishedOn: deadlineSourceLinksTable.publishedOn,
        updatedAt: sourceItemsTable.updatedAt,
        linkUpdatedAt: deadlineSourceLinksTable.updatedAt,
      } }).from(deadlinesTable)
        .innerJoin(deadlineSourceLinksTable, and(eq(deadlineSourceLinksTable.deadlineId, deadlinesTable.id), eq(deadlineSourceLinksTable.active, true), eq(deadlineSourceLinksTable.isPrimary, true)))
        .innerJoin(sourceItemsTable, eq(sourceItemsTable.id, deadlineSourceLinksTable.sourceId))
        .innerJoin(sourceIdentitiesTable, eq(sourceIdentitiesTable.id, deadlineSourceLinksTable.sourceIdentityId))
        .orderBy(desc(deadlinesTable.updatedAt), asc(deadlinesTable.id));
    } catch {
      const legacyRows = await db.select({
        deadline: {
          id: deadlinesTable.id,
          label: deadlinesTable.label,
          projectTitle: deadlinesTable.projectTitle,
          organizer: deadlinesTable.organizer,
          projectType: deadlinesTable.projectType,
          seriesId: deadlinesTable.seriesId,
          deadlinePrecision: deadlinesTable.deadlinePrecision,
          deadlineAt: deadlinesTable.deadlineAt,
          deadlineOn: deadlinesTable.deadlineOn,
          applicationUrl: deadlinesTable.applicationUrl,
          note: deadlinesTable.note,
          state: deadlinesTable.state,
          visibilityStatus: deadlinesTable.visibilityStatus,
          version: deadlinesTable.version,
          createdAt: deadlinesTable.createdAt,
          updatedAt: deadlinesTable.updatedAt,
        },
        source: {
          canonicalUrl: sourceItemsTable.canonicalUrl,
          sourceName: sourceIdentitiesTable.sourceName,
          externalItemId: sourceIdentitiesTable.externalItemId,
          evidenceKey: deadlineSourceLinksTable.evidenceKey,
          precision: deadlineSourceLinksTable.publishedAtPrecision,
          publishedAt: deadlineSourceLinksTable.publishedAt,
          publishedOn: deadlineSourceLinksTable.publishedOn,
          updatedAt: sourceItemsTable.updatedAt,
          linkUpdatedAt: deadlineSourceLinksTable.updatedAt,
        },
      }).from(deadlinesTable)
        .innerJoin(deadlineSourceLinksTable, and(eq(deadlineSourceLinksTable.deadlineId, deadlinesTable.id), eq(deadlineSourceLinksTable.active, true), eq(deadlineSourceLinksTable.isPrimary, true)))
        .innerJoin(sourceItemsTable, eq(sourceItemsTable.id, deadlineSourceLinksTable.sourceId))
        .innerJoin(sourceIdentitiesTable, eq(sourceIdentitiesTable.id, deadlineSourceLinksTable.sourceIdentityId))
        .orderBy(desc(deadlinesTable.updatedAt), asc(deadlinesTable.id));

      return legacyRows.map(row => ({
        ...row,
        deadline: {
          ...row.deadline,
          fingerprint: "" as const,
          informationType: "unspecified" as const,
          startsAtPrecision: "unknown" as const,
          startsAt: null,
          startsOn: null,
          phaseOverride: "auto" as const,
          saleMode: "initial" as const,
        },
      }));
    }
  };

  const [rows, targets, sources] = await Promise.all([
    fetchRows(),
    db.select().from(deadlineAppearanceLinksTable).orderBy(asc(deadlineAppearanceLinksTable.appearanceId)),
    db.select({ deadlineId: deadlineSourceLinksTable.deadlineId, url: sourceItemsTable.canonicalUrl, evidenceKey: deadlineSourceLinksTable.evidenceKey })
      .from(deadlineSourceLinksTable).innerJoin(sourceItemsTable, eq(sourceItemsTable.id, deadlineSourceLinksTable.sourceId))
      .where(eq(deadlineSourceLinksTable.active, true)).orderBy(desc(deadlineSourceLinksTable.isPrimary), asc(sourceItemsTable.canonicalUrl)),
  ]);
  return rows.map(({ deadline, source }) => ({
    id: deadline.id, label: deadline.label, projectTitle: deadline.projectTitle, organizer: deadline.organizer,
    projectType: deadline.projectType, seriesId: deadline.seriesId, deadlinePrecision: deadline.deadlinePrecision,
    deadlineAt: deadline.deadlineAt?.toISOString() ?? null, deadlineOn: deadline.deadlineOn,
    applicationUrl: deadline.applicationUrl, note: deadline.note, state: deadline.state,
    informationType: deadline.informationType, startsAtPrecision: deadline.startsAtPrecision,
    startsAt: deadline.startsAt?.toISOString() ?? null, startsOn: deadline.startsOn,
    phaseOverride: deadline.phaseOverride, saleMode: deadline.saleMode,
    appearanceIds: targets.filter(link => link.deadlineId === deadline.id).map(link => link.appearanceId),
    version: deadline.version, visibilityStatus: deadline.visibilityStatus,
    createdAt: deadline.createdAt.toISOString(), updatedAt: deadline.updatedAt.toISOString(),
    source: { canonicalUrl: source.canonicalUrl, sourceName: source.sourceName, externalItemId: source.externalItemId,
      evidenceKey: source.evidenceKey, precision: source.precision, publishedAt: source.publishedAt?.toISOString() ?? null, publishedOn: source.publishedOn },
    sourceUrls: [...new Set(sources.filter(link => link.deadlineId === deadline.id).map(link => link.url))],
    sourceEvidence: sources.filter(link => link.deadlineId === deadline.id).map(link => ({ canonicalUrl: link.url, evidenceKey: link.evidenceKey })),
    sourceUpdatedAt: new Date(Math.max(source.updatedAt.getTime(), source.linkUpdatedAt.getTime())).toISOString(),
  }));
}

export async function getPublicDeadlineData(appearances: Appearance[], database?: ReturnType<typeof getDb>) {
  const db = database ?? getDb();
  const [records, series] = await Promise.all([readDeadlineRecords(db), db.select({ id: appearanceSeriesTable.id, displayName: appearanceSeriesTable.displayName }).from(appearanceSeriesTable)]);
  const deadlines = projectPublicDeadlines(records, appearances, series);
  const visibleIds = new Set(deadlines.map(item => item.id));
  const dates = records.filter(item => visibleIds.has(item.id)).flatMap(item => [item.updatedAt, item.sourceUpdatedAt]);
  return { deadlines, lastUpdatedAt: dates.length ? dates.sort().at(-1)! : null };
}
