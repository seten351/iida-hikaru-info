import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminSeries } from "@/server/admin/repository";

import {
  AdminPageHeader,
  BackLink,
  DetailList,
  JsonSnapshot,
  formatAdminDate,
} from "../../_components";

export default async function AdminSeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAdminSeries(id);
  if (!result) notFound();
  const { series, appearances, revisions } = result;

  return (
    <>
      <BackLink href="/admin/series">シリーズ一覧</BackLink>
      <AdminPageHeader
        eyebrow="SERIES DETAIL"
        title={series.displayName}
        description="シリーズ、所属appearance、series revisionを表示します。"
      />
      <section className="admin-panel">
        <h2>基本情報</h2>
        <DetailList rows={[
          ["ID", series.id],
          ["version", series.version],
          ["created", formatAdminDate(series.createdAt)],
          ["updated", formatAdminDate(series.updatedAt)],
        ]} />
      </section>
      <section className="admin-panel">
        <h2>Appearances ({appearances.length})</h2>
        <ul className="admin-link-list">
          {appearances.map((appearance) => (
            <li key={appearance.id}>
              <Link href={`/admin/appearances/${appearance.id}`} prefetch={false}>
                {appearance.title}
              </Link>
              <span>{formatAdminDate(appearance.startsAt)} · {appearance.visibilityStatus} · v{appearance.version}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="admin-panel">
        <h2>Revisions ({revisions.length})</h2>
        {revisions.map((revision) => (
          <details className="admin-revision" key={revision.version}>
            <summary>v{revision.version} · {revision.operation} · {revision.actorType}</summary>
            <p>snapshot schema v{revision.snapshotSchemaVersion}</p>
            <JsonSnapshot value={revision.snapshot} />
          </details>
        ))}
      </section>
    </>
  );
}
