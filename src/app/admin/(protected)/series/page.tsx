import Link from "next/link";

import { listAdminSeries } from "@/server/admin/repository";

import { AdminPageHeader, formatAdminDate } from "../_components";

export default async function AdminSeriesPage() {
  const series = await listAdminSeries();

  return (
    <>
      <AdminPageHeader
        eyebrow="SERIES"
        title={`シリーズ (${series.length})`}
        description="シリーズとversion、初期revision、所属appearanceを確認します。"
      />
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr><th>name / ID</th><th>version</th><th>appearances</th><th>revisions</th><th>updated</th></tr>
          </thead>
          <tbody>
            {series.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/admin/series/${item.id}`} prefetch={false}>
                    {item.displayName}
                  </Link>
                  <small>{item.id}</small>
                </td>
                <td>{item.version}</td>
                <td>{item.appearanceCount}</td>
                <td>{item.revisionCount}</td>
                <td>{formatAdminDate(item.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
