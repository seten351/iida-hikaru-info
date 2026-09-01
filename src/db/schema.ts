import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { appearanceCategories } from "../domain/appearance";

export const appearanceCategoryEnum = pgEnum(
  "appearance_category",
  appearanceCategories,
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
    eventGroupId: text("event_group_id"),
    eventTitle: text("event_title"),
    sessionLabel: text("session_label"),
    category: appearanceCategoryEnum("category").notNull(),
    sourceUrl: text("source_url").notNull(),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    sourceName: text("source_name"),
    sourceItemId: text("source_item_id"),
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
      "appearances_event_group_fields_complete",
      sql`(${table.eventGroupId} is null and ${table.eventTitle} is null and ${table.sessionLabel} is null)
        or (${table.eventGroupId} is not null and ${table.eventTitle} is not null and ${table.sessionLabel} is not null)`,
    ),
    index("appearances_starts_at_idx").on(table.startsAt),
    index("appearances_published_at_idx").on(table.publishedAt),
    index("appearances_event_group_id_idx").on(table.eventGroupId),
    uniqueIndex("appearances_source_item_unique")
      .on(table.sourceName, table.sourceItemId)
      .where(
        sql`${table.sourceName} is not null and ${table.sourceItemId} is not null`,
      ),
  ],
);
