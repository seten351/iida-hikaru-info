"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readAdminConfig } from "@/server/admin/config";
import {
  getAdminClientAddress,
  hashAdminClientAddress,
  isTrustedAdminRequest,
} from "@/server/admin/origin";
import { verifyAdminPassword } from "@/server/admin/password";
import {
  clearAdminLoginAttempts,
  reserveAdminLoginAttempt,
} from "@/server/admin/rate-limit";
import {
  createAdminSession,
  deleteAdminSession,
  readAdminSession,
} from "@/server/admin/session";

export type LoginState = { message: string } | null;

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  let config;
  try {
    config = readAdminConfig();
  } catch {
    return { message: "管理画面を利用できません。" };
  }
  if (!config) return { message: "管理画面は無効です。" };

  const requestHeaders = await headers();
  if (!isTrustedAdminRequest(requestHeaders, config)) {
    return { message: "リクエストを確認できませんでした。" };
  }

  const password = formData.get("password");
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    Buffer.byteLength(password, "utf8") > 1024
  ) {
    return { message: "パスワードを確認してください。" };
  }

  const ipHash = hashAdminClientAddress(
    getAdminClientAddress(requestHeaders),
    config.rateLimitSecret,
  );
  const reservation = await reserveAdminLoginAttempt(ipHash);
  if (!reservation.allowed) {
    return { message: "試行回数が上限に達しました。時間をおいて再試行してください。" };
  }

  const verified = await verifyAdminPassword(password, config.passwordVerifier);
  if (!verified) return { message: "パスワードを確認してください。" };

  await clearAdminLoginAttempts(ipHash);
  await createAdminSession(config);
  redirect("/admin/proposals");
}

export async function logoutAction() {
  let config;
  try {
    config = readAdminConfig();
  } catch {
    return;
  }
  if (!config) return;
  const requestHeaders = await headers();
  if (!isTrustedAdminRequest(requestHeaders, config)) {
    throw new Error("Untrusted admin request.");
  }
  if (await readAdminSession(config)) await deleteAdminSession();
  redirect("/admin/login");
}
