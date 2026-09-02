import "server-only";

import { parseAdminPasswordVerifier } from "./password";

type Environment = Record<string, string | undefined>;

export type AdminConfig = {
  enabled: true;
  writeEnabled: boolean;
  appOrigin: URL;
  passwordVerifier: string;
  sessionSecret: string;
  rateLimitSecret: string;
};

export class AdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminConfigurationError";
  }
}

function parseBooleanFlag(name: string, value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new AdminConfigurationError(`${name} must be true or false.`);
}

export function readAdminUiEnabled(env: Environment = process.env) {
  return parseBooleanFlag("ADMIN_UI_ENABLED", env.ADMIN_UI_ENABLED, false);
}

export function parseAppOrigin(value: string, nodeEnv: string | undefined) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AdminConfigurationError("APP_ORIGIN must be an absolute origin.");
  }

  if (
    value !== url.origin ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new AdminConfigurationError("APP_ORIGIN must contain only one exact origin.");
  }
  if (nodeEnv === "production" && url.protocol !== "https:") {
    throw new AdminConfigurationError("APP_ORIGIN must use HTTPS in production.");
  }

  return url;
}

function requireSecret(env: Environment, name: string, minimumBytes: number) {
  const value = env[name];
  if (!value || Buffer.byteLength(value, "utf8") < minimumBytes) {
    throw new AdminConfigurationError(`${name} is missing or too short.`);
  }
  return value;
}

export function readAdminConfig(env: Environment = process.env): AdminConfig | null {
  if (!readAdminUiEnabled(env)) return null;

  const passwordVerifier = requireSecret(env, "ADMIN_PASSWORD_HASH", 32);
  try {
    parseAdminPasswordVerifier(passwordVerifier);
  } catch {
    throw new AdminConfigurationError("ADMIN_PASSWORD_HASH is invalid.");
  }

  return {
    enabled: true,
    writeEnabled: parseBooleanFlag(
      "ADMIN_WRITE_ENABLED",
      env.ADMIN_WRITE_ENABLED,
      false,
    ),
    appOrigin: parseAppOrigin(
      requireSecret(env, "APP_ORIGIN", 8),
      env.NODE_ENV,
    ),
    passwordVerifier,
    sessionSecret: requireSecret(env, "ADMIN_SESSION_SECRET", 32),
    rateLimitSecret: requireSecret(env, "ADMIN_RATE_LIMIT_SECRET", 32),
  };
}
