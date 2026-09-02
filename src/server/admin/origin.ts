import "server-only";

import { createHmac } from "node:crypto";

import type { AdminConfig } from "@/server/admin/config";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() ?? null;
}

export function isTrustedAdminRequest(requestHeaders: Headers, config: AdminConfig) {
  if (requestHeaders.get("origin") !== config.appOrigin.origin) return false;

  const host =
    firstHeaderValue(requestHeaders.get("x-forwarded-host")) ??
    firstHeaderValue(requestHeaders.get("host"));
  if (host !== config.appOrigin.host) return false;

  const forwardedProtocol = firstHeaderValue(
    requestHeaders.get("x-forwarded-proto"),
  );
  return !forwardedProtocol || `${forwardedProtocol}:` === config.appOrigin.protocol;
}

export function getAdminClientAddress(requestHeaders: Headers) {
  return (
    firstHeaderValue(requestHeaders.get("x-vercel-forwarded-for")) ??
    firstHeaderValue(requestHeaders.get("x-forwarded-for")) ??
    firstHeaderValue(requestHeaders.get("x-real-ip")) ??
    "unknown"
  );
}

export function hashAdminClientAddress(address: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`admin-rate-limit:v1:${address}`)
    .digest("base64url");
}
