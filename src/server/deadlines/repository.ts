import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { deadlineProposalsTable, deadlineRevisionsTable, appearancesTable } from "@/db/schema";
import { requireAdminSession } from "@/server/admin/auth";
import { readDeadlineRecords } from "./record-reader";
export { readDeadlineRecords, getPublicDeadlineData, type DeadlineAdminRecord } from "./record-reader";

export async function listAdminDeadlines() {
  await requireAdminSession();
  return readDeadlineRecords();
}

export async function getAdminDeadline(id: string) {
  await requireAdminSession();
  const deadline = (await readDeadlineRecords()).find(item => item.id === id);
  if (!deadline) return null;
  const [revisions, proposals] = await Promise.all([
    getDb().select({ revision: deadlineRevisionsTable, operation: deadlineProposalsTable.operation })
      .from(deadlineRevisionsTable).innerJoin(deadlineProposalsTable, eq(deadlineProposalsTable.id, deadlineRevisionsTable.proposalId))
      .where(eq(deadlineRevisionsTable.deadlineId, id)).orderBy(desc(deadlineRevisionsTable.version)),
    getDb().select().from(deadlineProposalsTable).where(eq(deadlineProposalsTable.targetDeadlineId, id)).orderBy(desc(deadlineProposalsTable.createdAt)),
  ]);
  return { deadline, source: deadline.source,
    revisions: revisions.map(({ revision, operation }) => ({ ...revision, operation, actorType: "admin" as const, createdAt: revision.createdAt.toISOString() })),
    proposals: proposals.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), reviewedAt: item.reviewedAt.toISOString() })),
  };
}

export async function getAdminDeadlineProposal(id: string) {
  await requireAdminSession();
  const [proposal] = await getDb().select().from(deadlineProposalsTable).where(eq(deadlineProposalsTable.id, id));
  return proposal ? { ...proposal, createdAt: proposal.createdAt.toISOString(), reviewedAt: proposal.reviewedAt.toISOString() } : null;
}

export async function listDeadlineAppearanceOptions() {
  await requireAdminSession();
  return getDb().select({ id: appearancesTable.id, title: appearancesTable.title, eventGroupId: appearancesTable.eventGroupId,
    eventTitle: appearancesTable.eventTitle, sessionLabel: appearancesTable.sessionLabel, seriesId: appearancesTable.seriesId,
    category: appearancesTable.category, version: appearancesTable.version, visibilityStatus: appearancesTable.visibilityStatus,
  }).from(appearancesTable).orderBy(asc(appearancesTable.title), asc(appearancesTable.id));
}
