import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  appearanceCategories,
  publishedAtPrecisions,
} from "../domain/appearance";

export const appearanceCategoryEnum = pgEnum(
  "appearance_category",
  appearanceCategories,
);

export const publishedAtPrecisionEnum = pgEnum(
  "appearance_published_precision",
  publishedAtPrecisions,
);

export const appearanceVisibilityStatusEnum = pgEnum(
  "appearance_visibility_status",
  ["public", "hidden"],
);

export const sourceTypeEnum = pgEnum("source_type", [
  "web",
  "youtube",
  "niconico",
  "x",
  "other",
]);

export const proposalOriginEnum = pgEnum("proposal_origin", [
  "collector",
  "admin",
  "public_submission",
]);

export const proposalOperationEnum = pgEnum("proposal_operation", [
  "create",
  "update",
  "hide",
  "restore",
]);

export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
  "superseded",
]);

export const proposalMatchStatusEnum = pgEnum("proposal_match_status", [
  "new",
  "targeted_update",
  "possible_duplicate",
  "incomplete",
]);

export const contentModeEnum = pgEnum("content_mode", ["bootstrap", "admin"]);

export const appearanceSeriesTable = pgTable(
  "appearance_series",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "appearance_series_id_normalized",
      sql`${table.id} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check("appearance_series_display_name_not_empty", sql`length(trim(${table.displayName})) > 0`),
    uniqueIndex("appearance_series_display_name_unique").on(table.displayName),
  ],
);

export const appearancesTable = pgTable(
  "appearances",
  {
    id: text("id").primaryKey(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    title: text("title").notNull(),
    seriesId: text("series_id").references(() => appearanceSeriesTable.id, {
      onDelete: "restrict",
    }),
    eventGroupId: text("event_group_id"),
    eventTitle: text("event_title"),
    sessionLabel: text("session_label"),
    category: appearanceCategoryEnum("category").notNull(),
    sourceUrl: text("source_url").notNull(),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishedOn: date("published_on", { mode: "string" }),
    publishedAtPrecision: publishedAtPrecisionEnum(
      "published_at_precision",
    ).notNull(),
    sourceName: text("source_name"),
    sourceItemId: text("source_item_id"),
    visibilityStatus: appearanceVisibilityStatusEnum("visibility_status"),
    firstVisibleAt: timestamp("first_visible_at", {
      withTimezone: true,
      mode: "date",
    }),
    visibilityChangedAt: timestamp("visibility_changed_at", {
      withTimezone: true,
      mode: "date",
    }),
    version: integer("version"),
    collectedAt: timestamp("collected_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "appearances_event_group_fields_complete",
      sql`(${table.eventGroupId} is null and ${table.eventTitle} is null and ${table.sessionLabel} is null)
        or (${table.eventGroupId} is not null and ${table.eventTitle} is not null and ${table.sessionLabel} is not null)`,
    ),
    check(
      "appearances_published_at_precision_valid",
      sql`(${table.publishedAtPrecision} = 'exact' and ${table.publishedAt} is not null and ${table.publishedOn} is null)
        or (${table.publishedAtPrecision} = 'date' and ${table.publishedAt} is null and ${table.publishedOn} is not null)
        or (${table.publishedAtPrecision} = 'unknown' and ${table.publishedAt} is null and ${table.publishedOn} is null)`,
    ),
    index("appearances_starts_at_idx").on(table.startsAt),
    index("appearances_published_at_idx").on(table.publishedAt),
    index("appearances_series_id_idx").on(table.seriesId),
    index("appearances_event_group_id_idx").on(table.eventGroupId),
    uniqueIndex("appearances_source_item_unique")
      .on(table.sourceName, table.sourceItemId)
      .where(
        sql`${table.sourceName} is not null and ${table.sourceItemId} is not null`,
      ),
  ],
);

export const sourceItemsTable = pgTable(
  "source_items",
  {
    id: text("id").primaryKey(),
    canonicalUrl: text("canonical_url").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    firstCollectedAt: timestamp("first_collected_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastCollectedAt: timestamp("last_collected_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("source_items_canonical_url_unique").on(table.canonicalUrl),
  ],
);

export const sourceIdentitiesTable = pgTable(
  "source_identities",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sourceItemsTable.id, { onDelete: "cascade" }),
    sourceName: text("source_name").notNull(),
    externalItemId: text("external_item_id").notNull(),
    isCanonical: boolean("is_canonical").default(false).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "source_identities_source_name_not_empty",
      sql`length(trim(${table.sourceName})) > 0`,
    ),
    check(
      "source_identities_external_item_id_not_empty",
      sql`length(trim(${table.externalItemId})) > 0`,
    ),
    uniqueIndex("source_identities_name_external_item_unique").on(
      table.sourceName,
      table.externalItemId,
    ),
    uniqueIndex("source_identities_one_canonical_per_source")
      .on(table.sourceId)
      .where(sql`${table.isCanonical} = true`),
    index("source_identities_source_id_idx").on(table.sourceId),
  ],
);

export const appearanceSourceLinksTable = pgTable(
  "appearance_source_links",
  {
    appearanceId: text("appearance_id")
      .notNull()
      .references(() => appearancesTable.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sourceItemsTable.id, { onDelete: "restrict" }),
    sourceIdentityId: text("source_identity_id").references(
      () => sourceIdentitiesTable.id,
      { onDelete: "restrict" },
    ),
    evidenceKey: text("evidence_key").notNull(),
    active: boolean("active").default(true).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishedOn: date("published_on", { mode: "string" }),
    publishedAtPrecision: publishedAtPrecisionEnum("published_at_precision"),
    collectedAt: timestamp("collected_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "appearance_source_links_evidence_key_normalized",
      sql`${table.evidenceKey} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "appearance_source_links_published_at_precision_valid",
      sql`${table.publishedAtPrecision} is null
        or (${table.publishedAtPrecision} = 'exact' and ${table.publishedAt} is not null and ${table.publishedOn} is null)
        or (${table.publishedAtPrecision} = 'date' and ${table.publishedAt} is null and ${table.publishedOn} is not null)
        or (${table.publishedAtPrecision} = 'unknown' and ${table.publishedAt} is null and ${table.publishedOn} is null)`,
    ),
    uniqueIndex("appearance_source_links_appearance_source_evidence_unique").on(
      table.appearanceId,
      table.sourceId,
      table.evidenceKey,
    ),
    index("appearance_source_links_appearance_id_idx").on(table.appearanceId),
    index("appearance_source_links_source_id_idx").on(table.sourceId),
  ],
);

