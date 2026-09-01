import { sql } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { appearancesTable } from "../src/db/schema";
import { appearanceSeedData } from "./appearance-seed-data";

const rows = appearanceSeedData.map((item) => ({
  id: item.id,
  startsAt: new Date(item.startsAt),
  title: item.title,
  category: item.category,
  sourceUrl: item.sourceUrl,
  publishedAt: new Date(item.publishedAt),
  sourceName: "sample",
  sourceItemId: item.id,
}));

async function main() {
  await getDb()
    .insert(appearancesTable)
    .values(rows)
    .onConflictDoUpdate({
      target: appearancesTable.id,
      set: {
        startsAt: sql`excluded.starts_at`,
        title: sql`excluded.title`,
        category: sql`excluded.category`,
        sourceUrl: sql`excluded.source_url`,
        publishedAt: sql`excluded.published_at`,
        sourceName: sql`excluded.source_name`,
        sourceItemId: sql`excluded.source_item_id`,
        updatedAt: sql`now()`,
      },
    });

  console.log(`Seeded ${rows.length} appearance records.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
