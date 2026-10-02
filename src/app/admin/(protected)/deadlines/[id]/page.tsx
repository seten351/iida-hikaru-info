import Link from "next/link";
import { notFound } from "next/navigation";

import { getReceptionFields, getReceptionStatusLabel, receptionInformationTypeLabels } from "@/domain/deadline";
import { requireAdminSession } from "@/server/admin/auth";
import { getAdminDeadline, listDeadlineAppearanceOptions } from "@/server/deadlines/repository";
import { AdminPageHeader, BackLink, DetailList, EmptyState, ExternalSourceLink, JsonSnapshot, formatAdminDate } from "../../_components";
import { adminDeadlineStateLabels, formatAdminReceptionStart, formatAdminReceptionEnd } from "../_components";
import { DeadlineVisibilityEditor } from "../editor";

export default async function AdminDeadlineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ config }, result, appearances] = await Promise.all([requireAdminSession(), getAdminDeadline(id), listDeadlineAppearanceOptions()]);
  if (!result) notFound();
  const { deadline, source, revisions, proposals } = result;
  const reception = getReceptionFields(deadline);
  const targets = appearances.filter((item) => deadline.appearanceIds.includes(item.id));
  return <>
    <BackLink href="/admin/deadlines">受付・販売一覧</BackLink>
    <AdminPageHeader eyebrow="RECEPTION & SALES DETAIL" title={deadline.projectTitle} description="受付・販売・関連出演・告知元と保存済み変更履歴を表示します。" />
    {config.writeEnabled ? <div className="admin-page-actions"><Link href={`/admin/deadlines/${deadline.id}/edit`} prefetch={false}>受付・販売情報を編集</Link></div> : null}
    <section className="admin-panel"><h2>受付・販売情報</h2><DetailList rows={[
      ["ID", deadline.id], ["受付名", deadline.label], ["対象企画", deadline.projectTitle], ["主催者", deadline.organizer],
      ["種別", receptionInformationTypeLabels[reception.informationType]], ["企画区分", deadline.projectType === "fan" ? "ファン企画" : "公式企画"],
      ["開始日時", formatAdminReceptionStart(deadline)], ["開始日時精度", reception.startsAtPrecision], ["終了・締切日時", formatAdminReceptionEnd(deadline)],
      ["終了日時精度", deadline.deadlinePrecision], ["現在の状態", getReceptionStatusLabel(deadline, new Date())], ["保存状態", adminDeadlineStateLabels[deadline.state]],
      ["確認済み状況", { auto: "自動判定", not_open: "受付前・販売前", open: "受付中・販売中" }[reception.phaseOverride]], ["再販区分", reception.saleMode === "resale" ? "再販" : "初回・通常"],
      ["単独企画のシリーズ", deadline.seriesId], ["受付・販売先", deadline.applicationUrl ? <ExternalSourceLink key="application" url={deadline.applicationUrl} /> : null],
      ["補足", deadline.note], ["公開状態", deadline.visibilityStatus], ["version", deadline.version], ["更新日時", formatAdminDate(deadline.updatedAt)],
    ]} /><p className="admin-form-note">「通常」の開始・終了は閲覧時刻で自動判定されます。完売・早期終了・再販は一次情報を根拠に同じIDで更新してください。</p></section>
    {config.writeEnabled ? <section className="admin-panel"><h2>公開状態を変更</h2><DeadlineVisibilityEditor input={{
      kind: "deadline", operation: deadline.visibilityStatus === "public" ? "hide" : "restore", deadlineId: deadline.id, expectedVersion: deadline.version,
    }} label={deadline.visibilityStatus === "public" ? "非公開への変更をPreview" : "再公開をPreview"} /></section> : null}
    <section className="admin-panel"><h2>関連出演 ({targets.length})</h2>{targets.length ? <ul className="admin-link-list">{targets.map((item) => <li key={item.id}><Link href={`/admin/appearances/${item.id}`} prefetch={false}>{item.title}</Link><span>{item.sessionLabel} · {item.visibilityStatus}</span></li>)}</ul> : <EmptyState>関連出演のない単独企画です。</EmptyState>}</section>
    <section className="admin-panel"><h2>告知元</h2>{source ? <DetailList rows={[
      ["告知元URL", <ExternalSourceLink key="source" url={source.canonicalUrl} />], ["情報源名", source.sourceName], ["告知ID", source.externalItemId],
      ["evidence key", source.evidenceKey], ["告知日時", source.publishedOn ?? formatAdminDate(source.publishedAt)], ["告知日時精度", source.precision],
    ]} /> : <p>告知元がありません。</p>}</section>
    <section className="admin-panel"><h2>保存済みの根拠 ({deadline.sourceEvidence.length})</h2><ul className="admin-link-list">{deadline.sourceEvidence.map((evidence) => <li key={`${evidence.canonicalUrl}:${evidence.evidenceKey}`}><ExternalSourceLink url={evidence.canonicalUrl} /><span>{evidence.evidenceKey}</span></li>)}</ul></section>
    <section className="admin-panel"><h2>変更履歴 ({revisions.length})</h2>{revisions.map((revision) => <details className="admin-revision" key={revision.version}>
      <summary>v{revision.version} · {revision.operation} · {revision.actorType} · {formatAdminDate(revision.createdAt)}</summary>
      <p>snapshot schema v{revision.snapshotSchemaVersion}</p>
      <JsonSnapshot value={revision.snapshot} />
    </details>)}</section>
    <section className="admin-panel"><h2>変更提案 ({proposals.length})</h2><ul className="admin-link-list">{proposals.map((proposal) => <li key={proposal.id}><Link href={`/admin/deadlines/proposals/${proposal.id}`} prefetch={false}>{proposal.operation} · {proposal.status}</Link><span>{formatAdminDate(proposal.reviewedAt)}</span></li>)}</ul></section>
  </>;
}
