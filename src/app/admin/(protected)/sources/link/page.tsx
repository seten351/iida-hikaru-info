import { notFound } from "next/navigation";

import { requireAdminSession } from "@/server/admin/auth";

import { AdminPageHeader, BackLink } from "../../_components";
import { SourceMutationEditor } from "../../write-flow";

export default async function MultiSourceLinkPage() {
  const { config } = await requireAdminSession();
  if (!config.writeEnabled) notFound();
  return (
    <>
      <BackLink href="/admin/appearances">出演一覧</BackLink>
      <AdminPageHeader eyebrow="BATCH SOURCE" title="同じ情報源を複数出演へ追加" description="全対象のversionを確認し、1件でもstaleなら全件を確定しません。" />
      <SourceMutationEditor targets={[]} allowTargetEdit />
    </>
  );
}
