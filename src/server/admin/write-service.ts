import "server-only";

import { createHash } from "node:crypto";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { getWriterDb } from "@/db/client";
import {
  appearanceProposalsTable,
  appearanceRevisionsTable,
  appearanceSeriesProposalsTable,
  appearanceSeriesRevisionsTable,
  appearanceSeriesTable,
  appearanceSourceLinksTable,
  appearancesTable,
  contentManagementStateTable,
  proposalSourceLinksTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "@/db/schema";
import {
  buildAppearanceRevisionSnapshotV3,
  currentAppearanceSnapshotSchemaVersion,
} from "@/server/appearances/revisions";
import {
  canonicalizeSourceUrl,
  inferSourceType,
  type WriterTransaction,
} from "@/server/appearances/source-foundation";

import {
  AdminWriteValidationError,
  parseAdminWriteInput,
  type AdminAppearanceFields,
  type AdminAppearanceGroupMutationInput,
  type AdminSourceInput,
  type AdminSourceMutationInput,
  type AdminWriteInput,
} from "./write-input";

type ApprovedResult = {
  status: "approved";
  proposalIds: string[];
  targets: Array<{ id: string; version: number }>;
  replayed: boolean;
};

type RefusedResult = {
  status: "rejected" | "superseded";
  proposalIds: string[];
  message: string;
  replayed: boolean;
};

export type AdminWriteResult = ApprovedResult | RefusedResult;

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function contentHash(input: AdminWriteInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function proposalId(key: string) {
  return stableId("prp", key);
}

async function lockMutation(tx: WriterTransaction, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

async function assertContentState(tx: WriterTransaction, requireWriteMode = false) {
  const [state] = await tx
    .select()
    .from(contentManagementStateTable)
    .where(eq(contentManagementStateTable.id, "singleton"))
    .for("update");
  if (!state) throw new AdminWriteValidationError("content management stateがありません。");
  if (
    requireWriteMode &&
    (state.contentMode !== "admin" ||
      state.adminActivatedAt === null ||
      state.legacyImportLockedAt === null ||
      state.adminActivatedAt.getTime() !== state.legacyImportLockedAt.getTime())
  ) {
    throw new AdminWriteValidationError("Admin activationが完了していないため変更を確定できません。");
  }
  if (
    state.contentMode === "bootstrap" &&
    (state.adminActivatedAt !== null || state.legacyImportLockedAt !== null)
  ) {
    throw new AdminWriteValidationError("bootstrap状態とactivation状態が矛盾しています。");
  }
  if (
    state.contentMode === "admin" &&
    (state.adminActivatedAt === null ||
      state.legacyImportLockedAt === null ||
      state.adminActivatedAt.getTime() !== state.legacyImportLockedAt.getTime())
  ) {
    throw new AdminWriteValidationError("Admin activation状態が矛盾しています。");
  }
  return state;
}

async function validateSeries(tx: WriterTransaction, seriesId: string | null) {
  if (!seriesId) return;
  const [series] = await tx
    .select({ id: appearanceSeriesTable.id })
    .from(appearanceSeriesTable)
    .where(eq(appearanceSeriesTable.id, seriesId));
  if (!series) throw new AdminWriteValidationError(`series ${seriesId} が存在しません。`);
}

async function validateEventGroup(
  tx: WriterTransaction,
  fields: AdminAppearanceFields,
  excludeAppearanceId?: string,
) {
  if (!fields.eventGroupId) return;
  const predicates = [eq(appearancesTable.eventGroupId, fields.eventGroupId)];
  if (excludeAppearanceId) predicates.push(ne(appearancesTable.id, excludeAppearanceId));
  const others = await tx
    .select({
      id: appearancesTable.id,
      eventTitle: appearancesTable.eventTitle,
      sessionLabel: appearancesTable.sessionLabel,
      category: appearancesTable.category,
      seriesId: appearancesTable.seriesId,
    })
    .from(appearancesTable)
    .where(and(...predicates))
    .for("update");
  for (const other of others) {
    if (
      other.eventTitle !== fields.eventTitle ||
      other.category !== fields.category ||
      other.seriesId !== fields.seriesId
    ) {
      throw new AdminWriteValidationError(
        `event group ${fields.eventGroupId} のtitle・category・seriesが一致しません。`,
      );
    }
    if (other.sessionLabel === fields.sessionLabel) {
      throw new AdminWriteValidationError(
        `event group ${fields.eventGroupId} のsession labelが重複します。`,
      );
    }
  }
}

function fieldsForGroupUpdate(
  current: typeof appearancesTable.$inferSelect,
  target: AdminAppearanceGroupMutationInput["targets"][number],
  eventTitle: string,
): AdminAppearanceFields {
  return {
    id: current.id,
    startsAtPrecision: current.startsAtPrecision,
    startsAt: current.startsAt?.toISOString() ?? null,
    startsOn: current.startsOn,
    title: target.title,
    seriesId: current.seriesId,
    eventGroupId: current.eventGroupId,
    eventTitle,
    sessionLabel: current.sessionLabel,
    category: current.category,
  };
}

function startValues(fields: AdminAppearanceFields) {
  return {
    startsAtPrecision: fields.startsAtPrecision,
    startsAt: fields.startsAt ? new Date(fields.startsAt) : null,
    startsOn: fields.startsOn,
  };
}

function appearanceFields(
  current: typeof appearancesTable.$inferSelect,
): AdminAppearanceFields {
  return {
    id: current.id,
    startsAtPrecision: current.startsAtPrecision,
    startsAt: current.startsAt?.toISOString() ?? null,
    startsOn: current.startsOn,
    title: current.title,
    seriesId: current.seriesId,
    eventGroupId: current.eventGroupId,
    eventTitle: current.eventTitle,
    sessionLabel: current.sessionLabel,
    category: current.category,
  };
}

async function readAndValidateEventGroup(
  tx: WriterTransaction,
  input: AdminAppearanceGroupMutationInput,
  lock = false,
  verifyVersions = true,
) {
  const query = tx
    .select()
    .from(appearancesTable)
    .where(eq(appearancesTable.eventGroupId, input.eventGroupId))
    .orderBy(asc(appearancesTable.id));
  const rows = lock ? await query.for("update") : await query;
  const targets = new Map(input.targets.map((target) => [target.appearanceId, target]));
  if (rows.length !== targets.size || rows.some((row) => !targets.has(row.id))) {
    throw new AdminWriteValidationError(
      "event groupの全appearanceを同時に指定してください。",
    );
  }
  if (verifyVersions && rows.some((row) => row.version !== targets.get(row.id)?.expectedVersion)) {
    throw new AdminWriteValidationError("対象appearanceのversionが更新されています。");
  }
  if (
    rows.some(
      (row) =>
        row.eventGroupId !== input.eventGroupId ||
        row.eventTitle === null ||
        row.sessionLabel === null,
    )
  ) {
    throw new AdminWriteValidationError("event groupの現在の状態が不正です。");
  }
  const [first] = rows;
  if (
    rows.some(
      (row) =>
        row.category !== first.category ||
        row.seriesId !== first.seriesId ||
        row.eventTitle !== first.eventTitle,
    ) ||
    new Set(rows.map((row) => row.sessionLabel)).size !== rows.length
  ) {
    throw new AdminWriteValidationError("event group invariantに違反しています。");
  }
  return { rows, targets };
}

async function upsertAdminSource(
  tx: WriterTransaction,
  sourceInput: AdminSourceInput,
  now: Date,
) {
  const canonicalUrl = canonicalizeSourceUrl(sourceInput.canonicalUrl);
  const sourceId = stableId("src", canonicalUrl);
  await tx
    .insert(sourceItemsTable)
    .values({
      id: sourceId,
      canonicalUrl,
      sourceType: inferSourceType(canonicalUrl),
      firstCollectedAt: now,
      lastCollectedAt: now,
    })
    .onConflictDoUpdate({
      target: sourceItemsTable.canonicalUrl,
      set: { lastCollectedAt: now, updatedAt: now },
    });
  const [source] = await tx
    .select({ id: sourceItemsTable.id })
    .from(sourceItemsTable)
    .where(eq(sourceItemsTable.canonicalUrl, canonicalUrl))
    .for("update");
  if (!source) throw new Error("情報源の確定に失敗しました。");

  const identityId = stableId(
    "sid",
    `${sourceInput.sourceName}\u0000${sourceInput.externalItemId}`,
  );
  await tx
    .insert(sourceIdentitiesTable)
    .values({
      id: identityId,
      sourceId: source.id,
      sourceName: sourceInput.sourceName,
      externalItemId: sourceInput.externalItemId,
      isCanonical: false,
    })
    .onConflictDoNothing({
      target: [
        sourceIdentitiesTable.sourceName,
        sourceIdentitiesTable.externalItemId,
      ],
    });
  const [identity] = await tx
    .select({ id: sourceIdentitiesTable.id, sourceId: sourceIdentitiesTable.sourceId })
    .from(sourceIdentitiesTable)
    .where(
      and(
        eq(sourceIdentitiesTable.sourceName, sourceInput.sourceName),
        eq(sourceIdentitiesTable.externalItemId, sourceInput.externalItemId),
      ),
    );
  if (!identity || identity.sourceId !== source.id) {
    throw new AdminWriteValidationError(
      "source identityは別のcanonical sourceに属しています。",
    );
  }
  const [canonicalIdentity] = await tx
    .select({ id: sourceIdentitiesTable.id })
    .from(sourceIdentitiesTable)
    .where(
      and(
        eq(sourceIdentitiesTable.sourceId, source.id),
        eq(sourceIdentitiesTable.isCanonical, true),
      ),
    )
    .limit(1);
  if (!canonicalIdentity) {
    await tx
      .update(sourceIdentitiesTable)
      .set({ isCanonical: true })
      .where(eq(sourceIdentitiesTable.id, identity.id));
  }
  return { sourceId: source.id, sourceIdentityId: identity.id, canonicalUrl };
}

async function upsertAppearanceSourceLink(
  tx: WriterTransaction,
  appearanceId: string,
  sourceInput: AdminSourceInput,
  source: { sourceId: string; sourceIdentityId: string },
  isPrimary: boolean,
  now: Date,
) {
  await tx
    .insert(appearanceSourceLinksTable)
    .values({
      appearanceId,
      sourceId: source.sourceId,
      sourceIdentityId: source.sourceIdentityId,
      evidenceKey: sourceInput.evidenceKey,
      active: true,
      isPrimary,
      publishedAt: sourceInput.publishedAt ? new Date(sourceInput.publishedAt) : null,
      publishedOn: sourceInput.publishedOn,
      publishedAtPrecision: sourceInput.precision,
      collectedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        appearanceSourceLinksTable.appearanceId,
        appearanceSourceLinksTable.sourceId,
        appearanceSourceLinksTable.evidenceKey,
      ],
      set: {
        sourceIdentityId: source.sourceIdentityId,
        active: true,
        isPrimary,
        publishedAt: sourceInput.publishedAt ? new Date(sourceInput.publishedAt) : null,
        publishedOn: sourceInput.publishedOn,
        publishedAtPrecision: sourceInput.precision,
        collectedAt: now,
        updatedAt: now,
      },
    });
}

async function assertAppearanceInvariant(tx: WriterTransaction, appearanceId: string) {
  await tx.execute(sql`select phase1c_assert_appearance_invariants(${appearanceId})`);
  const [groupViolation] = await tx.execute<{ violation: boolean }>(sql`
    select exists (
      select 1
      from appearances current
      join appearances other
        on other.event_group_id = current.event_group_id
        and other.id <> current.id
      where current.id = ${appearanceId}
        and (
          other.event_title is distinct from current.event_title
          or other.category is distinct from current.category
          or other.series_id is distinct from current.series_id
          or other.session_label is not distinct from current.session_label
        )
    ) as violation
  `).then((result) => result.rows);
  if (groupViolation?.violation) {
    throw new AdminWriteValidationError("event grouping invariantに違反しています。");
  }
}

async function insertRevision(
  tx: WriterTransaction,
  appearanceId: string,
  version: number,
  operation: "create" | "update" | "hide" | "restore",
  linkedProposalId: string,
) {
  const snapshot = await buildAppearanceRevisionSnapshotV3(tx, appearanceId);
  await tx.insert(appearanceRevisionsTable).values({
    appearanceId,
    version,
    operation,
    snapshotSchemaVersion: currentAppearanceSnapshotSchemaVersion,
    snapshot,
    proposalId: linkedProposalId,
    actorType: "admin",
  });
}

async function readAppearanceReplay(
  tx: WriterTransaction,
  key: string,
  hash: string,
): Promise<AdminWriteResult | null> {
  const rows = await tx
    .select({
      id: appearanceProposalsTable.id,
      appearanceId: appearanceProposalsTable.appearanceId,
      status: appearanceProposalsTable.status,
      reviewNote: appearanceProposalsTable.reviewNote,
      reviewedContentHash: appearanceProposalsTable.reviewedContentHash,
    })
    .from(appearanceProposalsTable)
    .where(
      sql`${appearanceProposalsTable.idempotencyKey} = ${key}
        or ${appearanceProposalsTable.adminBatchId} = ${key}`,
    )
    .orderBy(asc(appearanceProposalsTable.id))
    .for("update");
  if (rows.length === 0) return null;
  if (rows.some((row) => row.reviewedContentHash !== hash)) {
    throw new AdminWriteValidationError("idempotency keyが別の変更内容に使用されています。");
  }
  const statuses = new Set(rows.map((row) => row.status));
  if (statuses.size !== 1) throw new Error("Admin batchのproposal statusが一致しません。");
  const status = rows[0].status;
  const proposalIds = rows.map((row) => row.id);
  if (status !== "approved") {
    return {
      status: status === "superseded" ? "superseded" : "rejected",
      proposalIds,
      message: rows[0].reviewNote ?? "この変更は確定できません。",
      replayed: true,
    };
  }
  const ids = rows.flatMap((row) => (row.appearanceId ? [row.appearanceId] : []));
  const targets = ids.length
    ? await tx
        .select({ id: appearancesTable.id, version: appearancesTable.version })
        .from(appearancesTable)
        .where(inArray(appearancesTable.id, ids))
        .orderBy(asc(appearancesTable.id))
    : [];
  return { status: "approved", proposalIds, targets, replayed: true };
}

async function insertAppearanceProposal(
  tx: WriterTransaction,
  values: {
    key: string;
    batchId?: string;
    hash: string;
    status: "approved" | "rejected" | "superseded";
    operation: "create" | "update" | "hide" | "restore";
    appearanceId: string | null;
    expectedVersion: number | null;
    fields?: AdminAppearanceFields;
    visibilityStatus?: "public" | "hidden";
    note?: string;
  },
) {
  const id = proposalId(values.key);
  await tx.insert(appearanceProposalsTable).values({
    id,
    origin: "admin",
    operation: values.operation,
    status: values.status,
    appearanceId: values.appearanceId,
    expectedAppearanceVersion: values.expectedVersion,
    ...(values.fields ? startValues(values.fields) : {
      startsAtPrecision: null,
      startsAt: null,
      startsOn: null,
    }),
    title: values.fields?.title ?? null,
    seriesId: values.fields?.seriesId ?? null,
    eventGroupId: values.fields?.eventGroupId ?? null,
    eventTitle: values.fields?.eventTitle ?? null,
    sessionLabel: values.fields?.sessionLabel ?? null,
    category: values.fields?.category ?? null,
    visibilityStatus: values.visibilityStatus ?? null,
    matchStatus: values.operation === "create" ? "new" : "targeted_update",
    reviewedContentHash: values.hash,
    reviewNote: values.note ?? null,
    idempotencyKey: values.key,
    adminBatchId: values.batchId ?? null,
    reviewedAt: new Date(),
  });
  return id;
}

async function confirmAppearance(
  tx: WriterTransaction,
  input: Extract<AdminWriteInput, { kind: "appearance" }>,
  key: string,
  hash: string,
): Promise<AdminWriteResult> {
  const now = new Date();
  if (input.operation === "create") {
    await lockMutation(tx, `appearance:${input.fields.id}`);
    const [existing] = await tx
      .select({ id: appearancesTable.id, version: appearancesTable.version })
      .from(appearancesTable)
      .where(eq(appearancesTable.id, input.fields.id))
      .for("update");
    if (existing) {
      const id = await insertAppearanceProposal(tx, {
        key,
        hash,
        status: "superseded",
        operation: "create",
        appearanceId: existing.id,
        expectedVersion: null,
        fields: input.fields,
        note: "同じIDのappearanceが既に存在します。",
      });
      return { status: "superseded", proposalIds: [id], message: "同じIDのappearanceが既に存在します。", replayed: false };
    }
    await validateSeries(tx, input.fields.seriesId);
    await validateEventGroup(tx, input.fields);
    const source = await upsertAdminSource(tx, input.source, now);
    await tx.insert(appearancesTable).values({
      id: input.fields.id,
      ...startValues(input.fields),
      title: input.fields.title,
      seriesId: input.fields.seriesId,
      eventGroupId: input.fields.eventGroupId,
      eventTitle: input.fields.eventTitle,
      sessionLabel: input.fields.sessionLabel,
      category: input.fields.category,
      sourceUrl: source.canonicalUrl,
      sourceName: input.source.sourceName,
      sourceItemId: input.source.externalItemId,
      publishedAt: input.source.publishedAt ? new Date(input.source.publishedAt) : null,
      publishedOn: input.source.publishedOn,
      publishedAtPrecision: input.source.precision,
      visibilityStatus: "public",
      firstVisibleAt: now,
      visibilityChangedAt: now,
      version: 1,
      collectedAt: now,
      updatedAt: now,
    });
    await upsertAppearanceSourceLink(tx, input.fields.id, input.source, source, true, now);
    const id = await insertAppearanceProposal(tx, {
      key,
      hash,
      status: "approved",
      operation: "create",
      appearanceId: input.fields.id,
      expectedVersion: null,
      fields: input.fields,
      visibilityStatus: "public",
    });
    await tx.insert(proposalSourceLinksTable).values({
      proposalId: id,
      sourceId: source.sourceId,
      sourceIdentityId: source.sourceIdentityId,
      evidenceKey: input.source.evidenceKey,
      isPrimary: true,
      publishedAt: input.source.publishedAt ? new Date(input.source.publishedAt) : null,
      publishedOn: input.source.publishedOn,
      publishedAtPrecision: input.source.precision,
    });
    await assertAppearanceInvariant(tx, input.fields.id);
    await insertRevision(tx, input.fields.id, 1, "create", id);
    return { status: "approved", proposalIds: [id], targets: [{ id: input.fields.id, version: 1 }], replayed: false };
  }

  const [current] = await tx
    .select()
    .from(appearancesTable)
    .where(eq(appearancesTable.id, input.appearanceId))
    .for("update");
  if (!current) throw new AdminWriteValidationError("appearanceが存在しません。");
  if (current.version !== input.expectedVersion) {
    const id = await insertAppearanceProposal(tx, {
      key,
      hash,
      status: "superseded",
      operation: input.operation,
      appearanceId: current.id,
      expectedVersion: input.expectedVersion,
      fields: input.operation === "update" ? input.fields : undefined,
      note: `version ${input.expectedVersion} は現在のversion ${current.version}より古いため拒否しました。`,
    });
    return { status: "superseded", proposalIds: [id], message: "別の変更が先に確定しました。画面を再読込してください。", replayed: false };
  }
  if (input.operation === "hide" && current.visibilityStatus === "hidden") {
    throw new AdminWriteValidationError("appearanceは既にhiddenです。");
  }
  if (input.operation === "restore" && current.visibilityStatus === "public") {
    throw new AdminWriteValidationError("appearanceは既にpublicです。");
  }
  if (input.operation === "update") {
    await validateSeries(tx, input.fields.seriesId);
    await validateEventGroup(tx, input.fields, current.id);
  }
  const nextVersion = current.version + 1;
  const nextVisibility =
    input.operation === "hide"
      ? "hidden"
      : input.operation === "restore"
        ? "public"
        : current.visibilityStatus;
  await tx
    .update(appearancesTable)
    .set({
      ...(input.operation === "update"
        ? {
            ...startValues(input.fields),
            title: input.fields.title,
            seriesId: input.fields.seriesId,
            eventGroupId: input.fields.eventGroupId,
            eventTitle: input.fields.eventTitle,
            sessionLabel: input.fields.sessionLabel,
            category: input.fields.category,
          }
        : {}),
      visibilityStatus: nextVisibility,
      visibilityChangedAt:
        input.operation === "hide" || input.operation === "restore"
          ? now
          : current.visibilityChangedAt,
      version: nextVersion,
      updatedAt: now,
    })
    .where(eq(appearancesTable.id, current.id));
  const fields: AdminAppearanceFields =
    input.operation === "update"
      ? input.fields
      : appearanceFields(current);
  const id = await insertAppearanceProposal(tx, {
    key,
    hash,
    status: "approved",
    operation: input.operation,
    appearanceId: current.id,
    expectedVersion: input.expectedVersion,
    fields,
    visibilityStatus: nextVisibility,
  });
  await assertAppearanceInvariant(tx, current.id);
  await insertRevision(tx, current.id, nextVersion, input.operation, id);
  return { status: "approved", proposalIds: [id], targets: [{ id: current.id, version: nextVersion }], replayed: false };
}

async function confirmAppearanceGroup(
  tx: WriterTransaction,
  input: AdminAppearanceGroupMutationInput,
  key: string,
  hash: string,
): Promise<AdminWriteResult> {
  await lockMutation(tx, `event-group:${input.eventGroupId}`);
  const { rows, targets } = await readAndValidateEventGroup(tx, input, true, false);
  const now = new Date();
  const stale = rows.filter((row) => row.version !== targets.get(row.id)?.expectedVersion);
  if (stale.length) {
    const proposalIds: string[] = [];
    for (const current of rows) {
      proposalIds.push(
        await insertAppearanceProposal(tx, {
          key: `${key}:${current.id}`,
          batchId: key,
          hash,
          status: "superseded",
          operation: "update",
          appearanceId: current.id,
          expectedVersion: targets.get(current.id)?.expectedVersion ?? null,
          fields: fieldsForGroupUpdate(current, targets.get(current.id)!, input.eventTitle),
          note: "batch内にstale versionがあるため全件を拒否しました。",
        }),
      );
    }
    return {
      status: "superseded",
      proposalIds,
      message: "対象の一部に先行変更があります。全件を再確認してください。",
      replayed: false,
    };
  }

  for (const current of rows) {
    const target = targets.get(current.id)!;
    await tx
      .update(appearancesTable)
      .set({
        title: target.title,
        eventTitle: input.eventTitle,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(eq(appearancesTable.id, current.id));
  }

  const proposalIds: string[] = [];
  const approvedTargets: ApprovedResult["targets"] = [];
  for (const current of rows) {
    const target = targets.get(current.id)!;
    const nextVersion = current.version + 1;
    const id = await insertAppearanceProposal(tx, {
      key: `${key}:${current.id}`,
      batchId: key,
      hash,
      status: "approved",
      operation: "update",
      appearanceId: current.id,
      expectedVersion: current.version,
      fields: fieldsForGroupUpdate(current, target, input.eventTitle),
      visibilityStatus: current.visibilityStatus,
    });
    proposalIds.push(id);
    approvedTargets.push({ id: current.id, version: nextVersion });
  }
  for (const current of rows) {
    await assertAppearanceInvariant(tx, current.id);
  }
  for (const current of rows) {
    await insertRevision(
      tx,
      current.id,
      current.version + 1,
      "update",
      proposalIds[approvedTargets.findIndex((target) => target.id === current.id)],
    );
  }
  return { status: "approved", proposalIds, targets: approvedTargets, replayed: false };
}

async function confirmSource(
  tx: WriterTransaction,
  input: AdminSourceMutationInput,
  key: string,
  hash: string,
): Promise<AdminWriteResult> {
  const ids = input.targets.map((target) => target.appearanceId).sort();
  const currentRows = await tx
    .select()
    .from(appearancesTable)
    .where(inArray(appearancesTable.id, ids))
    .orderBy(asc(appearancesTable.id))
    .for("update");
  if (currentRows.length !== ids.length) {
    throw new AdminWriteValidationError("対象appearanceの一部が存在しません。");
  }
  const expected = new Map(input.targets.map((target) => [target.appearanceId, target.expectedVersion]));
  const stale = currentRows.filter((row) => row.version !== expected.get(row.id));
  if (stale.length) {
    const proposalIds: string[] = [];
    for (const current of currentRows) {
      proposalIds.push(
        await insertAppearanceProposal(tx, {
          key: `${key}:${current.id}`,
          batchId: key,
          hash,
          status: "superseded",
          operation: "update",
          appearanceId: current.id,
          expectedVersion: expected.get(current.id) ?? null,
          note: "batch内にstale versionがあるため全件を拒否しました。",
        }),
      );
    }
    return { status: "superseded", proposalIds, message: "対象の一部に先行変更があります。全件を再確認してください。", replayed: false };
  }

  const now = new Date();
  const resolved = input.operation === "primary" ? null : await upsertAdminSource(tx, input.source as AdminSourceInput, now);
  const proposalIds: string[] = [];
  const targets: ApprovedResult["targets"] = [];
  for (const current of currentRows) {
    let selected: { sourceId: string; sourceIdentityId: string; evidenceKey: string; publication: AdminSourceInput };
    if (input.operation === "primary") {
      const requested = input.source as { sourceId: string; evidenceKey: string };
      const [link] = await tx
        .select()
        .from(appearanceSourceLinksTable)
        .where(
          and(
            eq(appearanceSourceLinksTable.appearanceId, current.id),
            eq(appearanceSourceLinksTable.sourceId, requested.sourceId),
            eq(appearanceSourceLinksTable.evidenceKey, requested.evidenceKey),
            eq(appearanceSourceLinksTable.active, true),
          ),
        )
        .for("update");
      if (!link) throw new AdminWriteValidationError(`${current.id}: activeな情報源が見つかりません。`);
      const [identity] = await tx
        .select()
        .from(sourceIdentitiesTable)
        .where(eq(sourceIdentitiesTable.id, link.sourceIdentityId));
      const [source] = await tx
        .select()
        .from(sourceItemsTable)
        .where(eq(sourceItemsTable.id, link.sourceId));
      if (!identity || !source) throw new Error("情報源の参照整合性が壊れています。");
      selected = {
        sourceId: link.sourceId,
        sourceIdentityId: link.sourceIdentityId,
        evidenceKey: link.evidenceKey,
        publication: {
          canonicalUrl: source.canonicalUrl,
          sourceName: identity.sourceName,
          externalItemId: identity.externalItemId,
          evidenceKey: link.evidenceKey,
          precision: link.publishedAtPrecision,
          publishedAt: link.publishedAt?.toISOString() ?? null,
          publishedOn: link.publishedOn,
        },
      };
    } else {
      const sourceInput = input.source as AdminSourceInput;
      selected = {
        sourceId: resolved!.sourceId,
        sourceIdentityId: resolved!.sourceIdentityId,
        evidenceKey: sourceInput.evidenceKey,
        publication: sourceInput,
      };
    }

    if (input.operation === "replace") {
      await tx
        .update(appearanceSourceLinksTable)
        .set({ active: false, isPrimary: false, updatedAt: now })
        .where(eq(appearanceSourceLinksTable.appearanceId, current.id));
      await upsertAppearanceSourceLink(tx, current.id, selected.publication, selected, true, now);
    } else if (input.operation === "append") {
      await upsertAppearanceSourceLink(tx, current.id, selected.publication, selected, false, now);
    } else {
      await tx
        .update(appearanceSourceLinksTable)
        .set({ isPrimary: false, updatedAt: now })
        .where(eq(appearanceSourceLinksTable.appearanceId, current.id));
      await tx
        .update(appearanceSourceLinksTable)
        .set({ isPrimary: true, updatedAt: now })
        .where(
          and(
            eq(appearanceSourceLinksTable.appearanceId, current.id),
            eq(appearanceSourceLinksTable.sourceId, selected.sourceId),
            eq(appearanceSourceLinksTable.evidenceKey, selected.evidenceKey),
          ),
        );
    }
    const nextVersion = current.version + 1;
    await tx
      .update(appearancesTable)
      .set({ version: nextVersion, updatedAt: now })
      .where(eq(appearancesTable.id, current.id));
    const id = await insertAppearanceProposal(tx, {
      key: `${key}:${current.id}`,
      batchId: key,
      hash,
      status: "approved",
      operation: "update",
      appearanceId: current.id,
      expectedVersion: current.version,
      visibilityStatus: current.visibilityStatus,
    });
    await tx.insert(proposalSourceLinksTable).values({
      proposalId: id,
      sourceId: selected.sourceId,
      sourceIdentityId: selected.sourceIdentityId,
      evidenceKey: selected.evidenceKey,
      isPrimary: input.operation !== "append",
      publishedAt: selected.publication.publishedAt ? new Date(selected.publication.publishedAt) : null,
      publishedOn: selected.publication.publishedOn,
      publishedAtPrecision: selected.publication.precision,
      reviewMetadata: { adminSourceOperation: input.operation },
    });
    await assertAppearanceInvariant(tx, current.id);
    await insertRevision(tx, current.id, nextVersion, "update", id);
    proposalIds.push(id);
    targets.push({ id: current.id, version: nextVersion });
  }
  return { status: "approved", proposalIds, targets, replayed: false };
}

async function readSeriesReplay(
  tx: WriterTransaction,
  key: string,
  hash: string,
): Promise<AdminWriteResult | null> {
  const [proposal] = await tx
    .select()
    .from(appearanceSeriesProposalsTable)
    .where(eq(appearanceSeriesProposalsTable.idempotencyKey, key))
    .for("update");
  if (!proposal) return null;
  if (proposal.reviewedContentHash !== hash) {
    throw new AdminWriteValidationError("idempotency keyが別の変更内容に使用されています。");
  }
  if (proposal.status !== "approved") {
    return {
      status: proposal.status === "superseded" ? "superseded" : "rejected",
      proposalIds: [proposal.id],
      message: proposal.reviewNote ?? "この変更は確定できません。",
      replayed: true,
    };
  }
  const [series] = await tx
    .select({ id: appearanceSeriesTable.id, version: appearanceSeriesTable.version })
    .from(appearanceSeriesTable)
    .where(eq(appearanceSeriesTable.id, proposal.targetSeriesId));
  return { status: "approved", proposalIds: [proposal.id], targets: series ? [series] : [], replayed: true };
}

async function insertSeriesProposal(
  tx: WriterTransaction,
  input: Extract<AdminWriteInput, { kind: "series" }>,
  key: string,
  hash: string,
  status: "approved" | "rejected" | "superseded",
  note?: string,
) {
  const id = proposalId(`series:${key}`);
  await tx.insert(appearanceSeriesProposalsTable).values({
    id,
    operation: input.operation,
    status,
    seriesId: input.operation === "update" ? input.seriesId : null,
    targetSeriesId: input.seriesId,
    expectedSeriesVersion: input.expectedVersion,
    displayName: input.displayName,
    reviewedContentHash: hash,
    reviewNote: note ?? null,
    idempotencyKey: key,
    reviewedAt: new Date(),
  });
  return id;
}

async function confirmSeries(
  tx: WriterTransaction,
  input: Extract<AdminWriteInput, { kind: "series" }>,
  key: string,
  hash: string,
): Promise<AdminWriteResult> {
  await lockMutation(tx, `series:${input.seriesId}`);
  const [current] = await tx
    .select()
    .from(appearanceSeriesTable)
    .where(eq(appearanceSeriesTable.id, input.seriesId))
    .for("update");
  if (input.operation === "create" && current) {
    const id = await insertSeriesProposal(tx, input, key, hash, "superseded", "同じIDのseriesが既に存在します。");
    return { status: "superseded", proposalIds: [id], message: "同じIDのseriesが既に存在します。", replayed: false };
  }
  if (input.operation === "update" && !current) {
    throw new AdminWriteValidationError("seriesが存在しません。");
  }
  if (input.operation === "update" && current!.version !== input.expectedVersion) {
    const id = await insertSeriesProposal(tx, input, key, hash, "superseded", "series versionが更新されています。");
    return { status: "superseded", proposalIds: [id], message: "別の変更が先に確定しました。", replayed: false };
  }
  const [nameConflict] = await tx
    .select({ id: appearanceSeriesTable.id })
    .from(appearanceSeriesTable)
    .where(eq(appearanceSeriesTable.displayName, input.displayName))
    .for("update");
  if (nameConflict && nameConflict.id !== input.seriesId) {
    const id = await insertSeriesProposal(tx, input, key, hash, "rejected", "表示名が別seriesと重複します。");
    return { status: "rejected", proposalIds: [id], message: "表示名が別seriesと重複します。", replayed: false };
  }
  const now = new Date();
  const version = input.operation === "create" ? 1 : current!.version + 1;
  if (input.operation === "create") {
    await tx.insert(appearanceSeriesTable).values({ id: input.seriesId, displayName: input.displayName, version, updatedAt: now });
  } else {
    await tx.update(appearanceSeriesTable).set({ displayName: input.displayName, version, updatedAt: now }).where(eq(appearanceSeriesTable.id, input.seriesId));
  }
  const id = await insertSeriesProposal(tx, input, key, hash, "approved");
  const [series] = await tx.select().from(appearanceSeriesTable).where(eq(appearanceSeriesTable.id, input.seriesId));
  if (!series) throw new Error("seriesのrevision生成に失敗しました。");
  await tx.insert(appearanceSeriesRevisionsTable).values({
    seriesId: series.id,
    version,
    operation: input.operation,
    snapshotSchemaVersion: 1,
    snapshot: {
      id: series.id,
      displayName: series.displayName,
      version: series.version,
      createdAt: series.createdAt.toISOString(),
      updatedAt: series.updatedAt.toISOString(),
    },
    proposalId: id,
    actorType: "admin",
  });
  return { status: "approved", proposalIds: [id], targets: [{ id: series.id, version }], replayed: false };
}

export async function confirmAdminWrite(
  untrustedInput: unknown,
  idempotencyKey: string,
): Promise<AdminWriteResult> {
  const parsed = parseAdminWriteInput(untrustedInput);
  return getWriterDb().transaction(async (tx) => {
    const input = parseAdminWriteInput(parsed);
    const hash = contentHash(input);
    await lockMutation(tx, `admin-write:${idempotencyKey}`);
    await assertContentState(tx, true);
    const replay =
      input.kind === "series"
        ? await readSeriesReplay(tx, idempotencyKey, hash)
        : await readAppearanceReplay(tx, idempotencyKey, hash);
    if (replay) return replay;
    if (input.kind === "appearance") return confirmAppearance(tx, input, idempotencyKey, hash);
    if (input.kind === "appearance-group") return confirmAppearanceGroup(tx, input, idempotencyKey, hash);
    if (input.kind === "source") return confirmSource(tx, input, idempotencyKey, hash);
    return confirmSeries(tx, input, idempotencyKey, hash);
  });
}

export async function rejectAdminWrite(
  untrustedInput: unknown,
  idempotencyKey: string,
): Promise<AdminWriteResult> {
  const parsed = parseAdminWriteInput(untrustedInput);
  return getWriterDb().transaction(async (tx) => {
    const input = parseAdminWriteInput(parsed);
    const hash = contentHash(input);
    await lockMutation(tx, `admin-write:${idempotencyKey}`);
    await assertContentState(tx, true);
    const replay = input.kind === "series" ? await readSeriesReplay(tx, idempotencyKey, hash) : await readAppearanceReplay(tx, idempotencyKey, hash);
    if (replay) return replay;
    if (input.kind === "series") {
      const id = await insertSeriesProposal(tx, input, idempotencyKey, hash, "rejected", "previewを破棄しました。");
      return { status: "rejected", proposalIds: [id], message: "previewを破棄しました。", replayed: false };
    }
    const targets = input.kind === "appearance"
      ? [input.operation === "create" ? input.fields.id : input.appearanceId]
      : input.targets.map((target) => target.appearanceId);
    const existing = await tx.select({ id: appearancesTable.id }).from(appearancesTable).where(inArray(appearancesTable.id, targets));
    const existingIds = new Set(existing.map((row) => row.id));
    const proposalIds: string[] = [];
    for (const target of targets) {
      const childKey = targets.length === 1 ? idempotencyKey : `${idempotencyKey}:${target}`;
      proposalIds.push(await insertAppearanceProposal(tx, {
        key: childKey,
        batchId: targets.length === 1 ? undefined : idempotencyKey,
        hash,
        status: "rejected",
        operation: input.kind === "appearance" ? input.operation : "update",
        appearanceId: existingIds.has(target) ? target : null,
        expectedVersion: input.kind === "appearance" ? input.expectedVersion : input.targets.find((item) => item.appearanceId === target)?.expectedVersion ?? null,
        fields: input.kind === "appearance" && (input.operation === "create" || input.operation === "update") ? input.fields : undefined,
        note: "previewを破棄しました。",
      }));
    }
    return { status: "rejected", proposalIds, message: "previewを破棄しました。", replayed: false };
  });
}

async function assertSourceIdentityAvailable(
  tx: WriterTransaction,
  source: AdminSourceInput,
) {
  const canonicalUrl = canonicalizeSourceUrl(source.canonicalUrl);
  const [identity] = await tx
    .select({ canonicalUrl: sourceItemsTable.canonicalUrl })
    .from(sourceIdentitiesTable)
    .innerJoin(sourceItemsTable, eq(sourceIdentitiesTable.sourceId, sourceItemsTable.id))
    .where(
      and(
        eq(sourceIdentitiesTable.sourceName, source.sourceName),
        eq(sourceIdentitiesTable.externalItemId, source.externalItemId),
      ),
    );
  if (identity && identity.canonicalUrl !== canonicalUrl) {
    throw new AdminWriteValidationError(
      "source identityは別のcanonical sourceに属しています。",
    );
  }
}

export async function validateAdminWritePreview(untrustedInput: unknown) {
  const parsed = parseAdminWriteInput(untrustedInput);
  return getWriterDb().transaction(async (tx) => {
    const input = parseAdminWriteInput(parsed);
    await assertContentState(tx);
    if (input.kind === "appearance") {
      if (input.operation === "create") {
        const [existing] = await tx
          .select({ id: appearancesTable.id })
          .from(appearancesTable)
          .where(eq(appearancesTable.id, input.fields.id));
        if (existing) throw new AdminWriteValidationError("同じIDのappearanceが既に存在します。");
        await validateSeries(tx, input.fields.seriesId);
        await validateEventGroup(tx, input.fields);
        await assertSourceIdentityAvailable(tx, input.source);
      } else {
        const [current] = await tx
          .select()
          .from(appearancesTable)
          .where(eq(appearancesTable.id, input.appearanceId));
        if (!current) throw new AdminWriteValidationError("appearanceが存在しません。");
        if (current.version !== input.expectedVersion) {
          throw new AdminWriteValidationError("versionが更新されています。画面を再読込してください。");
        }
        if (input.operation === "hide" && current.visibilityStatus === "hidden") {
          throw new AdminWriteValidationError("appearanceは既にhiddenです。");
        }
        if (input.operation === "restore" && current.visibilityStatus === "public") {
          throw new AdminWriteValidationError("appearanceは既にpublicです。");
        }
        if (input.operation === "update") {
          await validateSeries(tx, input.fields.seriesId);
          await validateEventGroup(tx, input.fields, current.id);
        }
      }
    } else if (input.kind === "appearance-group") {
      await readAndValidateEventGroup(tx, input);
    } else if (input.kind === "source") {
      const ids = input.targets.map((target) => target.appearanceId);
      const rows = await tx
        .select({ id: appearancesTable.id, version: appearancesTable.version })
        .from(appearancesTable)
        .where(inArray(appearancesTable.id, ids));
      if (rows.length !== ids.length) throw new AdminWriteValidationError("対象appearanceの一部が存在しません。");
      const expected = new Map(input.targets.map((target) => [target.appearanceId, target.expectedVersion]));
      if (rows.some((row) => row.version !== expected.get(row.id))) {
        throw new AdminWriteValidationError("対象appearanceのversionが更新されています。");
      }
      if (input.operation === "primary") {
        const selected = input.source as { sourceId: string; evidenceKey: string };
        const links = await tx
          .select({ appearanceId: appearanceSourceLinksTable.appearanceId })
          .from(appearanceSourceLinksTable)
          .where(
            and(
              inArray(appearanceSourceLinksTable.appearanceId, ids),
              eq(appearanceSourceLinksTable.sourceId, selected.sourceId),
              eq(appearanceSourceLinksTable.evidenceKey, selected.evidenceKey),
              eq(appearanceSourceLinksTable.active, true),
            ),
          );
        if (links.length !== ids.length) {
          throw new AdminWriteValidationError("選択したactive sourceは全appearanceに存在しません。");
        }
      } else {
        const source = input.source as AdminSourceInput;
        await assertSourceIdentityAvailable(tx, source);
        if (input.operation === "append") {
          const sourceId = stableId("src", canonicalizeSourceUrl(source.canonicalUrl));
          const duplicates = await tx
            .select({ appearanceId: appearanceSourceLinksTable.appearanceId })
            .from(appearanceSourceLinksTable)
            .where(
              and(
                inArray(appearanceSourceLinksTable.appearanceId, ids),
                eq(appearanceSourceLinksTable.sourceId, sourceId),
                eq(appearanceSourceLinksTable.evidenceKey, source.evidenceKey),
                eq(appearanceSourceLinksTable.active, true),
              ),
            );
          if (duplicates.length) {
            throw new AdminWriteValidationError("同じactive source linkが既に存在します。");
          }
        }
      }
    } else {
      const [current] = await tx
        .select()
        .from(appearanceSeriesTable)
        .where(eq(appearanceSeriesTable.id, input.seriesId));
      if (input.operation === "create" && current) {
        throw new AdminWriteValidationError("同じIDのseriesが既に存在します。");
      }
      if (input.operation === "update" && !current) {
        throw new AdminWriteValidationError("seriesが存在しません。");
      }
      if (input.operation === "update" && current!.version !== input.expectedVersion) {
        throw new AdminWriteValidationError("series versionが更新されています。");
      }
      const [nameConflict] = await tx
        .select({ id: appearanceSeriesTable.id })
        .from(appearanceSeriesTable)
        .where(eq(appearanceSeriesTable.displayName, input.displayName));
      if (nameConflict && nameConflict.id !== input.seriesId) {
        throw new AdminWriteValidationError("表示名が別seriesと重複します。");
      }
    }
    return input;
  });
}
