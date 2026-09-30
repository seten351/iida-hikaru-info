import { notFound } from "next/navigation";

import { requireAdminSession } from "@/server/admin/auth";
import { listAdminSeries } from "@/server/admin/repository";
import { getAdminDeadline, listDeadlineAppearanceOptions } from "@/server/deadlines/repository";
import { AdminPageHeader, BackLink } from "../../../_components";
import { DeadlineEditor } from "../../editor";

export default async function EditDeadlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ config }, result, series, appearances] = await Promise.all([
    requireAdminSession(), getAdminDeadline(id), listAdminSeries(), listDeadlineAppearanceOptions(),
  ]);
  if (!config.writeEnabled || !result) notFound();
  return <>
    <BackLink href={`/admin/deadlines/${result.deadline.id}`}>締切詳細</BackLink>
    <AdminPageHeader eyebrow="EDIT DEADLINE" title={result.deadline.projectTitle} description="緊急時の手動修正です。通常はエージェントから同じ締切IDを更新します。共通のPreview・検証・確定処理を使用します。" />
    <DeadlineEditor deadline={result.deadline} source={result.source ?? undefined} series={series} appearances={appearances} />
  </>;
}
