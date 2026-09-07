import { notFound } from "next/navigation";

import { requireAdminSession } from "@/server/admin/auth";
import { getAdminEventGroup } from "@/server/admin/repository";

import { AdminPageHeader, BackLink } from "../../../_components";
import { EventGroupEditor } from "../../../write-flow";

export default async function EditEventGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventGroupId = decodeURIComponent(id);
  const [{ config }, appearances] = await Promise.all([
    requireAdminSession(),
    getAdminEventGroup(eventGroupId),
  ]);
  if (!config.writeEnabled || appearances.length < 2) notFound();
  const eventTitle = appearances[0].eventTitle;
  if (!eventTitle || appearances.some((item) => item.eventTitle !== eventTitle || item.eventGroupId !== eventGroupId || !item.sessionLabel)) {
    notFound();
  }

  return (
    <>
      <BackLink href={`/admin/appearances/${appearances[0].id}`}>出演詳細</BackLink>
      <AdminPageHeader
        eyebrow="EDIT EVENT GROUP"
        title={eventTitle}
        description="同一event groupの全appearanceをatomicに更新します。"
      />
      <EventGroupEditor
        eventGroupId={eventGroupId}
        eventTitle={eventTitle}
        appearances={appearances.map((item) => ({
          id: item.id,
          title: item.title,
          sessionLabel: item.sessionLabel!,
          version: item.version,
        }))}
      />
    </>
  );
}
