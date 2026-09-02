import { createHash } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";

import { getWriterDb } from "@/db/client";
import {
  appearanceProposalsTable,
  appearanceRevisionsTable,
  appearanceSourceLinksTable,
  appearancesTable,
  contentManagementStateTable,
  sourceIdentitiesTable,
  sourceItemsTable,
} from "@/db/schema";
import type { AppearanceImportItem } from "@/domain/appearance";

export type SourceType = "web" | "youtube" | "niconico" | "x" | "other";

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

export function canonicalizeSourceUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.searchParams.sort();

  return url.toString();
}

export function inferSourceType(canonicalUrl: string): SourceType {
  const hostname = new URL(canonicalUrl).hostname;

  if (hostname === "x.com" || hostname === "www.x.com") {
    return "x";
  }
  if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "youtu.be"
  ) {
    return "youtube";
  }
  if (hostname.endsWith("nicovideo.jp")) {
    return "niconico";
  }

  return "web";
}

function evidenceFromText(value: string) {
  const day = /\bDAY\s*(\d+)\b/i.exec(value);
  if (day) {
    return `day${day[1]}`;
  }

  const episode = /第\s*(\d+)\s*回/.exec(value);
  if (episode) {
    return `episode-${episode[1]}`;
  }

  const numbered = /#\s*(\d+)\b/.exec(value);
  if (numbered) {
    return `episode-${numbered[1]}`;
  }

  const part = /第\s*(\d+)\s*部/.exec(value);
  if (part) {
    return `part-${part[1]}`;
  }

  const calendarDate = /(\d{1,2})月\s*(\d{1,2})日/.exec(value);
  if (calendarDate) {
    return `date-${calendarDate[1].padStart(2, "0")}-${calendarDate[2].padStart(2, "0")}`;
  }

  if (/昼/.test(value)) {
    return "daytime";
  }
  if (/夜/.test(value)) {
    return "night";
  }

  return null;
}

function evidenceFromExternalItemId(value: string) {
  const day = /:day(\d+)$/i.exec(value);
  if (day) {
    return `day${day[1]}`;
  }

  const episode = /:(?:episode:|episode-|game-)(\d+)$/i.exec(value);
  if (episode) {
    return `episode-${episode[1]}`;
  }

  const part = /:part(\d+)$/i.exec(value);
  if (part) {
    return `part-${part[1]}`;
  }

  if (/:day$/i.test(value)) {
    return "daytime";
  }
  if (/:night$/i.test(value)) {
    return "night";
  }

  return null;
}

export function deriveEvidenceKey(item: AppearanceImportItem) {
  return (
    evidenceFromText(item.sessionLabel ?? "") ??
    evidenceFromText(item.title) ??
    evidenceFromText(item.id) ??
    evidenceFromExternalItemId(item.sourceItemId) ??
    "default"
  );
}

