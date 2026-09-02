import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
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
