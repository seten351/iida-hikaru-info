import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { adminSessionDurationSeconds } from "@/lib/admin-constants";

type SessionPayload = {
  v: 1;
  sub: "admin";
  sid: string;
  iat: number;
  exp: number;
};

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function createAdminSessionToken(
  secret: string,
  now: Date = new Date(),
): { token: string; expiresAt: Date } {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = {
    v: 1,
    sub: "admin",
    sid: randomUUID(),
    iat: issuedAt,
    exp: issuedAt + adminSessionDurationSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload, secret).toString("base64url");
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
  now: Date = new Date(),
): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const expected = sign(parts[0], secret);
  const provided = Buffer.from(parts[1], "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      payload.v !== 1 ||
      payload.sub !== "admin" ||
      typeof payload.sid !== "string" ||
      payload.sid.length < 16 ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.iat > nowSeconds + 60 ||
      payload.exp <= nowSeconds ||
      payload.exp - payload.iat !== adminSessionDurationSeconds
    ) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
