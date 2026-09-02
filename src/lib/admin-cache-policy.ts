export const adminNoStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

export type AdminResponseCacheKind = "get" | "rsc" | "action";

function parseDirectives(cacheControl: string) {
  return cacheControl.split(",").map((directive) => {
    const [rawName, ...rawValue] = directive.trim().toLowerCase().split("=");
    return {
      name: rawName.trim(),
      value: rawValue.join("=").trim().replace(/^"|"$/g, ""),
    };
  });
}

/**
 * Returns the rollout stop conditions represented by Cache-Control.
 * GET and RSC responses contain authenticated content and must be private;
 * Server Action POST responses need no-store but Next may omit private there.
 */
export function getAdminCacheFailures(
  headers: Headers,
  kind: AdminResponseCacheKind,
): string[] {
  const cacheControl = headers.get("cache-control");
  if (!cacheControl) return ["Cache-Control is missing"];

  const directives = parseDirectives(cacheControl);
  const names = new Set(directives.map((directive) => directive.name));
  const failures: string[] = [];

  if (!names.has("no-store")) failures.push("Cache-Control lacks no-store");
  if ((kind === "get" || kind === "rsc") && !names.has("private")) {
    failures.push("Cache-Control lacks private for an Admin GET/RSC response");
  }
  if (names.has("public")) failures.push("Cache-Control contains public");
  if (names.has("s-maxage")) failures.push("Cache-Control contains s-maxage");
  if (names.has("immutable")) failures.push("Cache-Control contains immutable");
  if (directives.some((directive) => directive.name.startsWith("stale-"))) {
    failures.push("Cache-Control contains a stale cache directive");
  }
  if (
    directives.some(
      (directive) =>
        directive.name === "max-age" &&
        (!/^\d+$/.test(directive.value) || Number(directive.value) > 0),
    )
  ) {
    failures.push("Cache-Control contains a cacheable max-age");
  }

  return failures;
}
