import type { ReactNode } from "react";
import type { AppearanceFilters } from "@/lib/appearance-filters";
import { createPublicHomeHref } from "@/lib/public-list-navigation";
import { DeadlineClockProvider } from "./deadline-clock";
import { SiteFooter, SiteHeader } from "./site-chrome";

export function PublicListPage({ kind, title, description, filters, now, children }: {
  kind: "news" | "deadlines";
  title: string;
  description: string;
  filters: AppearanceFilters;
  now: string;
  children: ReactNode;
}) {
  return (
    <DeadlineClockProvider now={now}>
      <main>
        <SiteHeader currentPage={kind} />
        <div className="page-shell public-list-page">
          <header className="public-list-page__heading">
            <a className="list-back-link" href={createPublicHomeHref(filters, kind === "news" ? "latest" : "deadlines")}>← トップへ戻る</a>
            <p className="eyebrow">{kind === "news" ? "LATEST NEWS" : "APPLICATION DEADLINES"}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
        </div>
        <SiteFooter />
      </main>
    </DeadlineClockProvider>
  );
}
