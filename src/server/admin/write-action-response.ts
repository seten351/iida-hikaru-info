import "server-only";

import { AdminWriteValidationError } from "./write-input";

export type AdminWriteActionErrorState = {
  stage: "error";
  message: string;
};

const genericWriteActionErrorMessage =
  "変更を処理できませんでした。内容を再確認してください。";

/**
 * Server Actions serialize this state to the browser. Authorization and
 * configuration failures must therefore not expose internal details.
 */
export function createAdminWriteActionErrorState(
  error: unknown,
): AdminWriteActionErrorState {
  return {
    stage: "error",
    message:
      error instanceof AdminWriteValidationError
        ? error.message
        : genericWriteActionErrorMessage,
  };
}
