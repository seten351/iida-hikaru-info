import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { parseAdminWriteInput, type AdminWriteInput } from "./write-input";

const tokenLifetimeMilliseconds = 15 * 60 * 1000;

type PreviewEnvelope = {
  version: 1;
  idempotencyKey: string;
  expiresAt: number;
  input: AdminWriteInput;
};

function signature(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`admin-write-preview:v1:${encodedPayload}`)
    .digest();
}

export function createAdminPreviewToken(
  input: AdminWriteInput,
  secret: string,
  now = new Date(),
) {
  const envelope: PreviewEnvelope = {
    version: 1,
    idempotencyKey: randomUUID(),
    expiresAt: now.getTime() + tokenLifetimeMilliseconds,
    input: parseAdminWriteInput(input),
  };
  const encodedPayload = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret).toString("base64url")}`;
}

export function verifyAdminPreviewToken(
  token: string,
  secret: string,
  now = new Date(),
) {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;
  let supplied: Buffer;
  try {
    supplied = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  const expected = signature(encodedPayload, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const envelope = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<PreviewEnvelope>;
    if (
      envelope.version !== 1 ||
      typeof envelope.idempotencyKey !== "string" ||
      !/^[0-9a-f-]{36}$/.test(envelope.idempotencyKey) ||
      typeof envelope.expiresAt !== "number" ||
      envelope.expiresAt < now.getTime()
    ) {
      return null;
    }
    return {
      idempotencyKey: envelope.idempotencyKey,
      input: parseAdminWriteInput(envelope.input),
    };
  } catch {
    return null;
  }
}
