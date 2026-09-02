"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = null;

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="admin-login-form">
      <label htmlFor="admin-password">Admin password</label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={1024}
      />
      {state?.message ? <p className="admin-form-error">{state.message}</p> : null}
      <button disabled={pending} type="submit">
        {pending ? "確認中…" : "ログイン"}
      </button>
    </form>
  );
}
