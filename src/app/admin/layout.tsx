import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  AdminConfigurationError,
  readAdminConfig,
  readAdminUiEnabled,
} from "@/server/admin/config";

import "./admin.css";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin | 飯田ヒカル出演情報",
  robots: { index: false, follow: false, nocache: true },
};

function AdminUnavailable() {
  return (
    <main className="admin-login-shell">
      <section className="admin-login-card">
        <p className="admin-eyebrow">ADMIN</p>
        <h1>管理画面を利用できません</h1>
        <p>管理画面の設定を確認してください。公開サイトには影響しません。</p>
      </section>
    </main>
  );
}

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  let enabled: boolean;
  try {
    enabled = readAdminUiEnabled();
  } catch {
    return <AdminUnavailable />;
  }
  if (!enabled) notFound();

  try {
    readAdminConfig();
  } catch (error) {
    if (error instanceof AdminConfigurationError) return <AdminUnavailable />;
    throw error;
  }

  return children;
}
