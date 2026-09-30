"use client";

import type { Deadline } from "@/domain/deadline";
import { deadlineStatusLabels, formatDeadline, getDeadlineStatus, isDeadlineFinished } from "@/lib/deadlines";
import { formatAppearanceStart, formatPublication } from "@/lib/appearances";
import { useDeadlineNow } from "@/app/deadline-clock";

export function DeadlineCard({ item, now, headingLevel = 3, anchor = false }: { item: Deadline; now: string; headingLevel?: 3 | 4; anchor?: boolean }) {
  const currentTime = useDeadlineNow(now);
  const status = getDeadlineStatus(item, currentTime);
  const finished = isDeadlineFinished(item, currentTime);
  const Heading = headingLevel === 4 ? "h4" : "h3";
  return (
    <article className={`appearance-card deadline-card deadline-card--${status}`} id={anchor ? `deadline-${item.id}` : undefined}>
      <div className="appearance-card__meta">
        <span className={`deadline-status deadline-status--${status}`}>{deadlineStatusLabels[status]}</span>
        <span className="deadline-kind">{item.projectType === "fan" ? "ファン企画" : "公式企画"}</span>
      </div>
      <Heading>{item.projectTitle}</Heading>
      <p className="deadline-card__label">{item.label}</p>
      <p className="deadline-card__date">締切：{item.deadlineAt || item.deadlineOn ? <time dateTime={item.deadlineAt ?? item.deadlineOn!}>{formatDeadline(item)}</time> : formatDeadline(item)}</p>
      <p className="deadline-card__organizer">主催：{item.organizer}</p>
      {item.targets.length > 0 && <ul className="deadline-card__targets" aria-label="関連する出演・公演">
        {item.targets.map((target) => <li key={target.id}>{target.eventTitle ?? target.title}{target.sessionLabel ? ` / ${target.sessionLabel}` : ""} — {formatAppearanceStart(target)}</li>)}
      </ul>}
      {item.note && <p className="deadline-card__note">{item.note}</p>}
      <p className="appearance-card__published">告知 {formatPublication(item.publication)}</p>
      <div className="appearance-card__sources">
        {item.applicationUrl && <a className="source-link deadline-card__apply" href={item.applicationUrl} target="_blank" rel="noopener noreferrer">{finished ? "受付ページを見る" : "申し込み先を見る"} <span aria-hidden="true">↗</span></a>}
        {item.sourceUrls.map((url, index) => <a className="source-link" key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={`${item.projectTitle}の告知元${index + 1}を新しいタブで開く`}>告知元{item.sourceUrls.length > 1 ? ` ${index + 1}` : ""} <span aria-hidden="true">↗</span></a>)}
      </div>
    </article>
  );
}

export function RelatedDeadlines({ items, now }: { items: Deadline[]; now: string }) {
  const currentTime = useDeadlineNow(now);
  if (items.length === 0) return null;
  return <ul className="appearance-card__deadlines" aria-label="関連する申し込み締切">
    {items.map((item) => {
      const status = getDeadlineStatus(item, currentTime);
      return <li key={item.id}><a href="#deadlines">{item.label}</a><span className={`deadline-status deadline-status--${status}`}>{deadlineStatusLabels[status]}</span><span>{formatDeadline(item)}</span></li>;
    })}
  </ul>;
}
