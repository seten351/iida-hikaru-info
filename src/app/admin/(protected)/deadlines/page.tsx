import Link from "next/link";

import { requireAdminSession } from "@/server/admin/auth";
import { listAdminDeadlines } from "@/server/deadlines/repository";
import { AdminPageHeader, EmptyState } from "../_components";
import { adminDeadlineStateLabels, formatAdminDeadline } from "./_components";

export default async function AdminDeadlinesPage() {
  const [{ config }, deadlines] = await Promise.all([requireAdminSession(), listAdminDeadlines()]);
  return <>
    <AdminPageHeader eyebrow="APPLICATION DEADLINES" title={`申し込み締切 (${deadlines.length})`} description="エージェントによる更新内容・受付状態・公開状態・変更履歴を確認、監査します。手動操作は緊急時の最終手段です。" />
    {config.writeEnabled ? <div className="admin-page-actions"><Link href="/admin/deadlines/new" prefetch={false}>締切を新規作成</Link></div> : null}
    {deadlines.length ? <div className="admin-table-wrap"><table>
      <thead><tr><th>対象企画 / 受付 / ID</th><th>締切日時</th><th>区分 / 主催者</th><th>受付状態</th><th>公開状態</th><th>version</th></tr></thead>
      <tbody>{deadlines.map((deadline) => <tr key={deadline.id}>
        <td><Link href={`/admin/deadlines/${deadline.id}`} prefetch={false}>{deadline.projectTitle}</Link><small>{deadline.label} · {deadline.id}</small></td>
        <td>{formatAdminDeadline(deadline)}</td><td>{deadline.projectType === "fan" ? "ファン企画" : "公式企画"}<small>{deadline.organizer}</small></td>
        <td>{adminDeadlineStateLabels[deadline.state]}</td><td>{deadline.visibilityStatus}</td><td>{deadline.version}</td>
      </tr>)}</tbody>
    </table></div> : <EmptyState>申し込み締切はまだ登録されていません。</EmptyState>}
  </>;
}
