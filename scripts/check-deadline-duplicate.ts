import "server-only";
import { normalizeDeadlineText, getReceptionFields, receptionInformationTypeLabels, getReceptionStatusLabel } from "../src/domain/deadline";
import { readDeadlineRecords } from "../src/server/deadlines/record-reader";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.log("Usage: npm run check:deadline-duplicate -- <title | stage | source URL | appearance ID>");
    process.exitCode = 1;
    return;
  }
  const normalizedQuery = normalizeDeadlineText(query);
  const rows = await readDeadlineRecords();
  const matches = rows.filter((row) => {
    const textFields = [row.id, row.label, row.projectTitle, row.organizer, row.applicationUrl ?? "", row.source.canonicalUrl, row.source.externalItemId,
      receptionInformationTypeLabels[getReceptionFields(row).informationType], ...row.sourceEvidence.flatMap(source => [source.canonicalUrl, source.evidenceKey]), ...row.appearanceIds];
    return textFields.some((value) => value.toLocaleLowerCase("ja-JP").includes(query.toLocaleLowerCase("ja-JP")) || (normalizedQuery.length >= 3 && normalizeDeadlineText(value).includes(normalizedQuery)));
  });

  if (!matches.length) {
    console.log("No matching deadlines found.");
    return;
  }
  for (const row of matches) {
    console.log(`- ${row.id} [${row.visibilityStatus}] ${row.projectTitle} / ${row.label}`);
    console.log(`  State: ${row.state}; cutoff: ${row.deadlineAt ?? row.deadlineOn ?? "unknown"}; version: ${row.version}`);
    console.log(`  Type: ${receptionInformationTypeLabels[getReceptionFields(row).informationType]}; start: ${row.startsAt ?? row.startsOn ?? "unknown"}; status: ${getReceptionStatusLabel(row, new Date())}`);
    console.log(`  Source: ${row.source.canonicalUrl} (${row.source.evidenceKey})`);
    if (row.appearanceIds.length) console.log(`  Appearance IDs: ${row.appearanceIds.join(", ")}`);
  }
}

main().catch(() => {
  console.error("Deadline duplicate check failed. Check the database configuration and migration status.");
  process.exitCode = 1;
});
