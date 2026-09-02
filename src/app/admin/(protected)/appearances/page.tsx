import Link from "next/link";

import { listAdminAppearances } from "@/server/admin/repository";

import { AdminPageHeader, formatAdminDate } from "../_components";

export default async function AdminAppearancesPage() {
  const appearances = await listAdminAppearances();

  return (
    <>
      <AdminPageHeader
        eyebrow="APPEARANCES"
        title={`出演 (${appearances.length})`}
        description="hiddenを含む個別appearanceとversion・revisionを確認します。"
      />
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
                <td>{formatAdminDate(appearance.startsAt)}</td>
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
