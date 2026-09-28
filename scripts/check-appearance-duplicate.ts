import "server-only";
import { getDb } from "../src/db/client";
import { appearancesTable, appearanceSourceLinksTable, sourceItemsTable } from "../src/db/schema";
import { eq, ilike, or } from "drizzle-orm";

function normalize(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^(ゲーム|asmr|tvアニメ|webアニメ|アニメ|ラジオ|配信)『?/, "")
    .replace(/[『』「」()（）]/g, "")
    .replace(/(役|出演)$/, "")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.log("Usage: npx tsx scripts/check-appearance-duplicate.ts <title | character | url | date>");
    process.exit(1);
  }

  const db = getDb();
  console.log(`Checking database for existing appearances matching: "${query}"...\n`);

  // 1. Check exact or partial source URL
  const matchingSources = await db
    .select({
      appearanceId: appearanceSourceLinksTable.appearanceId,
      canonicalUrl: sourceItemsTable.canonicalUrl,
      title: appearancesTable.title,
      category: appearancesTable.category,
      startsOn: appearancesTable.startsOn,
      startsAt: appearancesTable.startsAt,
      visibilityStatus: appearancesTable.visibilityStatus,
    })
    .from(appearanceSourceLinksTable)
    .innerJoin(sourceItemsTable, eq(appearanceSourceLinksTable.sourceId, sourceItemsTable.id))
    .innerJoin(appearancesTable, eq(appearanceSourceLinksTable.appearanceId, appearancesTable.id))
    .where(ilike(sourceItemsTable.canonicalUrl, `%${query}%`));

  if (matchingSources.length > 0) {
    console.log("=== Matching by Source URL ===");
    for (const match of matchingSources) {
      console.log(`- Appearance ID: ${match.appearanceId}`);
      console.log(`  Title:         ${match.title}`);
      console.log(`  Category:      ${match.category}`);
      console.log(`  Date:          ${match.startsOn ?? match.startsAt?.toISOString()}`);
      console.log(`  Source URL:    ${match.canonicalUrl}`);
      console.log(`  Visibility:    ${match.visibilityStatus}\n`);
    }
  }

  // 2. Check title / ID / eventTitle in appearancesTable
  const matchingAppearances = await db
    .select({
      id: appearancesTable.id,
      title: appearancesTable.title,
      category: appearancesTable.category,
      startsOn: appearancesTable.startsOn,
      startsAt: appearancesTable.startsAt,
      sourceUrl: appearancesTable.sourceUrl,
      visibilityStatus: appearancesTable.visibilityStatus,
    })
    .from(appearancesTable)
    .where(
      or(
        ilike(appearancesTable.title, `%${query}%`),
        ilike(appearancesTable.id, `%${query}%`),
        ilike(appearancesTable.sourceUrl, `%${query}%`),
      ),
    );

  // Also do normalized keyword comparison if no direct ILIKE
  const allRows = await db
    .select({
      id: appearancesTable.id,
      title: appearancesTable.title,
      category: appearancesTable.category,
      startsOn: appearancesTable.startsOn,
      startsAt: appearancesTable.startsAt,
      sourceUrl: appearancesTable.sourceUrl,
      visibilityStatus: appearancesTable.visibilityStatus,
    })
    .from(appearancesTable);

  const normQuery = normalize(query);
  const normalizedMatches = allRows.filter((row) => {
    if (matchingAppearances.some((m) => m.id === row.id)) return false;
    if (matchingSources.some((m) => m.appearanceId === row.id)) return false;
    const normTitle = normalize(row.title);
    return (
      (normQuery.length >= 3 && normTitle.includes(normQuery)) ||
      (normTitle.length >= 3 && normQuery.includes(normTitle))
    );
  });

  const combinedTitleMatches = [...matchingAppearances, ...normalizedMatches];
  if (combinedTitleMatches.length > 0) {
    console.log("=== Matching by Title / ID ===");
    for (const match of combinedTitleMatches) {
      console.log(`- Appearance ID: ${match.id}`);
      console.log(`  Title:         ${match.title}`);
      console.log(`  Category:      ${match.category}`);
      console.log(`  Date:          ${match.startsOn ?? match.startsAt?.toISOString()}`);
      console.log(`  Source URL:    ${match.sourceUrl}`);
      console.log(`  Visibility:    ${match.visibilityStatus}\n`);
    }
  }

  if (matchingSources.length === 0 && combinedTitleMatches.length === 0) {
    console.log("✔ No existing appearances found matching query.");
  } else {
    console.log("⚠ Existing appearances found! If this candidate is an update or new source for one of these works, do NOT create a new appearance ID. Update the existing appearance or attach the new source.");
  }
}

main().catch((err) => {
  console.error("Error checking duplicates:", err);
  process.exit(1);
});
