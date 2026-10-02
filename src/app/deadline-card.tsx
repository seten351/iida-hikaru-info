"use client";

import { getReceptionFields, getReceptionStatus, getReceptionStatusLabel, isSalesInformation, receptionInformationTypeLabels, type Deadline } from "@/domain/deadline";
import { createDeadlineDetailHref, formatDeadline, formatReceptionStart, isDeadlineFinished } from "@/lib/deadlines";
import { formatAppearanceStart, formatPublication } from "@/lib/appearances";
import { useDeadlineNow } from "@/app/deadline-clock";
import { formatReceptionBoundaryCompact, getReceptionPresentation } from "@/lib/reception-presentation";

export function DeadlineCard({ item, now, headingLevel = 3, anchor = false, variant = "full" }: { item: Deadline; now: string; headingLevel?: 3 | 4; anchor?: boolean; variant?: "full" | "summary" }) {
  const currentTime = useDeadlineNow(now);
  const { status, stateLabel, urgencyLabel, resaleLabel, nextBoundary } = getReceptionPresentation(item, currentTime);
  const fields = getReceptionFields(item);
  const sales = isSalesInformation(item);
  const finished = isDeadlineFinished(item, currentTime);
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const summary = variant === "summary";
  const startDate = (fields.startsAtPrecision !== "unknown" || fields.informationType !== "unspecified") && <p className={`deadline-card__date${!finished && nextBoundary === "start" ? " deadline-card__date--next" : ""}`} data-boundary="start">開始：{fields.startsAt || fields.startsOn ? <time dateTime={fields.startsAt ?? fields.startsOn!} aria-label={summary ? formatReceptionStart(item) : undefined}>{summary ? formatReceptionBoundaryCompact(item, "start") : formatReceptionStart(item)}</time> : formatReceptionStart(item)}</p>;
  const endDate = <p className={`deadline-card__date${!finished && nextBoundary === "end" ? " deadline-card__date--next" : ""}`} data-boundary="end">{sales ? "販売終了" : "締切"}：{item.deadlineAt || item.deadlineOn ? <time dateTime={item.deadlineAt ?? item.deadlineOn!} aria-label={summary ? formatDeadline(item) : undefined}>{summary ? formatReceptionBoundaryCompact(item, "end") : formatDeadline(item)}</time> : (sales ? "終了日時未確認" : "締切日時未定")}</p>;
  return (
    <article className={`appearance-card deadline-card deadline-card--${status}${summary ? " deadline-card--summary" : ""}`} id={anchor ? `deadline-${item.id}` : undefined}>
      <div className="appearance-card__meta">
        <span className="deadline-kind deadline-kind--type">{receptionInformationTypeLabels[fields.informationType]}</span>
        <span className="deadline-kind deadline-kind--project">{item.projectType === "fan" ? "ファン企画" : "公式企画"}</span>
        <span className={`deadline-status deadline-status--${status}`}>{stateLabel}</span>
        {urgencyLabel && <span className={`deadline-status deadline-status--${urgencyLabel.startsWith("本日") ? "today" : "soon"}`}>{urgencyLabel}</span>}
        {resaleLabel && <span className="deadline-status deadline-status--resale">{resaleLabel}</span>}
      </div>
      <Heading>{summary ? <a className="deadline-card__detail" href={createDeadlineDetailHref(item.id)}>{item.projectTitle}</a> : item.projectTitle}</Heading>
      <p className="deadline-card__label">{item.label}</p>
      <div className="deadline-card__dates">{nextBoundary === "start" ? <>{startDate}{endDate}</> : <>{endDate}{startDate}</>}</div>
      {!summary && <p className="deadline-card__organizer">{item.projectType === "fan" ? "ファン企画" : "公式企画"} · 主催：{item.organizer}</p>}
      {!summary && item.targets.length > 0 && <ul className="deadline-card__targets" aria-label="関連する出演・公演">
        {item.targets.map((target) => <li key={target.id}>{target.eventTitle ?? target.title}{target.sessionLabel ? ` / ${target.sessionLabel}` : ""} — {formatAppearanceStart(target)}</li>)}
      </ul>}
      {!summary && item.note && <p className="deadline-card__note">{item.note}</p>}
      {!summary && <p className="appearance-card__published">告知 {formatPublication(item.publication)}</p>}
      <div className="appearance-card__sources">
        {item.applicationUrl && <a className="source-link deadline-card__apply" href={item.applicationUrl} target="_blank" rel="noopener noreferrer">{sales ? "販売ページを見る" : finished ? "受付ページを見る" : "申し込み先を見る"} <span aria-hidden="true">↗</span></a>}
        {item.sourceUrls.map((url, index) => <a className="source-link" key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={`${item.projectTitle}の告知元${index + 1}を新しいタブで開く`}>告知元{item.sourceUrls.length > 1 ? ` ${index + 1}` : ""} <span aria-hidden="true">↗</span></a>)}
      </div>
    </article>
  );
}

export function RelatedDeadlines({ items, now }: { items: Deadline[]; now: string }) {
  const currentTime = useDeadlineNow(now);
  if (items.length === 0) return null;
  return <ul className="appearance-card__deadlines" aria-label="関連する受付・販売情報">
    {items.map((item) => {
      const status = getReceptionStatus(item, currentTime);
      return <li key={item.id}><a href={createDeadlineDetailHref(item.id)}>{item.label}</a><span className={`deadline-status deadline-status--${status}`}>{getReceptionStatusLabel(item, currentTime)}</span><span>{item.deadlinePrecision === "unknown" ? formatReceptionStart(item) : formatDeadline(item)}</span></li>;
    })}
  </ul>;
}
