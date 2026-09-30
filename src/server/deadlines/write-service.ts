import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { deadlinesTable, deadlineAppearanceLinksTable, deadlineSourceLinksTable, deadlineProposalsTable, deadlineRevisionsTable, appearancesTable, appearanceSeriesTable, sourceItemsTable, sourceIdentitiesTable } from "@/db/schema";
import { deadlineFingerprint } from "@/domain/deadline";
import { AdminWriteValidationError, type AdminDeadlineMutationInput } from "@/server/admin/write-input";
import { upsertAdminSource, type AdminWriteResult } from "@/server/admin/write-service";
import type { WriterTransaction } from "@/server/appearances/source-foundation";

class DeadlineVersionConflict extends AdminWriteValidationError {}
function proposalId(key: string) { return `dlp_${createHash("sha256").update(key).digest("hex").slice(0, 32)}`; }
function targetId(input: AdminDeadlineMutationInput) { return input.operation === "create" ? input.fields.id : input.deadlineId; }

export async function readDeadlineReplay(tx: WriterTransaction, key: string, hash: string): Promise<AdminWriteResult | null> {
  const [proposal] = await tx.select().from(deadlineProposalsTable).where(eq(deadlineProposalsTable.idempotencyKey, key));
  if (!proposal) return null;
  if (proposal.reviewedContentHash !== hash) throw new AdminWriteValidationError("同じ確定キーに異なる変更内容は指定できません。");
  if (proposal.status === "approved") {
    const [revision] = await tx.select().from(deadlineRevisionsTable).where(eq(deadlineRevisionsTable.proposalId, proposal.id));
    if (!revision) throw new Error("確定済み締切の変更履歴がありません。");
    return { status: "approved", proposalIds: [proposal.id], targets: [{ id: proposal.targetDeadlineId, version: revision.version }], replayed: true };
  }
  if (proposal.status !== "rejected" && proposal.status !== "superseded") throw new Error("締切提案の確定状態が不正です。");
  return { status: proposal.status, proposalIds: [proposal.id], message: proposal.reviewNote ?? "変更を確定できませんでした。", replayed: true };
}

export async function validateDeadlineWrite(tx: WriterTransaction, input: AdminDeadlineMutationInput) {
  const id = targetId(input);
  const [current] = await tx.select().from(deadlinesTable).where(eq(deadlinesTable.id, id)).for("update");
  if (input.operation === "create" && current) throw new AdminWriteValidationError("同じIDの締切が既に存在します。");
  if (input.operation !== "create") {
    if (!current) throw new AdminWriteValidationError("締切が存在しません。");
    if (current.version !== input.expectedVersion) throw new DeadlineVersionConflict("締切のversionが更新されています。最新の内容からやり直してください。");
  }
  if (input.operation === "create" || input.operation === "update") {
    const fields = input.fields;
    if (fields.seriesId) {
      const [series] = await tx.select({ id: appearanceSeriesTable.id }).from(appearanceSeriesTable).where(eq(appearanceSeriesTable.id, fields.seriesId));
      if (!series) throw new AdminWriteValidationError("指定されたシリーズが存在しません。");
    }
    if (fields.appearanceIds.length) {
      const targets = await tx.select().from(appearancesTable).where(inArray(appearancesTable.id, fields.appearanceIds)).orderBy(asc(appearancesTable.id)).for("update");
      if (targets.length !== fields.appearanceIds.length) throw new AdminWriteValidationError("関連出演が存在しません。");
      const first = targets[0];
      if (targets.length > 1 && (!first.eventGroupId || targets.some(item => item.eventGroupId !== first.eventGroupId || item.seriesId !== first.seriesId || item.category !== first.category || item.eventTitle !== first.eventTitle))) {
        throw new AdminWriteValidationError("共通締切には同じイベントの公演を指定してください。");
      }
    }
    const [duplicate] = await tx.select({ id: deadlinesTable.id }).from(deadlinesTable)
      .where(and(eq(deadlinesTable.fingerprint, deadlineFingerprint(fields)), ne(deadlinesTable.id, id)));
    if (duplicate) throw new AdminWriteValidationError(`同じ企画・受付の締切が既に存在します（${duplicate.id}）。既存情報を更新してください。`);
    const [sourceDuplicate] = await tx.select({ id: deadlineSourceLinksTable.deadlineId }).from(deadlineSourceLinksTable)
      .innerJoin(sourceItemsTable, eq(sourceItemsTable.id, deadlineSourceLinksTable.sourceId))
      .where(and(eq(sourceItemsTable.canonicalUrl, input.source.canonicalUrl), eq(deadlineSourceLinksTable.evidenceKey, input.source.evidenceKey),
        eq(deadlineSourceLinksTable.active, true), ne(deadlineSourceLinksTable.deadlineId, id)));
    if (sourceDuplicate) throw new AdminWriteValidationError(`同じ告知・受付識別子が既に存在します（${sourceDuplicate.id}）。別の受付段階ならevidence keyを区別してください。`);
    const [identity] = await tx.select({ canonicalUrl: sourceItemsTable.canonicalUrl }).from(sourceIdentitiesTable)
      .innerJoin(sourceItemsTable, eq(sourceItemsTable.id, sourceIdentitiesTable.sourceId))
      .where(and(eq(sourceIdentitiesTable.sourceName, input.source.sourceName), eq(sourceIdentitiesTable.externalItemId, input.source.externalItemId)));
    if (identity && identity.canonicalUrl !== input.source.canonicalUrl) throw new AdminWriteValidationError("source identityは別のcanonical sourceに属しています。");
  }
  return current;
}

