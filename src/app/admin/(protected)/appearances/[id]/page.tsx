import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminAppearance } from "@/server/admin/repository";
import { listAdminSeries } from "@/server/admin/repository";
import { requireAdminSession } from "@/server/admin/auth";

import {
  AdminPageHeader,
  BackLink,
  DetailList,
  ExternalSourceLink,
  JsonSnapshot,
  formatAdminDate,
} from "../../_components";
import {
  FixedMutationFlow,
  SourceMutationEditor,
} from "../../write-flow";

export default async function AdminAppearanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ config }, result, series] = await Promise.all([
    requireAdminSession(),
    getAdminAppearance(id),
    listAdminSeries(),
  ]);
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
      {config.writeEnabled ? (
        <div className="admin-page-actions">
          <Link href={`/admin/appearances/${appearance.id}/edit`} prefetch={false}>基本情報を編集</Link>
          {appearance.eventGroupId ? (
            <Link href={`/admin/event-groups/${encodeURIComponent(appearance.eventGroupId)}/edit`} prefetch={false}>
              同じevent groupを一括編集
            </Link>
          ) : null}
        </div>
      ) : null}
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
      {config.writeEnabled ? (
        <section className="admin-panel">
          <h2>表示状態を変更</h2>
          <FixedMutationFlow
            input={{
              kind: "appearance",
              operation: appearance.visibilityStatus === "public" ? "hide" : "restore",
              appearanceId: appearance.id,
              expectedVersion: appearance.version,
            }}
            label={appearance.visibilityStatus === "public" ? "HideをPreview" : "RestoreをPreview"}
          />
        </section>
      ) : null}
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
            {config.writeEnabled && link.active && !link.isPrimary ? (
              <FixedMutationFlow
                input={{
                  kind: "source",
                  operation: "primary",
                  targets: [{ appearanceId: appearance.id, expectedVersion: appearance.version }],
                  source: { sourceId: link.sourceId, evidenceKey: link.evidenceKey },
                }}
                label="Primary変更をPreview"
              />
            ) : null}
          </article>
        ))}
      </section>
      {config.writeEnabled ? (
        <section className="admin-panel">
          <h2>情報源を追加・差し替え</h2>
          <SourceMutationEditor targets={[{ appearanceId: appearance.id, expectedVersion: appearance.version }]} />
          <p className="admin-form-note">現在のseries候補: {series.length}件。情報源操作ではseriesは変更しません。</p>
        </section>
      ) : null}
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
