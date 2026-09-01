import { sql } from "drizzle-orm";
import {
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
    index("appearances_starts_at_idx").on(table.startsAt),
    index("appearances_published_at_idx").on(table.publishedAt),
    uniqueIndex("appearances_source_item_unique")
      .on(table.sourceName, table.sourceItemId)
      .where(
        sql`${table.sourceName} is not null and ${table.sourceItemId} is not null`,
      ),
  ],
);