async function insertProposal(tx: WriterTransaction, input: AdminDeadlineMutationInput, key: string, hash: string, status: "approved" | "rejected" | "superseded", note: string | null = null) {
  const id = proposalId(key);
  const [existing] = await tx.select({ id: deadlinesTable.id }).from(deadlinesTable).where(eq(deadlinesTable.id, targetId(input)));
  await tx.insert(deadlineProposalsTable).values({ id, deadlineId: existing?.id ?? null,
    targetDeadlineId: targetId(input), operation: input.operation, status,
    expectedVersion: input.expectedVersion, input: { ...input }, reviewedContentHash: hash, idempotencyKey: key, reviewNote: note,
  });
  return id;
}

export async function rejectDeadlineWrite(tx: WriterTransaction, input: AdminDeadlineMutationInput, key: string, hash: string): Promise<AdminWriteResult> {
  const message = "previewを破棄しました。";
  const id = await insertProposal(tx, input, key, hash, "rejected", message);
  return { status: "rejected", proposalIds: [id], message, replayed: false };
}

export async function confirmDeadlineWrite(tx: WriterTransaction, input: AdminDeadlineMutationInput, key: string, hash: string): Promise<AdminWriteResult> {
  let current: Awaited<ReturnType<typeof validateDeadlineWrite>>;
  try { current = await validateDeadlineWrite(tx, input); }
  catch (error) {
    if (!(error instanceof AdminWriteValidationError)) throw error;
    const status = error instanceof DeadlineVersionConflict ? "superseded" : "rejected";
    const proposal = await insertProposal(tx, input, key, hash, status, error.message);
    return { status, proposalIds: [proposal], message: error.message, replayed: false };
  }
  const id = targetId(input);
  const now = new Date();
  const version = current ? current.version + 1 : 1;
  if (input.operation === "create" || input.operation === "update") {
    const { appearanceIds, ...fields } = input.fields;
    const values = { ...fields, deadlineAt: fields.deadlineAt ? new Date(fields.deadlineAt) : null,
      fingerprint: deadlineFingerprint(input.fields), version, updatedAt: now };
    if (input.operation === "create") await tx.insert(deadlinesTable).values(values);
    else await tx.update(deadlinesTable).set(values).where(eq(deadlinesTable.id, id));
    await tx.delete(deadlineAppearanceLinksTable).where(eq(deadlineAppearanceLinksTable.deadlineId, id));
    if (appearanceIds.length) await tx.insert(deadlineAppearanceLinksTable).values(appearanceIds.map(appearanceId => ({ deadlineId: id, appearanceId })));
    const source = await upsertAdminSource(tx, input.source, now);
    await tx.update(deadlineSourceLinksTable).set({ active: false, isPrimary: false, updatedAt: now }).where(eq(deadlineSourceLinksTable.deadlineId, id));
    const link = { deadlineId: id, ...source, evidenceKey: input.source.evidenceKey, active: true, isPrimary: true,
      publishedAtPrecision: input.source.precision, publishedAt: input.source.publishedAt ? new Date(input.source.publishedAt) : null,
      publishedOn: input.source.publishedOn, updatedAt: now };
    // canonicalUrl belongs to source_items, not the link record.
    const { canonicalUrl: _canonicalUrl, ...linkValues } = link;
    void _canonicalUrl;
    await tx.insert(deadlineSourceLinksTable).values(linkValues).onConflictDoUpdate({
      target: [deadlineSourceLinksTable.deadlineId, deadlineSourceLinksTable.sourceId, deadlineSourceLinksTable.evidenceKey], set: linkValues,
    });
  } else {
    await tx.update(deadlinesTable).set({ visibilityStatus: input.operation === "hide" ? "hidden" : "public", version, updatedAt: now }).where(eq(deadlinesTable.id, id));
  }
  const proposal = await insertProposal(tx, input, key, hash, "approved");
  const [deadline] = await tx.select().from(deadlinesTable).where(eq(deadlinesTable.id, id));
  const [appearanceLinks, sourceLinks] = await Promise.all([
    tx.select().from(deadlineAppearanceLinksTable).where(eq(deadlineAppearanceLinksTable.deadlineId, id)).orderBy(asc(deadlineAppearanceLinksTable.appearanceId)),
    tx.select({ link: deadlineSourceLinksTable, source: sourceItemsTable, identity: sourceIdentitiesTable })
      .from(deadlineSourceLinksTable).innerJoin(sourceItemsTable, eq(sourceItemsTable.id, deadlineSourceLinksTable.sourceId))
      .innerJoin(sourceIdentitiesTable, eq(sourceIdentitiesTable.id, deadlineSourceLinksTable.sourceIdentityId))
      .where(eq(deadlineSourceLinksTable.deadlineId, id)).orderBy(asc(deadlineSourceLinksTable.sourceId), asc(deadlineSourceLinksTable.evidenceKey)),
  ]);
  const snapshot = JSON.parse(JSON.stringify({ deadline, appearanceIds: appearanceLinks.map(item => item.appearanceId), sourceLinks })) as Record<string, unknown>;
  await tx.insert(deadlineRevisionsTable).values({ id: `dlr_${id}_${version}`, deadlineId: id, proposalId: proposal, version, snapshotSchemaVersion: 1, snapshot });
  return { status: "approved", proposalIds: [proposal], targets: [{ id, version }], replayed: false };
}
