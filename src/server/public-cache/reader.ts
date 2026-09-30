import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getAppearancePageData } from "@/server/appearances/repository";
import { enabledPublicCacheScope, publicCacheLife, publicCacheTag } from "./policy";

async function getCachedPublicData(scope: string) {
  "use cache: remote";
  cacheLife(publicCacheLife);
  cacheTag(publicCacheTag(scope));
  const data = await getAppearancePageData();
  console.info("[public-cache] fill complete", {
    appearanceCount: data.appearances.length,
    deadlineCount: data.deadlines.length,
  });
  return data;
}

/** Only public pages use this facade. Admin, preview and CLI readers stay uncached. */
export async function getPublicPageData() {
  const scope = enabledPublicCacheScope(process.env);
  return scope ? getCachedPublicData(scope) : getAppearancePageData();
}
