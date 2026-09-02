import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminSource } from "@/server/admin/repository";

import {
  AdminPageHeader,
  BackLink,
  DetailList,
  EmptyState,
  ExternalSourceLink,
  JsonSnapshot,
  formatAdminDate,
} from "../../_components";

export default async function AdminSourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAdminSource(id);
  if (!result) notFound();
  const { source, identities, appearanceLinks, proposalLinks } = result;

  return (
    <>
      <BackLink href="/admin/sources">情報源一覧</BackLink>
      <AdminPageHeader
        eyebrow="SOURCE DETAIL"
        title={source.id}
        description="source本体と、その参照関係をread-onlyで表示します。"
      />
      <section className="admin-panel">
        <h2>基本情報</h2>
        <DetailList
          rows={[
            ["type", source.sourceType],
            ["URL", <ExternalSourceLink key="url" url={source.canonicalUrl} />],
            ["first collected", formatAdminDate(source.firstCollectedAt)],
            ["last collected", formatAdminDate(source.lastCollectedAt)],
            ["updated", formatAdminDate(source.updatedAt)],
          ]}
        />
        {source.metadata ? <JsonSnapshot value={source.metadata} /> : null}
      </section>
      <section className="admin-panel">
        <h2>Identities ({identities.length})</h2>
        {identities.length === 0 ? (
          <EmptyState>identityはありません。</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>ID</th><th>source name</th><th>external item ID</th><th>canonical</th></tr></thead>
              <tbody>
                {identities.map((identity) => (
                  <tr key={identity.id}>
                    <td>{identity.id}</td>
                    <td>{identity.sourceName}</td>
                    <td>{identity.externalItemId}</td>
                    <td>{String(identity.isCanonical)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="admin-panel">
        <h2>Appearances ({appearanceLinks.length})</h2>
        {appearanceLinks.length === 0 ? (
          <EmptyState>appearance linkはありません。</EmptyState>
        ) : (
          <ul className="admin-link-list">
            {appearanceLinks.map((link) => (
              <li key={`${link.appearanceId}:${link.evidenceKey}`}>
                <Link href={`/admin/appearances/${link.appearanceId}`} prefetch={false}>
                  {link.title}
                </Link>
                <span>{link.evidenceKey} · active {String(link.active)} · primary {String(link.isPrimary)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="admin-panel">
        <h2>Proposals ({proposalLinks.length})</h2>
        {proposalLinks.length === 0 ? (
          <EmptyState>proposal linkはありません。</EmptyState>
        ) : (
          <ul className="admin-link-list">
            {proposalLinks.map((link) => (
              <li key={`${link.proposalId}:${link.evidenceKey}`}>
                <Link href={`/admin/proposals/${link.proposalId}`} prefetch={false}>
                  {link.proposalId}
                </Link>
                <span>{link.status} · {link.evidenceKey} · primary {String(link.isPrimary)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
