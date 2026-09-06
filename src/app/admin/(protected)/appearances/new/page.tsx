import { notFound } from "next/navigation";

import { listAdminSeries } from "@/server/admin/repository";
import { requireAdminSession } from "@/server/admin/auth";

import { AdminPageHeader, BackLink } from "../../_components";
import { AppearanceEditor } from "../../write-flow";

export default async function NewAppearancePage() {
  const [{ config }, series] = await Promise.all([requireAdminSession(), listAdminSeries()]);
  if (!config.writeEnabled) notFound();
  return (
    <>
      <BackLink href="/admin/appearances">出演一覧</BackLink>
      <AdminPageHeader eyebrow="NEW APPEARANCE" title="出演を新規作成" description="primary sourceを含めてpreviewし、confirmで同一transactionに確定します。" />
      <AppearanceEditor series={series} />
    </>
  );
}
