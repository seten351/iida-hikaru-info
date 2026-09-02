import "server-only";

import { asc, count, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  appearanceProposalsTable,
  appearanceRevisionsTable,
  appearanceSeriesRevisionsTable,
  appearanceSeriesTable,
  appearanceSourceLinksTable,
  appearancesTable,
  contentManagementStateTable,
  proposalSourceLinksTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "@/db/schema";
import { requireAdminSession } from "@/server/admin/auth";

export async function getAdminOverview() {
  await requireAdminSession();
  const db = getDb();
  const [appearances, proposals, sources, series, revisions, state] =
    await Promise.all([
      db.select({ value: count() }).from(appearancesTable),
      db.select({ value: count() }).from(appearanceProposalsTable),
      db.select({ value: count() }).from(sourceItemsTable),
      db.select({ value: count() }).from(appearanceSeriesTable),
      db.select({ value: count() }).from(appearanceRevisionsTable),
      db.select().from(contentManagementStateTable).limit(1),
    ]);

  return {
    appearances: appearances[0].value,
    proposals: proposals[0].value,
    sources: sources[0].value,
    series: series[0].value,
    revisions: revisions[0].value,
    contentMode: state[0]?.contentMode ?? "unknown",
  };
}

export async function listAdminProposals() {
  await requireAdminSession();
  return getDb()
    .select({
      id: appearanceProposalsTable.id,
      origin: appearanceProposalsTable.origin,
      operation: appearanceProposalsTable.operation,
      status: appearanceProposalsTable.status,
      matchStatus: appearanceProposalsTable.matchStatus,
      title: appearanceProposalsTable.title,
      appearanceId: appearanceProposalsTable.appearanceId,
      expectedAppearanceVersion: appearanceProposalsTable.expectedAppearanceVersion,
      updatedAt: appearanceProposalsTable.updatedAt,
      sourceCount: sql<number>`(
        select count(*)::int from proposal_source_links
        where proposal_id = ${appearanceProposalsTable.id}
      )`.mapWith(Number),
    })
    .from(appearanceProposalsTable)
    .orderBy(desc(appearanceProposalsTable.updatedAt), asc(appearanceProposalsTable.id));
}

export async function getAdminProposal(proposalId: string) {
  await requireAdminSession();
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(appearanceProposalsTable)
    .where(eq(appearanceProposalsTable.id, proposalId));
  if (!proposal) return null;

  const sourceLinks = await db
    .select({
      sourceId: proposalSourceLinksTable.sourceId,
      sourceIdentityId: proposalSourceLinksTable.sourceIdentityId,
      evidenceKey: proposalSourceLinksTable.evidenceKey,
      isPrimary: proposalSourceLinksTable.isPrimary,
      canonicalUrl: sourceItemsTable.canonicalUrl,
      sourceType: sourceItemsTable.sourceType,
      sourceName: sourceIdentitiesTable.sourceName,
      externalItemId: sourceIdentitiesTable.externalItemId,
      publishedAt: proposalSourceLinksTable.publishedAt,
      publishedOn: proposalSourceLinksTable.publishedOn,
      publishedAtPrecision: proposalSourceLinksTable.publishedAtPrecision,
      extractionConfidence: proposalSourceLinksTable.extractionConfidence,
      reviewMetadata: proposalSourceLinksTable.reviewMetadata,
    })
    .from(proposalSourceLinksTable)
    .innerJoin(
      sourceItemsTable,
      eq(proposalSourceLinksTable.sourceId, sourceItemsTable.id),
    )
    .leftJoin(
      sourceIdentitiesTable,
      eq(proposalSourceLinksTable.sourceIdentityId, sourceIdentitiesTable.id),
    )
    .where(eq(proposalSourceLinksTable.proposalId, proposalId))
    .orderBy(asc(proposalSourceLinksTable.evidenceKey));

  return { proposal, sourceLinks };
}

export async function listAdminAppearances() {
  await requireAdminSession();
  return getDb()
    .select({
      id: appearancesTable.id,
      title: appearancesTable.title,
      startsAt: appearancesTable.startsAt,
      category: appearancesTable.category,
      visibilityStatus: appearancesTable.visibilityStatus,
      version: appearancesTable.version,
      seriesName: appearanceSeriesTable.displayName,
      sourceCount: sql<number>`(
        select count(*)::int from appearance_source_links
        where appearance_id = ${appearancesTable.id}
      )`.mapWith(Number),
      revisionCount: sql<number>`(
        select count(*)::int from appearance_revisions
        where appearance_id = ${appearancesTable.id}
      )`.mapWith(Number),
    })
    .from(appearancesTable)
    .leftJoin(
      appearanceSeriesTable,
      eq(appearancesTable.seriesId, appearanceSeriesTable.id),
    )
    .orderBy(desc(appearancesTable.startsAt), asc(appearancesTable.id));
}

export async function getAdminAppearance(appearanceId: string) {
  await requireAdminSession();
  const db = getDb();
  const [appearance] = await db
    .select({
      appearance: appearancesTable,
      seriesName: appearanceSeriesTable.displayName,
    })
    .from(appearancesTable)
    .leftJoin(
      appearanceSeriesTable,
      eq(appearancesTable.seriesId, appearanceSeriesTable.id),
    )
    .where(eq(appearancesTable.id, appearanceId));
  if (!appearance) return null;

  const [sourceLinks, revisions] = await Promise.all([
    db
      .select({
        sourceId: appearanceSourceLinksTable.sourceId,
        sourceIdentityId: appearanceSourceLinksTable.sourceIdentityId,
        evidenceKey: appearanceSourceLinksTable.evidenceKey,
        active: appearanceSourceLinksTable.active,
        isPrimary: appearanceSourceLinksTable.isPrimary,
        canonicalUrl: sourceItemsTable.canonicalUrl,
        sourceType: sourceItemsTable.sourceType,
        sourceName: sourceIdentitiesTable.sourceName,
        externalItemId: sourceIdentitiesTable.externalItemId,
        publishedAt: appearanceSourceLinksTable.publishedAt,
        publishedOn: appearanceSourceLinksTable.publishedOn,
        publishedAtPrecision: appearanceSourceLinksTable.publishedAtPrecision,
        collectedAt: appearanceSourceLinksTable.collectedAt,
      })
      .from(appearanceSourceLinksTable)
      .innerJoin(
        sourceItemsTable,
        eq(appearanceSourceLinksTable.sourceId, sourceItemsTable.id),
      )
      .leftJoin(
        sourceIdentitiesTable,
        eq(appearanceSourceLinksTable.sourceIdentityId, sourceIdentitiesTable.id),
      )
      .where(eq(appearanceSourceLinksTable.appearanceId, appearanceId))
      .orderBy(desc(appearanceSourceLinksTable.isPrimary)),
    db
      .select()
      .from(appearanceRevisionsTable)
      .where(eq(appearanceRevisionsTable.appearanceId, appearanceId))
      .orderBy(desc(appearanceRevisionsTable.version)),
  ]);

  return { ...appearance, sourceLinks, revisions };
}

export async function listAdminSources() {
  await requireAdminSession();
  return getDb()
    .select({
      id: sourceItemsTable.id,
      canonicalUrl: sourceItemsTable.canonicalUrl,
      sourceType: sourceItemsTable.sourceType,
      lastCollectedAt: sourceItemsTable.lastCollectedAt,
      identityCount: sql<number>`(
        select count(*)::int from source_identities
        where source_id = ${sourceItemsTable.id}
      )`.mapWith(Number),
      appearanceCount: sql<number>`(
        select count(distinct appearance_id)::int from appearance_source_links
        where source_id = ${sourceItemsTable.id}
      )`.mapWith(Number),
      proposalCount: sql<number>`(
        select count(distinct proposal_id)::int from proposal_source_links
        where source_id = ${sourceItemsTable.id}
      )`.mapWith(Number),
    })
    .from(sourceItemsTable)
    .orderBy(desc(sourceItemsTable.lastCollectedAt), asc(sourceItemsTable.id));
}

export async function getAdminSource(sourceId: string) {
  await requireAdminSession();
  const db = getDb();
  const [source] = await db
    .select()
    .from(sourceItemsTable)
    .where(eq(sourceItemsTable.id, sourceId));
  if (!source) return null;

  const [identities, appearanceLinks, proposalLinks] = await Promise.all([
    db
      .select()
      .from(sourceIdentitiesTable)
      .where(eq(sourceIdentitiesTable.sourceId, sourceId))
      .orderBy(desc(sourceIdentitiesTable.isCanonical), asc(sourceIdentitiesTable.id)),
    db
      .select({
        appearanceId: appearanceSourceLinksTable.appearanceId,
        title: appearancesTable.title,
        evidenceKey: appearanceSourceLinksTable.evidenceKey,
        active: appearanceSourceLinksTable.active,
        isPrimary: appearanceSourceLinksTable.isPrimary,
      })
      .from(appearanceSourceLinksTable)
      .innerJoin(
        appearancesTable,
        eq(appearanceSourceLinksTable.appearanceId, appearancesTable.id),
      )
      .where(eq(appearanceSourceLinksTable.sourceId, sourceId))
      .orderBy(asc(appearanceSourceLinksTable.appearanceId)),
    db
      .select({
        proposalId: proposalSourceLinksTable.proposalId,
        status: appearanceProposalsTable.status,
        evidenceKey: proposalSourceLinksTable.evidenceKey,
        isPrimary: proposalSourceLinksTable.isPrimary,
      })
      .from(proposalSourceLinksTable)
      .innerJoin(
        appearanceProposalsTable,
        eq(proposalSourceLinksTable.proposalId, appearanceProposalsTable.id),
      )
      .where(eq(proposalSourceLinksTable.sourceId, sourceId))
      .orderBy(asc(proposalSourceLinksTable.proposalId)),
  ]);

  return { source, identities, appearanceLinks, proposalLinks };
}

export async function listAdminSeries() {
  await requireAdminSession();
  return getDb()
    .select({
      id: appearanceSeriesTable.id,
      displayName: appearanceSeriesTable.displayName,
      version: appearanceSeriesTable.version,
      updatedAt: appearanceSeriesTable.updatedAt,
      appearanceCount: sql<number>`(
        select count(*)::int from appearances
        where series_id = ${appearanceSeriesTable.id}
      )`.mapWith(Number),
      revisionCount: sql<number>`(
        select count(*)::int from appearance_series_revisions
        where series_id = ${appearanceSeriesTable.id}
      )`.mapWith(Number),
    })
    .from(appearanceSeriesTable)
    .orderBy(asc(appearanceSeriesTable.displayName));
}

export async function getAdminSeries(seriesId: string) {
  await requireAdminSession();
  const db = getDb();
  const [series] = await db
    .select()
    .from(appearanceSeriesTable)
    .where(eq(appearanceSeriesTable.id, seriesId));
  if (!series) return null;

  const [appearances, revisions] = await Promise.all([
    db
      .select({
        id: appearancesTable.id,
        title: appearancesTable.title,
        startsAt: appearancesTable.startsAt,
        visibilityStatus: appearancesTable.visibilityStatus,
        version: appearancesTable.version,
      })
      .from(appearancesTable)
      .where(eq(appearancesTable.seriesId, seriesId))
      .orderBy(desc(appearancesTable.startsAt)),
    db
      .select()
      .from(appearanceSeriesRevisionsTable)
      .where(eq(appearanceSeriesRevisionsTable.seriesId, seriesId))
      .orderBy(desc(appearanceSeriesRevisionsTable.version)),
  ]);

  return { series, appearances, revisions };
}
