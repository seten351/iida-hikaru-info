import { timingSafeEqual } from "node:crypto";
import { enabledPublicCacheScope, type CacheEnvironment } from "./policy";

/** Validate before invalidating; this endpoint never queries or mutates the DB. */
export async function handlePublicCacheInvalidation(
  request: Request, env: CacheEnvironment, invalidate: (scope: string) => void | Promise<void>,
) {
  const respond = (status: number, body: object) => Response.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
  const scope = enabledPublicCacheScope(env);
  if (!scope) return respond(503, { status: "disabled" });
  const secret = env.PUBLIC_CACHE_INVALIDATION_SECRET;
  if (!secret || secret.length < 32) return respond(503, { status: "disabled" });
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return respond(401, { status: "unauthorized" });
  if (request.method !== "POST") return respond(405, { status: "method-not-allowed" });
  const reader = request.body?.getReader();
  if (!reader) return respond(400, { status: "invalid-input" });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 1024) { await reader.cancel(); return respond(413, { status: "invalid-input" }); }
    chunks.push(part.value);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || body.scope !== scope || Object.keys(body).some(key => key !== "scope")) return respond(400, { status: "invalid-scope" });
  } catch { return respond(400, { status: "invalid-input" }); }
  try {
    await invalidate(scope);
    return respond(200, { status: "invalidated" });
  } catch { return respond(503, { status: "failed" }); }
}
