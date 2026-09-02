import { requireAdminSession } from "@/server/admin/auth";

import { AdminPageHeader, EmptyState } from "../_components";

export default async function AdminRunsPage() {
  await requireAdminSession();

  return (
    <>
      <AdminPageHeader
        eyebrow="RUNS"
        title="実行履歴"
        description="CollectorはPhase 3の対象です。Phase 2Aでは実行履歴を作成しません。"
      />
      <EmptyState>表示できる実行履歴はありません。</EmptyState>
    </>
  );
}
