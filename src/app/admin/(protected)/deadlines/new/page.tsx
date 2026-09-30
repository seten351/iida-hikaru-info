import { notFound } from "next/navigation";

import { requireAdminSession } from "@/server/admin/auth";
import { listAdminSeries } from "@/server/admin/repository";
import { listDeadlineAppearanceOptions } from "@/server/deadlines/repository";
import { AdminPageHeader, BackLink } from "../../_components";
import { DeadlineEditor } from "../editor";

export default async function NewDeadlinePage({ searchParams }: { searchParams: Promise<{ appearanceId?: string }> }) {
  const [{ config }, series, appearances, query] = await Promise.all([
    requireAdminSession(), listAdminSeries(), listDeadlineAppearanceOptions(), searchParams,
  ]);
  if (!config.writeEnabled) notFound();
  return <>
    <BackLink href="/admin/deadlines">締切一覧</BackLink>
    <AdminPageHeader eyebrow="NEW DEADLINE" title="申し込み締切を新規作成" description="緊急時の手動登録です。通常はエージェントから登録します。共通のPreview・検証・確定処理を使用します。" />
    <DeadlineEditor series={series} appearances={appearances} initialAppearanceId={query.appearanceId} />
  </>;
}
