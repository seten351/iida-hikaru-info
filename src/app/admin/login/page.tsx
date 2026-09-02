import { redirect } from "next/navigation";

import { readOptionalAdminSession } from "@/server/admin/auth";

import { LoginForm } from "./login-form";

export default async function AdminLoginPage() {
  let current = null;
  try {
    current = await readOptionalAdminSession();
  } catch {
    return null;
  }
  if (current) redirect("/admin/proposals");

  return (
    <main className="admin-login-shell">
      <section className="admin-login-card">
        <p className="admin-eyebrow">READ-ONLY ADMIN</p>
        <h1>管理画面</h1>
        <p>Phase 2Aではデータの確認だけができます。</p>
        <LoginForm />
      </section>
    </main>
  );
}
