import Link from "next/link";

import { listAdminSeries } from "@/server/admin/repository";
import { requireAdminSession } from "@/server/admin/auth";

import { AdminPageHeader, formatAdminDate } from "../_components";

export default async function AdminSeriesPage() {
  const [{ config }, series] = await Promise.all([requireAdminSession(), listAdminSeries()]);

  return (
    <>
      <AdminPageHeader
        eyebrow="SERIES"
        title={`シリーズ (${series.length})`}
        description="シリーズとversion、初期revision、所属appearanceを確認します。"
      />
      {config.writeEnabled ? (
        <div className="admin-page-actions">
          <Link href="/admin/series/new" prefetch={false}>シリーズを新規作成</Link>
        </div>
      ) : null}
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
