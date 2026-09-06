"use server";

import { revalidatePath } from "next/cache";

import { requireAdminWriteRequest } from "@/server/admin/auth";
import {
  createAdminPreviewToken,
  verifyAdminPreviewToken,
} from "@/server/admin/preview-token";
import {
  confirmAdminWrite,
  rejectAdminWrite,
  validateAdminWritePreview,
} from "@/server/admin/write-service";
import {
  AdminWriteValidationError,
  parseAdminWriteInput,
  type AdminWriteInput,
} from "@/server/admin/write-input";

export type AdminWriteActionState =
  | { stage: "idle" }
  | { stage: "preview"; token: string; input: AdminWriteInput }
  | {
      stage: "complete";
      status: "approved" | "rejected" | "superseded";
      message: string;
      proposalIds: string[];
    }
  | { stage: "error"; message: string };

export const initialAdminWriteState: AdminWriteActionState = { stage: "idle" };

function safeMessage(error: unknown) {
  return error instanceof AdminWriteValidationError
    ? error.message
    : "変更を処理できませんでした。内容を再確認してください。";
}

function decodeInput(formData: FormData) {
  const serialized = formData.get("input");
  if (typeof serialized !== "string" || serialized.length > 100_000) {
    throw new AdminWriteValidationError("変更内容が不正です。");
  }
  try {
    return parseAdminWriteInput(JSON.parse(serialized));
  } catch (error) {
    if (error instanceof AdminWriteValidationError) throw error;
    throw new AdminWriteValidationError("変更内容を読み取れませんでした。");
  }
}

export async function previewAdminWriteAction(
  _previousState: AdminWriteActionState,
  formData: FormData,
): Promise<AdminWriteActionState> {
  try {
    const { config } = await requireAdminWriteRequest();
    const input = await validateAdminWritePreview(decodeInput(formData));
    return {
      stage: "preview",
      input,
      token: createAdminPreviewToken(input, config.sessionSecret),
    };
  } catch (error) {
    return { stage: "error", message: safeMessage(error) };
  }
}

export async function finalizeAdminWriteAction(
  _previousState: AdminWriteActionState,
  formData: FormData,
): Promise<AdminWriteActionState> {
  try {
    const { config } = await requireAdminWriteRequest();
    const token = formData.get("previewToken");
    if (typeof token !== "string") {
      throw new AdminWriteValidationError("preview tokenがありません。");
    }
    const preview = verifyAdminPreviewToken(token, config.sessionSecret);
    if (!preview) {
      throw new AdminWriteValidationError("previewの有効期限または署名を確認できません。");
    }
    const decision = formData.get("decision");
    if (decision !== "confirm" && decision !== "reject") {
      throw new AdminWriteValidationError("確定操作が不正です。");
    }
    const result =
      decision === "confirm"
        ? await confirmAdminWrite(preview.input, preview.idempotencyKey)
        : await rejectAdminWrite(preview.input, preview.idempotencyKey);

    if (result.status === "approved") {
      revalidatePath("/", "layout");
      revalidatePath("/admin", "layout");
    } else {
      revalidatePath("/admin/proposals");
    }
    return {
      stage: "complete",
      status: result.status,
      message:
        result.status === "approved"
          ? result.replayed
            ? "この変更は既に確定済みです。"
            : "変更を確定しました。"
          : result.message,
      proposalIds: result.proposalIds,
    };
  } catch (error) {
    return { stage: "error", message: safeMessage(error) };
  }
}
