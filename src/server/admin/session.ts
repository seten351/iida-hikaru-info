import "server-only";

import { cookies } from "next/headers";

import {
  adminSessionCookieName,
  adminSessionDurationSeconds,
} from "@/lib/admin-constants";
import type { AdminConfig } from "@/server/admin/config";
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@/server/admin/session-token";

export async function createAdminSession(config: AdminConfig) {
  const { token, expiresAt } = createAdminSessionToken(config.sessionSecret);
  (await cookies()).set(adminSessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    expires: expiresAt,
    maxAge: adminSessionDurationSeconds,
    priority: "high",
  });
}

export async function deleteAdminSession() {
  (await cookies()).set(adminSessionCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function readAdminSession(config: AdminConfig) {
  const token = (await cookies()).get(adminSessionCookieName)?.value;
  return verifyAdminSessionToken(token, config.sessionSecret);
}
