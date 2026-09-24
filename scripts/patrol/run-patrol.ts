import fs from "node:fs";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
if (fs.existsSync(".env.local")) {
  try {
    require("dotenv").config({ path: ".env.local" });
  } catch {
    // ignore
  }
}

import { appearanceImportData } from "../appearance-import-data";
import { scrapeRaccoonDogProfile } from "./scrapers/raccoon-dog";
import { checkProgramUpdates } from "./scrapers/web-programs";
import { fetchHikaruNewsFeed } from "./scrapers/news-feed";
import {
  type AppearanceNotificationItem,
  sendDiscordNotification,
} from "./discord-notifier";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  console.log("==========================================");
  console.log(`[Patrol] Starting appearance patrol (${isDryRun ? "DRY-RUN" : "LIVE"})...`);
  console.log(`[Patrol] Current registered appearances: ${appearanceImportData.length}`);
  console.log("==========================================");

  // 1. Gather current highest episode numbers
  const extractMaxEpisode = (prefix: string) => {
    const numbers = appearanceImportData
      .filter((item) => item.id.startsWith(prefix))
      .map((item) => {
        const m = item.id.match(/-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      });
    return numbers.length > 0 ? Math.max(...numbers) : 0;
  };

  const currentHighest = {
    kannahikaru: extractMaxEpisode("kannahikaru-episode-"),
    pikanono: extractMaxEpisode("pikanono-episode-"),
    hikaroom: extractMaxEpisode("hikaroom-episode-"),
  };

  console.log("[Patrol] Current program episode benchmarks:", currentHighest);

  // 2. Run scrapers in parallel
  const [profileEntries, programUpdates, newsItems] = await Promise.all([
    scrapeRaccoonDogProfile(),
    checkProgramUpdates(currentHighest),
    fetchHikaruNewsFeed(),
  ]);

  const newNotifications: AppearanceNotificationItem[] = [];

  // 3. Evaluate Raccoon Dog Agency Profile entries
  console.log(`[Patrol] Checking ${profileEntries.length} items from agency profile...`);
  const registeredTitles = appearanceImportData.map((item) => item.title.toLowerCase());

  for (const entry of profileEntries) {
    const isRecorded = registeredTitles.some((title) =>
      title.includes(entry.title.toLowerCase()),
    );
    if (!isRecorded) {
      console.log(`[Patrol] 🔔 Potential new title found on agency profile: [${entry.section}] ${entry.title} (${entry.role})`);
      newNotifications.push({
        id: `agency-entry-${Date.now()}`,
        title: `${entry.title}（${entry.role}）`,
        category: entry.section.includes("ゲーム") ? "ゲーム" : "テレビ",
        startsAtLabel: "公式プロフィール掲載",
        sourceUrl: "https://www.raccoon-dog.co.jp/talent/r18-iida.html",
        action: "added",
      });
    }
  }

  // 4. Evaluate Program updates
  for (const update of programUpdates) {
    console.log(`[Patrol] 🔔 New episode detected: ${update.seriesTitle} 第${update.detectedEpisode}回`);
    newNotifications.push({
      id: `${update.seriesId}-episode-${update.detectedEpisode}`,
      title: `${update.seriesTitle} 第${update.detectedEpisode}回`,
      category: "配信",
      startsAtLabel: "次回配信枠",
      sourceUrl: update.sourceUrl,
      action: "added",
    });
  }

  // 5. Evaluate News Items
  console.log(`[Patrol] Evaluated ${newsItems.length} news feed items.`);

  // 6. Report and Send Notifications
  console.log("==========================================");
  if (newNotifications.length === 0) {
    console.log("[Patrol] ✅ All sources checked. No new appearances or changes detected.");
  } else {
    console.log(`[Patrol] 📢 Detected ${newNotifications.length} update(s)!`);
    if (isDryRun) {
      console.log("[Patrol] DRY-RUN: Skipping DB write and Discord notification.");
      for (const item of newNotifications) {
        console.log(` - [${item.action.toUpperCase()}] ${item.title} (${item.startsAtLabel}) -> ${item.sourceUrl}`);
      }
    } else {
      console.log("[Patrol] Sending Discord notification...");
      await sendDiscordNotification(newNotifications);
    }
  }
  console.log("==========================================");
}

main().catch((err) => {
  console.error("[Patrol] Fatal error during patrol run:", err);
  process.exit(1);
});
