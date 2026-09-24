import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnvFile } from "node:process";
import { closeWriterDb } from "../../src/db/client";
import { appearanceImportData } from "../appearance-import-data";
import { sendDiscordNotification } from "./discord-notifier";
import { scrapeRaccoonDogProfile } from "./scrapers/raccoon-dog";
import { scrapeOnsenProgram, scrapeHikaroomProgram, scrapePikanonoProgram } from "./scrapers/web-programs";
import { fetchHikaruNewsFeed } from "./scrapers/news-feed";
import { executePatrol, type PatrolReport } from "./service";
import { createPatrolStore, withPatrolLock, type PatrolStore } from "./store";

async function main() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--dry-run")) throw new Error("Unsupported patrol argument.");
  const dryRun = args.includes("--dry-run");
  const comparison = process.env.DATABASE_URL ? "database" : "repository";
  const reportPath = process.env.PATROL_REPORT_PATH ?? ".patrol-output/report.json";
  let report: PatrolReport = {
    mode: dryRun ? "dry-run" : "backup", checkedAt: new Date().toISOString(), sources: [],
    candidates: [], notificationCount: 0, resolvedCount: 0, errors: [],
  };
  try {
    if (!dryRun && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
    if (!dryRun && !process.env.DISCORD_WEBHOOK_URL) throw new Error("DISCORD_WEBHOOK_URL is required.");
    const readOnlyFallback = async () => { throw new Error("Repository comparison is read-only."); };
    const store: PatrolStore = process.env.DATABASE_URL ? createPatrolStore() : {
      known: async () => appearanceImportData,
      enqueue: readOnlyFallback, pending: readOnlyFallback,
      markRegistered: readOnlyFallback, markNotified: readOnlyFallback,
    };
    console.log(`[Patrol] ${dryRun ? "DRY-RUN" : "BACKUP"}; comparing with ${comparison}. Antigravity remains the primary updater.`);
    const run = () => executePatrol({
      dryRun, store,
      collectors: [
        { name: "agency-profile", collect: scrapeRaccoonDogProfile },
        { name: "onsen-kannahikaru", collect: scrapeOnsenProgram },
        { name: "youtube-hikaroom", collect: scrapeHikaroomProgram },
        { name: "youtube-pikanono", collect: scrapePikanonoProgram },
        { name: "news-rss", collect: fetchHikaruNewsFeed },
      ],
      notify: (items, onBatchSent) => sendDiscordNotification(items, undefined, { onBatchSent }),
    });
    report = dryRun ? await run() : await withPatrolLock(run);
  } catch {
    report.errors.push("Patrol configuration or database operation failed. Check required Secrets and Admin activation.");
  } finally {
    await closeWriterDb();
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify({ ...report, comparison }, null, 2) + "\n");
    const summary = [
      `Patrol mode: ${report.mode}; comparison: ${comparison}`,
      ...report.sources.map(source => `${source.name}: ${source.error ? "FAILED" : source.count + " items"}`),
      `Unregistered candidates: ${report.candidates.length}`,
      `Notifications delivered: ${report.notificationCount}`,
      `Already registered candidates resolved: ${report.resolvedCount}`,
      ...report.errors.map(error => `ERROR: ${error}`),
    ].join("\n");
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 補助巡回の結果\n\n\`\`\`text\n${summary}\n\`\`\`\n`);
    if (report.errors.length) process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("[Patrol] Failed to complete the run or write its report.");
  process.exitCode = 1;
});
