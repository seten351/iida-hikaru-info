import Link from "next/link";

import { listAdminAppearances } from "@/server/admin/repository";
import { requireAdminSession } from "@/server/admin/auth";

import { AdminPageHeader, formatAdminAppearanceStart } from "../_components";

export default async function AdminAppearancesPage() {
  const [{ config }, appearances] = await Promise.all([
    requireAdminSession(),
    listAdminAppearances(),
  ]);

  return (
    <>
      <AdminPageHeader
        eyebrow="APPEARANCES"
        title={`出演 (${appearances.length})`}
        description="hiddenを含む個別appearanceとversion・revisionを確認します。"
      />
      {config.writeEnabled ? (
        <div className="admin-page-actions">
          <Link href="/admin/appearances/new" prefetch={false}>出演を新規作成</Link>
          <Link href="/admin/sources/link" prefetch={false}>同じ情報源を複数出演へ追加</Link>
        </div>
      ) : null}
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>title / ID</th>
              <th>start</th>
              <th>category</th>
              <th>series</th>
              <th>visibility</th>
              <th>version</th>
              <th>sources</th>
              <th>revisions</th>
            </tr>
          </thead>
          <tbody>
            {appearances.map((appearance) => (
              <tr key={appearance.id}>
                <td>
                  <Link href={`/admin/appearances/${appearance.id}`} prefetch={false}>
                    {appearance.title}
                  </Link>
                  <small>{appearance.id}</small>
                </td>
                <td>{formatAdminAppearanceStart(appearance)}</td>
                <td>{appearance.category}</td>
                <td>{appearance.seriesName ?? "—"}</td>
                <td>{appearance.visibilityStatus}</td>
                <td>{appearance.version}</td>
                <td>{appearance.sourceCount}</td>
                <td>{appearance.revisionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