function nativeIdentity(canonicalUrl: string, sourceType: SourceType) {
  const url = new URL(canonicalUrl);

  if (sourceType === "x") {
    return /\/status\/(\d+)/.exec(url.pathname)?.[1] ?? null;
  }

  if (sourceType === "youtube") {
    if (url.hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    return (
      /^\/(?:watch|live|shorts)\/([^/]+)/.exec(url.pathname)?.[1] ??
      url.searchParams.get("v")
    );
  }

  if (sourceType === "niconico") {
    return /\/(?:watch|live)\/((?:sm|so|lv)\d+)/.exec(url.pathname)?.[1] ?? null;
  }

  return null;
}

export function deriveCanonicalIdentity(
  item: AppearanceImportItem,
  canonicalUrl: string,
  sourceType: SourceType,
) {
  const nativeExternalItemId = nativeIdentity(canonicalUrl, sourceType);
  if (nativeExternalItemId) {
    return {
      sourceName: item.sourceName,
      externalItemId: nativeExternalItemId,
    };
  }

  if (deriveEvidenceKey(item) === "default") {
    return {
      sourceName: item.sourceName,
      externalItemId: item.sourceItemId,
    };
  }

  return {
    sourceName: "canonical-url",
    externalItemId: createHash("sha256").update(canonicalUrl).digest("hex"),
  };
}

async function assertBootstrapImportAllowed(
  tx: Parameters<Parameters<ReturnType<typeof getWriterDb>["transaction"]>[0]>[0],
) {
  const [state] = await tx
    .select({
      contentMode: contentManagementStateTable.contentMode,
      legacyImportLockedAt: contentManagementStateTable.legacyImportLockedAt,
    })
    .from(contentManagementStateTable)
    .where(eq(contentManagementStateTable.id, "singleton"))
    .for("update");

  if (!state) {
    throw new Error("Content management state is not initialized.");
  }
  if (state.contentMode !== "bootstrap" || state.legacyImportLockedAt !== null) {
    throw new Error("Legacy appearance import is locked after Admin activation.");
  }

  const [proposal] = await tx
    .select({ id: appearanceProposalsTable.id })
    .from(appearanceProposalsTable)
    .where(eq(appearanceProposalsTable.origin, "admin"))
    .limit(1);
  const [revision] = await tx
    .select({ appearanceId: appearanceRevisionsTable.appearanceId })
    .from(appearanceRevisionsTable)
    .where(eq(appearanceRevisionsTable.actorType, "admin"))
    .limit(1);

  if (proposal || revision) {
    throw new Error(
      "Legacy appearance import is disabled after proposals or revisions exist.",
    );
  }
}

export async function withBootstrapImportTransaction<T>(
  callback: (
    tx: Parameters<Parameters<ReturnType<typeof getWriterDb>["transaction"]>[0]>[0],
  ) => Promise<T>,
) {
  return getWriterDb().transaction(async (tx) => {
    await assertBootstrapImportAllowed(tx);
    return callback(tx);
  });
}

export async function assertBootstrapImportIsAllowed() {
  await withBootstrapImportTransaction(async () => undefined);
}

export async function dualWriteAppearance(item: AppearanceImportItem) {
  return withBootstrapImportTransaction(async (tx) => {
    const [existingAppearance] = await tx
      .select({
        id: appearancesTable.id,
        collectedAt: appearancesTable.collectedAt,
      })
      .from(appearancesTable)
      .where(eq(appearancesTable.id, item.id))
      .for("update");

    const canonicalUrl = canonicalizeSourceUrl(item.sourceUrl);
    const sourceType = inferSourceType(canonicalUrl);
    const sourceId = stableId("src", canonicalUrl);
    const collectedAt = existingAppearance?.collectedAt ?? new Date();

    await tx
      .insert(sourceItemsTable)
      .values({
        id: sourceId,
        canonicalUrl,
        sourceType,
        firstCollectedAt: collectedAt,
        lastCollectedAt: collectedAt,
      })
      .onConflictDoUpdate({
        target: sourceItemsTable.canonicalUrl,
        set: {
          lastCollectedAt: sql`greatest(${sourceItemsTable.lastCollectedAt}, excluded.last_collected_at)`,
          updatedAt: sql`now()`,
        },
      });

    const [source] = await tx
      .select({ id: sourceItemsTable.id })
      .from(sourceItemsTable)
      .where(eq(sourceItemsTable.canonicalUrl, canonicalUrl))
      .for("update");

    if (!source) {
      throw new Error(`${item.id}: failed to upsert source item.`);
    }

    const ensureIdentity = async (
      sourceName: string,
      externalItemId: string,
    ) => {
      const identityId = stableId(
        "sid",
        `${sourceName}\u0000${externalItemId}`,
      );
      await tx
        .insert(sourceIdentitiesTable)
        .values({
          id: identityId,
          sourceId: source.id,
          sourceName,
          externalItemId,
          isCanonical: false,
        })
        .onConflictDoNothing({
          target: [
            sourceIdentitiesTable.sourceName,
            sourceIdentitiesTable.externalItemId,
          ],
        });

      const [identity] = await tx
        .select({
          id: sourceIdentitiesTable.id,
          sourceId: sourceIdentitiesTable.sourceId,
        })
        .from(sourceIdentitiesTable)
        .where(
          and(
            eq(sourceIdentitiesTable.sourceName, sourceName),
            eq(sourceIdentitiesTable.externalItemId, externalItemId),
          ),
        );

      if (!identity || identity.sourceId !== source.id) {
        throw new Error(
          `${item.id}: source identity belongs to a different canonical source.`,
        );
      }

      return identity.id;
    };

    const aliasIdentityId = await ensureIdentity(
      item.sourceName,
      item.sourceItemId,
    );
    const [currentCanonicalIdentity] = await tx
      .select({ id: sourceIdentitiesTable.id })
      .from(sourceIdentitiesTable)
      .where(
        and(
          eq(sourceIdentitiesTable.sourceId, source.id),
          eq(sourceIdentitiesTable.isCanonical, true),
        ),
      )
      .limit(1);

    if (!currentCanonicalIdentity) {
      const canonicalIdentity = deriveCanonicalIdentity(
        item,
        canonicalUrl,
        sourceType,
      );
      const canonicalIdentityId = await ensureIdentity(
        canonicalIdentity.sourceName,
        canonicalIdentity.externalItemId,
      );
      await tx
        .update(sourceIdentitiesTable)
        .set({ isCanonical: true })
        .where(eq(sourceIdentitiesTable.id, canonicalIdentityId));
    }

    await tx
      .insert(appearancesTable)
      .values({
        id: item.id,
        startsAt: new Date(item.startsAt),
        title: item.title,
        seriesId: item.seriesId,
        eventGroupId: item.eventGroupId,
        eventTitle: item.eventTitle,
        sessionLabel: item.sessionLabel,
        category: item.category,
        sourceUrl: canonicalUrl,
        publishedAt:
          item.publishedAt === null ? null : new Date(item.publishedAt),
        publishedOn: item.publishedOn,
        publishedAtPrecision: item.publishedAtPrecision,
        sourceName: item.sourceName,
        sourceItemId: item.sourceItemId,
        collectedAt,
        visibilityStatus: "public",
        firstVisibleAt: collectedAt,
        visibilityChangedAt: collectedAt,
        version: 1,
      })
      .onConflictDoUpdate({
        target: appearancesTable.id,
        set: {
          startsAt: new Date(item.startsAt),
          title: item.title,
          seriesId: item.seriesId,
          eventGroupId: item.eventGroupId,
          eventTitle: item.eventTitle,
          sessionLabel: item.sessionLabel,
          category: item.category,
          sourceUrl: canonicalUrl,
          publishedAt:
            item.publishedAt === null ? null : new Date(item.publishedAt),
          publishedOn: item.publishedOn,
          publishedAtPrecision: item.publishedAtPrecision,
          sourceName: item.sourceName,
          sourceItemId: item.sourceItemId,
          visibilityStatus: sql`coalesce(${appearancesTable.visibilityStatus}, 'public')`,
          firstVisibleAt: sql`coalesce(${appearancesTable.firstVisibleAt}, ${appearancesTable.createdAt})`,
          visibilityChangedAt: sql`coalesce(${appearancesTable.visibilityChangedAt}, ${appearancesTable.createdAt})`,
          version: sql`coalesce(${appearancesTable.version}, 1)`,
          updatedAt: sql`now()`,
        },
      });

    await tx
      .update(appearanceSourceLinksTable)
      .set({
        active: false,
        isPrimary: false,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(appearanceSourceLinksTable.appearanceId, item.id),
          ne(appearanceSourceLinksTable.sourceId, source.id),
        ),
      );

    const evidenceKey = deriveEvidenceKey(item);
    await tx
      .insert(appearanceSourceLinksTable)
      .values({
        appearanceId: item.id,
        sourceId: source.id,
        sourceIdentityId: aliasIdentityId,
        evidenceKey,
        active: true,
        isPrimary: true,
        publishedAt:
          item.publishedAt === null ? null : new Date(item.publishedAt),
        publishedOn: item.publishedOn,
        publishedAtPrecision: item.publishedAtPrecision,
        collectedAt,
      })
      .onConflictDoUpdate({
        target: [
          appearanceSourceLinksTable.appearanceId,
          appearanceSourceLinksTable.sourceId,
          appearanceSourceLinksTable.evidenceKey,
        ],
        set: {
          sourceIdentityId: aliasIdentityId,
          active: true,
          isPrimary: true,
          publishedAt:
            item.publishedAt === null ? null : new Date(item.publishedAt),
          publishedOn: item.publishedOn,
          publishedAtPrecision: item.publishedAtPrecision,
          collectedAt,
          updatedAt: sql`now()`,
        },
      });

    return {
      appearanceId: item.id,
      sourceId: source.id,
      sourceIdentityId: aliasIdentityId,
      evidenceKey,
    };
  });
}
