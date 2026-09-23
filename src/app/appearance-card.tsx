import {
  type AppearanceCard as AppearanceCardData,
  categoryClassNames,
  formatAppearanceAgendaStart,
  formatAppearanceStart,
  formatPublication,
} from "@/lib/appearances";

function AppearanceStart({
  session,
  agenda,
}: {
  session: AppearanceCardData["sessions"][number];
  agenda: boolean;
}) {
  const label = agenda
    ? formatAppearanceAgendaStart(session)
    : formatAppearanceStart(session);

  if (session.startsAtPrecision === "unknown") {
    return <span>{label}</span>;
  }

  return <time dateTime={session.startsAt ?? session.startsOn!}>{label}</time>;
}

export function AppearanceCard({
  item,
  agenda = false,
  headingLevel = 3,
}: {
  item: AppearanceCardData;
  agenda?: boolean;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const hasMultipleSources = item.sourceUrls.length > 1;

  return (
    <article className="appearance-card">
      <div className="appearance-card__meta">
        <span className={`category-badge ${categoryClassNames[item.category]}`}>
          {item.category}
        </span>
        {!item.isGrouped && (
          <AppearanceStart session={item.sessions[0]} agenda={agenda} />
        )}
      </div>
      <Heading>{item.title}</Heading>
      {item.isGrouped && (
        <ul className="appearance-card__sessions" aria-label={`${item.title}の公演一覧`}>
          {item.sessions.map((session) => (
            <li key={session.id}>
              <span>{session.sessionLabel}</span>
              <AppearanceStart session={session} agenda={agenda} />
            </li>
          ))}
        </ul>
      )}
      <p className="appearance-card__published">
        {item.isGrouped ? "最新公式発表" : "公式発表"}{" "}
        {formatPublication(item.publication)}
      </p>
      <div className="appearance-card__sources">
        {item.sourceUrls.map((sourceUrl, index) => (
          <a
            className="source-link"
            href={sourceUrl}
            key={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.title}の情報元${index + 1}を新しいタブで開く`}
          >
            {hasMultipleSources ? `情報元 ${index + 1}` : "情報元を見る"}{" "}
            <span aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </article>
  );
}
