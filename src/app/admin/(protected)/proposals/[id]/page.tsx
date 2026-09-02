import { notFound } from "next/navigation";

import { getAdminProposal } from "@/server/admin/repository";

import {
  AdminPageHeader,
  BackLink,
  DetailList,
  ExternalSourceLink,
  JsonSnapshot,
  formatAdminDate,
} from "../../_components";

export default async function AdminProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAdminProposal(id);
  if (!result) notFound();
  const { proposal, sourceLinks } = result;

  return (
    <>
      <BackLink href="/admin/proposals">提案一覧</BackLink>
      <AdminPageHeader
        eyebrow="PROPOSAL DETAIL"
        title={proposal.title ?? proposal.id}
        description="保存済みproposal payloadをread-onlyで表示しています。"
      />
      <section className="admin-panel">
        <h2>基本情報</h2>
        <DetailList
          rows={[
            ["ID", proposal.id],
            ["origin", proposal.origin],
            ["operation", proposal.operation],
            ["status", proposal.status],
            ["match status", proposal.matchStatus],
            ["appearance ID", proposal.appearanceId],
            ["expected version", proposal.expectedAppearanceVersion],
            ["starts at", formatAdminDate(proposal.startsAt)],
            ["series ID", proposal.seriesId],
            ["category", proposal.category],
            ["visibility", proposal.visibilityStatus],
            ["review note", proposal.reviewNote],
            ["idempotency key", proposal.idempotencyKey],
            ["reviewed at", formatAdminDate(proposal.reviewedAt)],
            ["updated at", formatAdminDate(proposal.updatedAt)],
          ]}
        />
      </section>
      <section className="admin-panel">
        <h2>Source links ({sourceLinks.length})</h2>
        {sourceLinks.map((link) => (
          <article className="admin-subpanel" key={`${link.sourceId}:${link.evidenceKey}`}>
            <DetailList
              rows={[
                ["source ID", link.sourceId],
                ["identity ID", link.sourceIdentityId],
                ["identity", link.sourceName && `${link.sourceName}:${link.externalItemId}`],
                ["type", link.sourceType],
                ["evidence", link.evidenceKey],
                ["primary", String(link.isPrimary)],
                ["URL", <ExternalSourceLink key="url" url={link.canonicalUrl} />],
                ["published", link.publishedOn ?? formatAdminDate(link.publishedAt)],
                ["precision", link.publishedAtPrecision],
                ["confidence", link.extractionConfidence],
              ]}
            />
            {link.reviewMetadata ? <JsonSnapshot value={link.reviewMetadata} /> : null}
          </article>
        ))}
      </section>
    </>
  );
}
