import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { adminActivationReauthDurationSeconds } from "@/lib/admin-constants";

type ActivationReauthPayload = {
  v: 1;
  sub: "admin";
  sid: string;
  purpose: "activation";
  iat: number;
  exp: number;
  nonce: string;
};

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`admin-reauth:activation:v1:${encodedPayload}`)
    .digest();
}

export function createAdminActivationReauthProof(
  secret: string,
  sessionId: string,
  now: Date = new Date(),
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: ActivationReauthPayload = {
    v: 1,
    sub: "admin",
    sid: sessionId,
    purpose: "activation",
    iat: issuedAt,
    exp: issuedAt + adminActivationReauthDurationSeconds,
    nonce: randomUUID(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload, secret).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyAdminActivationReauthProof(
  proof: string | undefined,
  secret: string,
  sessionId: string,
  now: Date = new Date(),
) {
  if (!proof || proof.length > 4096) return false;
  const parts = proof.split(".");
  if (parts.length !== 2) return false;

  const expected = sign(parts[0], secret);
  const provided = Buffer.from(parts[1], "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as Partial<ActivationReauthPayload>;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    return (
      payload.v === 1 &&
      payload.sub === "admin" &&
      payload.sid === sessionId &&
      payload.purpose === "activation" &&
      typeof payload.iat === "number" &&
      typeof payload.exp === "number" &&
      payload.iat <= nowSeconds + 60 &&
      payload.exp > nowSeconds &&
      payload.exp - payload.iat === adminActivationReauthDurationSeconds &&
      typeof payload.nonce === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        payload.nonce,
      )
    );
  } catch {
    return false;
  }
}
