import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminDeadlineProposal } from "@/server/deadlines/repository";
import { AdminPageHeader, BackLink, DetailList, JsonSnapshot, formatAdminDate } from "../../../_components";

export default async function AdminDeadlineProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await getAdminDeadlineProposal(id);
  if (!proposal) notFound();
  return <>
    <BackLink href="/admin/deadlines">受付・販売一覧</BackLink>
    <AdminPageHeader eyebrow="RECEPTION & SALES PROPOSAL" title="受付・販売情報の変更記録" description="確定・破棄・競合により未反映となった変更の入力と結果を表示します。" />
    <section className="admin-panel"><h2>変更結果</h2><DetailList rows={[
      ["ID", proposal.id], ["対象受付・販売", proposal.deadlineId ? <Link key="target" href={`/admin/deadlines/${proposal.targetDeadlineId}`} prefetch={false}>{proposal.targetDeadlineId}</Link> : proposal.targetDeadlineId],
      ["操作", proposal.operation], ["状態", proposal.status], ["更新前version", proposal.expectedVersion],
      ["確認結果", proposal.reviewNote], ["作成日時", formatAdminDate(proposal.createdAt)], ["確定日時", formatAdminDate(proposal.reviewedAt)],
      ["idempotency key", proposal.idempotencyKey], ["content hash", proposal.reviewedContentHash],
    ]} /></section>
    <section className="admin-panel"><h2>変更内容</h2><JsonSnapshot value={proposal.input} /></section>
  </>;
}
