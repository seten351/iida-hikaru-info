import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminAppearance } from "@/server/admin/repository";

import {
  AdminPageHeader,
  BackLink,
  DetailList,
  ExternalSourceLink,
  JsonSnapshot,
  formatAdminDate,
} from "../../_components";

export default async function AdminAppearanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAdminAppearance(id);
  if (!result) notFound();
  const { appearance, seriesName, sourceLinks, revisions } = result;

  return (
    <>
      <BackLink href="/admin/appearances">出演一覧</BackLink>
      <AdminPageHeader
        eyebrow="APPEARANCE DETAIL"
        title={appearance.title}
        description="appearance本体、source link、保存済みrevisionを表示します。"
      />
      <section className="admin-panel">
        <h2>基本情報</h2>
        <DetailList
          rows={[
            ["ID", appearance.id],
            ["starts at", formatAdminDate(appearance.startsAt)],
            ["category", appearance.category],
            ["series", seriesName ?? appearance.seriesId],
            ["event group", appearance.eventGroupId],
            ["event title", appearance.eventTitle],
            ["session", appearance.sessionLabel],
            ["visibility", appearance.visibilityStatus],
            ["version", appearance.version],
            ["first visible", formatAdminDate(appearance.firstVisibleAt)],
            ["visibility changed", formatAdminDate(appearance.visibilityChangedAt)],
            ["updated", formatAdminDate(appearance.updatedAt)],
          ]}
        />
      </section>
      <section className="admin-panel">
        <h2>Source links ({sourceLinks.length})</h2>
        {sourceLinks.map((link) => (
          <article className="admin-subpanel" key={`${link.sourceId}:${link.evidenceKey}`}>
            <DetailList
              rows={[
                [
                  "source ID",
                  <Link key="source" href={`/admin/sources/${link.sourceId}`} prefetch={false}>
                    {link.sourceId}
                  </Link>,
                ],
                ["identity ID", link.sourceIdentityId],
                ["identity", link.sourceName && `${link.sourceName}:${link.externalItemId}`],
                ["type", link.sourceType],
                ["evidence", link.evidenceKey],
                ["active / primary", `${link.active} / ${link.isPrimary}`],
                ["URL", <ExternalSourceLink key="url" url={link.canonicalUrl} />],
                ["published", link.publishedOn ?? formatAdminDate(link.publishedAt)],
                ["precision", link.publishedAtPrecision],
                ["collected", formatAdminDate(link.collectedAt)],
              ]}
            />
          </article>
        ))}
      </section>
      <section className="admin-panel">
        <h2>Revisions ({revisions.length})</h2>
        {revisions.map((revision) => (
          <details className="admin-revision" key={revision.version}>
            <summary>
              v{revision.version} · {revision.operation} · {revision.actorType} ·{" "}
              {formatAdminDate(revision.createdAt)}
            </summary>
            <p>snapshot schema v{revision.snapshotSchemaVersion}</p>
            <JsonSnapshot value={revision.snapshot} />
          </details>
        ))}
      </section>
    </>
  );
}
