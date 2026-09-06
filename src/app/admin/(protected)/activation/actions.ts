"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { activateAdminContent } from "@/server/admin/activation-service";
import { requireAdminWriteRequest } from "@/server/admin/auth";
import {
  getAdminClientAddress,
  hashAdminClientAddress,
} from "@/server/admin/origin";
import { verifyAdminPassword } from "@/server/admin/password";
import {
  createAdminActivationReauthProof,
} from "@/server/admin/reauth-proof";
import {
  clearAdminActivationAttempts,
  reserveAdminActivationAttempt,
} from "@/server/admin/rate-limit";

import type {
  ActivationActionState,
  ActivationReauthActionState,
} from "./activation-action-state";

const genericError = "Activationを実行できませんでした。入力と状態を確認してください。";

export async function reauthenticateAdminActivationAction(
  _previousState: ActivationReauthActionState,
  formData: FormData,
): Promise<ActivationReauthActionState> {
  try {
    const { config, session } = await requireAdminWriteRequest();
    const password = formData.get("password");
    if (
      typeof password !== "string" ||
      password.length === 0 ||
      Buffer.byteLength(password, "utf8") > 1024
    ) {
      return { stage: "error", message: genericError };
    }

    const requestHeaders = await headers();
    const ipHash = hashAdminClientAddress(
      getAdminClientAddress(requestHeaders),
      config.rateLimitSecret,
    );
    const reservation = await reserveAdminActivationAttempt(ipHash);
    if (!reservation.allowed) {
      return { stage: "error", message: genericError };
    }

    // scrypt verification deliberately completes before any activation transaction begins.
    if (!(await verifyAdminPassword(password, config.passwordVerifier))) {
      return { stage: "error", message: genericError };
    }
    await clearAdminActivationAttempts(ipHash);
    return {
      stage: "ready",
      proof: createAdminActivationReauthProof(config.sessionSecret, session.sid),
    };
  } catch {
    return { stage: "error", message: genericError };
  }
}

export async function activateAdminAction(
  _previousState: ActivationActionState,
  formData: FormData,
): Promise<ActivationActionState> {
  try {
    // Re-read the cookie, flags and request headers immediately before the transaction.
    const { config, session } = await requireAdminWriteRequest();
    const confirmation = formData.get("confirmation");
    const proof = formData.get("proof");
    if (typeof confirmation !== "string" || typeof proof !== "string") {
      return { stage: "error", message: genericError };
    }
    const result = await activateAdminContent({
      confirmation,
      proof,
      sessionId: session.sid,
      sessionSecret: config.sessionSecret,
      writeEnabled: config.writeEnabled,
    });
    revalidatePath("/admin", "layout");
    return {
      stage: "complete",
      message:
        result.status === "already-activated"
          ? "Admin activationは既に完了しています。"
          : "Admin activationが完了し、legacy importを永久にlockしました。",
    };
  } catch {
    return { stage: "error", message: genericError };
  }
}
