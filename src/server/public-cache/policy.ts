import { createHash } from "node:crypto";

export type CacheEnvironment = Record<string, string | undefined>;
export const publicCacheLife = { stale: 30, revalidate: 600, expire: 900 } as const;

/** Credentials never enter cache keys, requests or logs. Pool/direct URLs share a scope. */
export function databaseCacheScope(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database protocol");
  const identity = `${url.hostname.replace(/-pooler(?=\.)/, "")}:${url.port || "5432"}${url.pathname}`;
  return createHash("sha256").update(identity).digest("hex");
}
export function publicCacheTag(scope: string) { return `public-data:v1:${scope}`; }

export function configuredCacheScope(env: CacheEnvironment): string | null {
  if (!env.DATABASE_URL || !env.PUBLIC_CACHE_DB_SCOPE) return null;
  try {
    const scope = databaseCacheScope(env.DATABASE_URL);
    return scope === env.PUBLIC_CACHE_DB_SCOPE ? scope : null;
  } catch { return null; }
}
export function enabledPublicCacheScope(env: CacheEnvironment): string | null {
  if (env.VERCEL_ENV !== "production" || env.PUBLIC_DB_CACHE_ENABLED !== "1") return null;
  return configuredCacheScope(env);
}
