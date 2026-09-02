import Link from "next/link";

import { listAdminSources } from "@/server/admin/repository";

import {
  AdminPageHeader,
  ExternalSourceLink,
  formatAdminDate,
} from "../_components";

export default async function AdminSourcesPage() {
  const sources = await listAdminSources();

  return (
    <>
      <AdminPageHeader
        eyebrow="SOURCES"
        title={`情報源 (${sources.length})`}
        description="canonical sourceとidentity、appearance・proposalへの参照を確認します。"
      />
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID / URL</th>
              <th>type</th>
              <th>identities</th>
              <th>appearances</th>
              <th>proposals</th>
              <th>last collected</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td>
                  <Link href={`/admin/sources/${source.id}`} prefetch={false}>
                    {source.id}
                  </Link>
                  <small><ExternalSourceLink url={source.canonicalUrl} /></small>
                </td>
                <td>{source.sourceType}</td>
                <td>{source.identityCount}</td>
                <td>{source.appearanceCount}</td>
                <td>{source.proposalCount}</td>
                <td>{formatAdminDate(source.lastCollectedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
