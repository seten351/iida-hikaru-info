import { configuredCacheScope, type CacheEnvironment } from "./policy";

export type PublicCacheInvalidation = { status: "invalidated" | "skipped" | "failed" };
export type PublicCacheInvalidator = () => Promise<PublicCacheInvalidation>;

/** Notify only a configured app for the same DB, never from a Vercel Preview. */
export async function notifyPublicCacheInvalidation(
  env: CacheEnvironment = process.env,
  send: typeof fetch = fetch,
): Promise<PublicCacheInvalidation> {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") return { status: "skipped" };
  if (!env.PUBLIC_CACHE_INVALIDATION_URL) return { status: "skipped" };
  const scope = configuredCacheScope(env);
  const secret = env.PUBLIC_CACHE_INVALIDATION_SECRET;
  if (!scope || !secret || secret.length < 32) return { status: "failed" };
  let url: URL;
  try {
    url = new URL(env.PUBLIC_CACHE_INVALIDATION_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        url.pathname !== "/api/internal/public-cache/invalidate") return { status: "failed" };
  } catch { return { status: "failed" }; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await send(url, {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ scope }), signal: AbortSignal.timeout(3000),
      });
      if (response.ok && (await response.json()).status === "invalidated") return { status: "invalidated" };
      if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
    } catch {
      // Commit already succeeded. An idempotent replay can retry notification.
    }
  }
  return { status: "failed" };
}

export async function invalidateAfterCommit<T extends { status: string }>(
  commit: () => Promise<T>, invalidate: PublicCacheInvalidator,
): Promise<T & { publicCacheInvalidation?: PublicCacheInvalidation }> {
  const result = await commit();
  if (result.status !== "approved") return result;
  let publicCacheInvalidation: PublicCacheInvalidation;
  try { publicCacheInvalidation = await invalidate(); }
  catch { publicCacheInvalidation = { status: "failed" }; }
  if (publicCacheInvalidation.status === "failed") {
    console.warn("[public-cache] DB確定済み。キャッシュ失効に失敗。同じ操作で再試行してください。");
  }
  return { ...result, publicCacheInvalidation };
}
