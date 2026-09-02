import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export const adminPasswordParameters = {
  N: 131_072,
  r: 8,
  p: 1,
  keyLength: 32,
  saltLength: 16,
  maxmem: 256 * 1024 * 1024,
} as const;

export type AdminPasswordVerifier = {
  salt: Buffer;
  derivedKey: Buffer;
};

export function parseAdminPasswordVerifier(value: string): AdminPasswordVerifier {
  const parts = value.split("$");
  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt" ||
    parts[1] !== "v=1" ||
    parts[2] !== `N=${adminPasswordParameters.N}` ||
    parts[3] !== `r=${adminPasswordParameters.r},p=${adminPasswordParameters.p}`
  ) {
    throw new Error("ADMIN_PASSWORD_HASH has an unsupported format.");
  }

  const salt = Buffer.from(parts[4], "base64url");
  const derivedKey = Buffer.from(parts[5], "base64url");
  if (
    salt.toString("base64url") !== parts[4] ||
    derivedKey.toString("base64url") !== parts[5] ||
    salt.length < adminPasswordParameters.saltLength ||
    derivedKey.length !== adminPasswordParameters.keyLength
  ) {
    throw new Error("ADMIN_PASSWORD_HASH has invalid key material.");
  }

  return { salt, derivedKey };
}

async function deriveAdminPassword(password: string, salt: Buffer) {
  if (Buffer.byteLength(password, "utf8") > 1024) {
    throw new Error("Password input is too long.");
  }

  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      adminPasswordParameters.keyLength,
      {
        N: adminPasswordParameters.N,
        r: adminPasswordParameters.r,
        p: adminPasswordParameters.p,
        maxmem: adminPasswordParameters.maxmem,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function createAdminPasswordVerifier(password: string) {
  if (password.length < 16) {
    throw new Error("Admin password must be at least 16 characters.");
  }

  const salt = randomBytes(adminPasswordParameters.saltLength);
  const derivedKey = await deriveAdminPassword(password, salt);

  return [
    "scrypt",
    "v=1",
    `N=${adminPasswordParameters.N}`,
    `r=${adminPasswordParameters.r},p=${adminPasswordParameters.p}`,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyAdminPassword(password: string, verifier: string) {
  const parsed = parseAdminPasswordVerifier(verifier);
  const candidate = await deriveAdminPassword(password, parsed.salt);
  return timingSafeEqual(candidate, parsed.derivedKey);
}
