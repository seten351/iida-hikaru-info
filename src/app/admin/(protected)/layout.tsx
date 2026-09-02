import Link from "next/link";
import type { ReactNode } from "react";

import { requireAdminSession } from "@/server/admin/auth";

import { logoutAction } from "../login/actions";

const navigation = [
  ["提案", "/admin/proposals"],
  ["出演", "/admin/appearances"],
  ["情報源", "/admin/sources"],
  ["シリーズ", "/admin/series"],
  ["実行履歴", "/admin/runs"],
] as const;

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { config } = await requireAdminSession();

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <Link className="admin-brand" href="/admin/proposals" prefetch={false}>
            飯田ヒカル出演情報 Admin
          </Link>
          <span className="admin-mode-badge">
            {config.writeEnabled ? "WRITE FLAG ON / UI READ-ONLY" : "READ-ONLY"}
          </span>
        </div>
        <nav aria-label="管理画面">
          {navigation.map(([label, href]) => (
            <Link href={href} key={href} prefetch={false}>
              {label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction}>
          <button className="admin-secondary-button" type="submit">
            ログアウト
          </button>
        </form>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
