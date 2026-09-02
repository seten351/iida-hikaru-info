import "server-only";

import { and, eq } from "drizzle-orm";

import { getWriterDb } from "@/db/client";
import { adminAuthAttemptsTable } from "@/db/schema";

const windowMilliseconds = 15 * 60 * 1000;
const blockMilliseconds = 15 * 60 * 1000;
const maximumAttempts = 5;

export async function reserveAdminLoginAttempt(
  ipHash: string,
  now: Date = new Date(),
) {
  return getWriterDb().transaction(async (tx) => {
    await tx
      .insert(adminAuthAttemptsTable)
      .values({
        purpose: "login",
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
          eq(adminAuthAttemptsTable.purpose, "login"),
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
          eq(adminAuthAttemptsTable.purpose, "login"),
          eq(adminAuthAttemptsTable.ipHash, ipHash),
        ),
      );

    return {
      allowed: true as const,
      remainingAttempts: Math.max(0, maximumAttempts - failedCount),
    };
  });
}

export async function clearAdminLoginAttempts(ipHash: string) {
  await getWriterDb()
    .delete(adminAuthAttemptsTable)
    .where(
      and(
        eq(adminAuthAttemptsTable.purpose, "login"),
        eq(adminAuthAttemptsTable.ipHash, ipHash),
      ),
    );
}
