import Link from "next/link";
import type { ReactNode } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="admin-page-header">
      <p className="admin-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="admin-empty">{children}</p>;
}

export function DetailList({
  rows,
}: {
  rows: Array<[string, ReactNode]>;
}) {
  return (
    <dl className="admin-detail-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="admin-back-link" href={href} prefetch={false}>
      ← {children}
    </Link>
  );
}

export function formatAdminDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function ExternalSourceLink({ url }: { url: string }) {
  let safe = false;
  try {
    const parsed = new URL(url);
    safe = parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    safe = false;
  }

  return safe ? (
    <a href={url} rel="noreferrer" target="_blank">
      {url}
    </a>
  ) : (
    <span>{url}</span>
  );
}

export function JsonSnapshot({ value }: { value: unknown }) {
  return <pre className="admin-json">{JSON.stringify(value, null, 2)}</pre>;
}
