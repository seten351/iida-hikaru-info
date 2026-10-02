import Link from "next/link";

import { getReceptionFields, getReceptionStatusLabel, receptionInformationTypeLabels } from "@/domain/deadline";
import { requireAdminSession } from "@/server/admin/auth";
import { listAdminDeadlines } from "@/server/deadlines/repository";
import { AdminPageHeader, EmptyState } from "../_components";
import { adminDeadlineStateLabels, formatAdminReceptionStart, formatAdminReceptionEnd } from "./_components";

export default async function AdminDeadlinesPage() {
  const [{ config }, deadlines] = await Promise.all([requireAdminSession(), listAdminDeadlines()]);
  const now = new Date();
  return <>
    <AdminPageHeader eyebrow="RECEPTION & SALES" title={`受付・販売情報 (${deadlines.length})`} description="エージェントによる更新内容・受付状態・公開状態・変更履歴を確認、監査します。手動操作は緊急時の最終手段です。" />
    {config.writeEnabled ? <div className="admin-page-actions"><Link href="/admin/deadlines/new" prefetch={false}>受付・販売情報を新規作成</Link></div> : null}
    {deadlines.length ? <div className="admin-table-wrap"><table>
      <thead><tr><th>対象企画 / 受付・販売 / ID</th><th>開始 / 終了・締切</th><th>種別 / 区分 / 主催者</th><th>受付・販売状態</th><th>公開状態</th><th>version</th></tr></thead>
      <tbody>{deadlines.map((deadline) => <tr key={deadline.id}>
        <td><Link href={`/admin/deadlines/${deadline.id}`} prefetch={false}>{deadline.projectTitle}</Link><small>{deadline.label} · {deadline.id}</small></td>
        <td>{formatAdminReceptionStart(deadline)}<small>{formatAdminReceptionEnd(deadline)}</small></td><td>{receptionInformationTypeLabels[getReceptionFields(deadline).informationType]}<small>{deadline.projectType === "fan" ? "ファン企画" : "公式企画"} · {deadline.organizer}</small></td>
        <td>{getReceptionStatusLabel(deadline, now)}<small>保存状態: {adminDeadlineStateLabels[deadline.state]}</small></td><td>{deadline.visibilityStatus}</td><td>{deadline.version}</td>
      </tr>)}</tbody>
    </table></div> : <EmptyState>受付・販売情報はまだ登録されていません。</EmptyState>}
  </>;
}
