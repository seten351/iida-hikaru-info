import "server-only";

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  AdminConfigurationError,
  AdminWriteAuthorizationError,
  assertAdminWriteEnabled,
  readAdminConfig,
  readAdminUiEnabled,
} from "@/server/admin/config";
import { readAdminSession } from "@/server/admin/session";
import { isTrustedAdminRequest } from "@/server/admin/origin";

export async function requireAdminSession() {
  let enabled: boolean;
  try {
    enabled = readAdminUiEnabled();
  } catch {
    throw new AdminConfigurationError("Admin feature flags are invalid.");
  }
  if (!enabled) notFound();

  const config = readAdminConfig();
  if (!config) notFound();
  const session = await readAdminSession(config);
  if (!session) redirect("/admin/login");

  return { config, session };
}

export async function requireAdminWriteRequest() {
  const authenticated = await requireAdminSession();
  assertAdminWriteEnabled(authenticated.config.writeEnabled);
  if (!isTrustedAdminRequest(await headers(), authenticated.config)) {
    throw new AdminWriteAuthorizationError("Admin requestのoriginを確認できません。");
  }
  return authenticated;
}

export async function readOptionalAdminSession() {
  const config = readAdminConfig();
  if (!config) return null;
  const session = await readAdminSession(config);
  return session ? { config, session } : null;
}
