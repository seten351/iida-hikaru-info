"use client";

import { useActionState } from "react";

import { adminActivationConfirmationPhrase } from "@/lib/admin-constants";

import {
  initialActivationReauthState,
  initialActivationState,
} from "./activation-action-state";
import {
  activateAdminAction,
  reauthenticateAdminActivationAction,
} from "./actions";

export function ActivationFlow() {
  const [reauthState, reauthAction, reauthPending] = useActionState(
    reauthenticateAdminActivationAction,
    initialActivationReauthState,
  );
  const [activationState, activationAction, activationPending] = useActionState(
    activateAdminAction,
    initialActivationState,
  );

  if (activationState.stage === "complete") {
    return <p className="admin-activation-complete">{activationState.message}</p>;
  }

  return (
    <div className="admin-activation-flow">
      {reauthState.stage !== "ready" ? (
        <form action={reauthAction} className="admin-write-form">
          <h2>1. 管理者として再認証</h2>
          <label>
            Admin password
            <input
              autoComplete="current-password"
              disabled={reauthPending}
              maxLength={1024}
              name="password"
              required
              type="password"
            />
          </label>
          <button disabled={reauthPending} type="submit">
            {reauthPending ? "検証中…" : "再認証する"}
          </button>
          {reauthState.stage === "error" ? (
            <p className="admin-form-error" role="alert">{reauthState.message}</p>
          ) : null}
        </form>
      ) : null}

      {reauthState.stage === "ready" ? (
        <form action={activationAction} className="admin-write-form admin-activation-confirm">
          <h2>2. 不可逆な切替を確定</h2>
          <p>
            次の文字列を空白も含めて正確に入力してください：
            <code>{adminActivationConfirmationPhrase}</code>
          </p>
          <input name="proof" type="hidden" value={reauthState.proof} />
          <label>
            確認文字列
            <input
              autoComplete="off"
              disabled={activationPending}
              name="confirmation"
              required
              spellCheck={false}
              type="text"
            />
          </label>
          <button className="admin-danger-button" disabled={activationPending} type="submit">
            {activationPending ? "Activation中…" : "永久にAdmin modeへ切り替える"}
          </button>
          {activationState.stage === "error" ? (
            <p className="admin-form-error" role="alert">{activationState.message}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
