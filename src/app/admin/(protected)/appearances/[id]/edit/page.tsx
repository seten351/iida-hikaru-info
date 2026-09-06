import { notFound } from "next/navigation";

import { getAdminAppearance, listAdminSeries } from "@/server/admin/repository";
import { requireAdminSession } from "@/server/admin/auth";

import { AdminPageHeader, BackLink } from "../../../_components";
import { AppearanceEditor } from "../../../write-flow";

export default async function EditAppearancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ config }, result, series] = await Promise.all([
    requireAdminSession(),
    getAdminAppearance(id),
    listAdminSeries(),
  ]);
  if (!config.writeEnabled) notFound();
  if (!result) notFound();
  const item = result.appearance;
  return (
    <>
      <BackLink href={`/admin/appearances/${item.id}`}>出演詳細</BackLink>
      <AdminPageHeader eyebrow="EDIT APPEARANCE" title={item.title} description="sourceとvisibilityは専用操作で変更します。" />
      <AppearanceEditor
          appearance={{
            id: item.id,
            startsAt: item.startsAt.toISOString(),
            title: item.title,
            seriesId: item.seriesId,
            eventGroupId: item.eventGroupId,
            eventTitle: item.eventTitle,
            sessionLabel: item.sessionLabel,
            category: item.category,
            version: item.version,
          }}
          series={series}
      />
    </>
  );
}