export const appearanceProposalsTable = pgTable(
  "appearance_proposals",
  {
    id: text("id").primaryKey(),
    origin: proposalOriginEnum("origin").notNull(),
    operation: proposalOperationEnum("operation").notNull(),
    status: proposalStatusEnum("status").notNull(),
    appearanceId: text("appearance_id").references(() => appearancesTable.id, {
      onDelete: "set null",
    }),
    expectedAppearanceVersion: integer("expected_appearance_version"),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    title: text("title"),
    seriesId: text("series_id").references(() => appearanceSeriesTable.id, {
      onDelete: "restrict",
    }),
    eventGroupId: text("event_group_id"),
    eventTitle: text("event_title"),
    sessionLabel: text("session_label"),
    category: appearanceCategoryEnum("category"),
    visibilityStatus: appearanceVisibilityStatusEnum("visibility_status"),
    matchStatus: proposalMatchStatusEnum("match_status").notNull(),
    appearanceFingerprint: text("appearance_fingerprint"),
    collectorKey: text("collector_key"),
    extractionContentHash: text("extraction_content_hash"),
    reviewedContentHash: text("reviewed_content_hash"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("appearance_proposals_appearance_id_idx").on(table.appearanceId),
    index("appearance_proposals_status_idx").on(table.status),
  ],
);

export const proposalSourceLinksTable = pgTable(
  "proposal_source_links",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references(() => appearanceProposalsTable.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sourceItemsTable.id, { onDelete: "restrict" }),
    sourceIdentityId: text("source_identity_id").references(
      () => sourceIdentitiesTable.id,
      { onDelete: "restrict" },
    ),
    evidenceKey: text("evidence_key").notNull(),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishedOn: date("published_on", { mode: "string" }),
    publishedAtPrecision: publishedAtPrecisionEnum("published_at_precision"),
    extractionConfidence: integer("extraction_confidence"),
    reviewMetadata: jsonb("review_metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "proposal_source_links_evidence_key_normalized",
      sql`${table.evidenceKey} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    uniqueIndex("proposal_source_links_proposal_source_evidence_unique").on(
      table.proposalId,
      table.sourceId,
      table.evidenceKey,
    ),
  ],
);

export const appearanceRevisionsTable = pgTable(
  "appearance_revisions",
  {
    appearanceId: text("appearance_id")
      .notNull()
      .references(() => appearancesTable.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    operation: proposalOperationEnum("operation").notNull(),
    snapshotSchemaVersion: integer("snapshot_schema_version").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    proposalId: text("proposal_id").references(() => appearanceProposalsTable.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "appearance_revisions_appearance_version_pk",
      columns: [table.appearanceId, table.version],
    }),
    check("appearance_revisions_version_positive", sql`${table.version} > 0`),
    check(
      "appearance_revisions_snapshot_schema_version_positive",
      sql`${table.snapshotSchemaVersion} > 0`,
    ),
  ],
);

export const contentManagementStateTable = pgTable(
  "content_management_state",
  {
    id: text("id").primaryKey(),
    contentMode: contentModeEnum("content_mode").default("bootstrap").notNull(),
    adminActivatedAt: timestamp("admin_activated_at", {
      withTimezone: true,
      mode: "date",
    }),
    legacyImportLockedAt: timestamp("legacy_import_locked_at", {
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("content_management_state_singleton", sql`${table.id} = 'singleton'`),
  ],
);

export const appearanceBackfillCheckpointsTable = pgTable(
  "appearance_backfill_checkpoints",
  {
    id: text("id").primaryKey(),
    lastAppearanceId: text("last_appearance_id"),
    processedCount: integer("processed_count").default(0).notNull(),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    dualWriteConfirmedAt: timestamp("dual_write_confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("appearance_backfill_checkpoints_singleton", sql`${table.id} = 'phase-1b'`),
    check(
      "appearance_backfill_checkpoints_processed_count_nonnegative",
      sql`${table.processedCount} >= 0`,
    ),
  ],
);
