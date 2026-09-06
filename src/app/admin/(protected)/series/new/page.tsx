import { notFound } from "next/navigation";

import { requireAdminSession } from "@/server/admin/auth";

import { AdminPageHeader, BackLink } from "../../_components";
import { SeriesEditor } from "../../write-flow";

export default async function NewSeriesPage() {
  const { config } = await requireAdminSession();
  if (!config.writeEnabled) notFound();
  return (
    <>
      <BackLink href="/admin/series">シリーズ一覧</BackLink>
      <AdminPageHeader eyebrow="NEW SERIES" title="シリーズを新規作成" description="IDと表示名をpreviewしてから確定します。" />
      <SeriesEditor />
    </>
  );
}
