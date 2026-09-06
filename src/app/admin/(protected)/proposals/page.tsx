import Link from "next/link";

import {
  getAdminOverview,
  listAdminProposals,
} from "@/server/admin/repository";

import { AdminPageHeader, EmptyState, formatAdminDate } from "../_components";

export default async function AdminProposalsPage() {
  const [overview, proposals] = await Promise.all([
    getAdminOverview(),
    listAdminProposals(),
  ]);

  return (
    <>
      <AdminPageHeader
        eyebrow="PROPOSALS"
        title="提案"
        description="Admin変更proposalと判定状態を閲覧します。public_submissionの承認は対象外です。"
      />
      <section className="admin-stats" aria-label="データ件数">
        {[
          ["出演", overview.appearances],
          ["提案", overview.proposals],
          ["情報源", overview.sources],
          ["シリーズ", overview.series],
          ["出演revision", overview.revisions],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <p className="admin-state-line">
        content mode: <strong>{overview.contentMode}</strong>
      </p>
      {proposals.length === 0 ? (
        <EmptyState>提案はありません。</EmptyState>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID / title</th>
                <th>kind</th>
                <th>origin</th>
                <th>operation</th>
                <th>status</th>
                <th>match</th>
                <th>sources</th>
                <th>updated</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.id}>
                  <td>
                    <Link href={`/admin/proposals/${proposal.id}`} prefetch={false}>
                      {proposal.title ?? proposal.id}
                    </Link>
                    {proposal.title ? <small>{proposal.id}</small> : null}
                  </td>
                  <td>{proposal.kind}</td>
                  <td>{proposal.origin}</td>
                  <td>{proposal.operation}</td>
                  <td>{proposal.status}</td>
                  <td>{proposal.matchStatus}</td>
                  <td>{proposal.sourceCount}</td>
                  <td>{formatAdminDate(proposal.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
