"use client";

export default function AdminError() {
  return (
    <main className="admin-login-shell">
      <section className="admin-login-card">
        <p className="admin-eyebrow">ADMIN</p>
        <h1>管理画面を表示できません</h1>
        <p>認証設定またはデータベース接続を確認して、再読み込みしてください。</p>
      </section>
    </main>
  );
}
