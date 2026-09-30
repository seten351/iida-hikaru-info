import type { Deadline } from "@/domain/deadline";
import type { Appearance } from "@/domain/appearance";
import type { DeadlineAdminRecord } from "@/server/deadlines/repository";

/** Pure projection accepts only public appearances: hidden titles/IDs never reach the browser. */
export function projectPublicDeadlines(records: DeadlineAdminRecord[], appearances: Appearance[], series: Array<{ id: string; displayName: string }>): Deadline[] {
  const byId = new Map(appearances.map(item => [item.id, item]));
  return records.flatMap(item => {
    if (item.visibilityStatus !== "public") return [];
    const targets = item.appearanceIds.flatMap(id => {
      const target = byId.get(id);
      return target ? [{ id: target.id, title: target.title, eventTitle: target.eventTitle, sessionLabel: target.sessionLabel,
        seriesId: target.seriesId, seriesName: target.seriesName, category: target.category,
        startsAtPrecision: target.startsAtPrecision, startsAt: target.startsAt, startsOn: target.startsOn }] : [];
    });
    if (item.appearanceIds.length && !targets.length) return [];
    const first = targets[0];
    const seriesId = first ? first.seriesId : item.seriesId;
    return [{ id: item.id, label: item.label, projectTitle: first && item.projectType === "official" ? first.eventTitle ?? first.title : item.projectTitle,
      organizer: item.organizer, projectType: item.projectType, seriesId,
      seriesName: first ? first.seriesName : series.find(entry => entry.id === seriesId)?.displayName ?? null,
      category: first?.category ?? "その他", deadlinePrecision: item.deadlinePrecision,
      deadlineAt: item.deadlineAt, deadlineOn: item.deadlineOn, applicationUrl: item.applicationUrl, note: item.note,
      state: item.state, appearanceIds: targets.map(target => target.id), targets, sourceUrls: item.sourceUrls,
      publication: { publishedAtPrecision: item.source.precision, publishedAt: item.source.publishedAt,
        publishedOn: item.source.publishedOn, collectedAt: item.createdAt },
    }];
  });
}
