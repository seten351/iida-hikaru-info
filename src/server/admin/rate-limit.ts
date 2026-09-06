import "server-only";

import { and, eq } from "drizzle-orm";

import { getWriterDb } from "@/db/client";
import { adminAuthAttemptsTable } from "@/db/schema";

const windowMilliseconds = 15 * 60 * 1000;
const blockMilliseconds = 15 * 60 * 1000;
const loginMaximumAttempts = 5;
const activationMaximumAttempts = 3;

type AdminAuthPurpose = "login" | "activation";

async function reserveAdminAuthAttempt(
  purpose: AdminAuthPurpose,
  maximumAttempts: number,
  ipHash: string,
  now: Date = new Date(),
) {
  return getWriterDb().transaction(async (tx) => {
    await tx
      .insert(adminAuthAttemptsTable)
      .values({
        purpose,
        ipHash,
        windowStartedAt: now,
        failedCount: 0,
        updatedAt: now,
      })
      .onConflictDoNothing();

    const [current] = await tx
      .select()
      .from(adminAuthAttemptsTable)
      .where(
        and(
          eq(adminAuthAttemptsTable.purpose, purpose),
          eq(adminAuthAttemptsTable.ipHash, ipHash),
        ),
      )
      .for("update");

    if (!current) throw new Error("Could not reserve the login attempt.");
    if (current.blockedUntil && current.blockedUntil > now) {
      return { allowed: false as const, retryAt: current.blockedUntil };
    }

    const expired =
      now.getTime() - current.windowStartedAt.getTime() >= windowMilliseconds;
    const failedCount = expired ? 1 : current.failedCount + 1;
    const blockedUntil =
      failedCount >= maximumAttempts
        ? new Date(now.getTime() + blockMilliseconds)
        : null;

    await tx
      .update(adminAuthAttemptsTable)
      .set({
        windowStartedAt: expired ? now : current.windowStartedAt,
        failedCount,
        blockedUntil,
        updatedAt: now,
      })
      .where(
        and(
          eq(adminAuthAttemptsTable.purpose, purpose),
          eq(adminAuthAttemptsTable.ipHash, ipHash),
        ),
      );

    return {
      allowed: true as const,
      remainingAttempts: Math.max(0, maximumAttempts - failedCount),
    };
  });
}

async function clearAdminAuthAttempts(purpose: AdminAuthPurpose, ipHash: string) {
  await getWriterDb()
    .delete(adminAuthAttemptsTable)
    .where(
      and(
        eq(adminAuthAttemptsTable.purpose, purpose),
        eq(adminAuthAttemptsTable.ipHash, ipHash),
      ),
    );
}

export function reserveAdminLoginAttempt(ipHash: string, now: Date = new Date()) {
  return reserveAdminAuthAttempt("login", loginMaximumAttempts, ipHash, now);
}

export function clearAdminLoginAttempts(ipHash: string) {
  return clearAdminAuthAttempts("login", ipHash);
}

export function reserveAdminActivationAttempt(
  ipHash: string,
  now: Date = new Date(),
) {
  return reserveAdminAuthAttempt(
    "activation",
    activationMaximumAttempts,
    ipHash,
    now,
  );
}

export function clearAdminActivationAttempts(ipHash: string) {
  return clearAdminAuthAttempts("activation", ipHash);
}
