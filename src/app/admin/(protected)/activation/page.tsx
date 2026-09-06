import { notFound } from "next/navigation";

import { readAdminActivationState } from "@/server/admin/activation-service";
import { requireAdminSession } from "@/server/admin/auth";

import { AdminPageHeader, formatAdminDate } from "../_components";
import { ActivationFlow } from "./activation-flow";

export default async function AdminActivationPage() {
  const { config } = await requireAdminSession();
  if (!config.writeEnabled) notFound();
  const activation = await readAdminActivationState();

  return (
    <>
      <AdminPageHeader
        eyebrow="IRREVERSIBLE ACTIVATION"
        title="Admin modeを有効化"
        description="bootstrap importとの互換期間を終了し、Admin writeを正本に切り替えます。"
      />
      <section className="admin-activation-warning" role="alert">
        <h2>この操作は取り消せません</h2>
        <p>
          activationと同時にlegacy importは永久にlockされます。出演・情報源・シリーズの変更は、以後Adminのproposal／revision経路だけで確定します。
        </p>
        <p>事前checkpointと全DB invariantのどれか一つでも不正なら、transaction全体をrollbackします。</p>
      </section>

      {activation.classification === "ready" ? <ActivationFlow /> : null}
      {activation.classification === "activated" ? (
        <section className="admin-panel">
          <h2>Activation済み</h2>
          <p>有効化日時: {formatAdminDate(activation.state.adminActivatedAt)}</p>
          <p>legacy import lock日時: {formatAdminDate(activation.state.legacyImportLockedAt)}</p>
        </section>
      ) : null}
      {activation.classification === "inconsistent" ? (
        <p className="admin-form-error" role="alert">Activation状態を確認できないため操作を停止しました。</p>
      ) : null}
    </>
  );
}
