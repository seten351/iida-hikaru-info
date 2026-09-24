import type { AppearanceNotificationItem } from "./discord-notifier";
import type { KnownAppearance, PatrolStore } from "./store";
import { candidateId, isIndividualSource, normalizeTitle, type PatrolCandidate } from "./types";

export type PatrolCollector = { name: string; collect: () => Promise<PatrolCandidate[]> };
export type PatrolReport = {
  mode: "dry-run" | "backup";
  checkedAt: string;
  sources: Array<{ name: string; count: number; error?: string }>;
  candidates: PatrolCandidate[];
  notificationCount: number;
  resolvedCount: number;
  errors: string[];
};

export function isRegistered(candidate: PatrolCandidate, known: KnownAppearance[]) {
  if (candidate.appearanceId && known.some(item => item.id === candidate.appearanceId)) return true;
  if ((candidate.kind === "news" || isIndividualSource(candidate.sourceUrl)) && known.some(item => item.sourceUrl === candidate.sourceUrl)) return true;
  if (candidate.kind === "profile") {
    const title = candidate.key.split(":").at(-1)!;
    return title.length > 1 && known.some(item => normalizeTitle(item.title).includes(title));
  }
  return known.some(item => normalizeTitle(item.title) === normalizeTitle(candidate.title));
}

export async function executePatrol(options: {
  dryRun: boolean;
  store: PatrolStore;
  collectors: PatrolCollector[];
  notify: (items: AppearanceNotificationItem[], onBatchSent: (items: AppearanceNotificationItem[]) => Promise<void>) => Promise<void>;
}): Promise<PatrolReport> {
  const report: PatrolReport = {
    mode: options.dryRun ? "dry-run" : "backup", checkedAt: new Date().toISOString(),
    sources: [], candidates: [], notificationCount: 0, resolvedCount: 0, errors: [],
  };
  const known = await options.store.known();
  const results = await Promise.allSettled(options.collectors.map(collector => collector.collect()));
  results.forEach((result, index) => {
    const name = options.collectors[index].name;
    if (result.status === "rejected") {
      // Do not expose raw HTTP/driver exceptions (they may contain credentials).
      const error = `${name}: source collection failed`;
      report.sources.push({ name, count: 0, error });
      report.errors.push(error);
      return;
    }
    report.sources.push({ name, count: result.value.length });
    report.candidates.push(...result.value.filter(candidate => !isRegistered(candidate, known)));
  });
  report.candidates = [...new Map(report.candidates.map(candidate => [candidateId(candidate), candidate])).values()];
  if (options.dryRun) return report;

  try {
    for (const candidate of report.candidates) await options.store.enqueue(candidate);
    const pending = await options.store.pending();
    // Antigravity may have registered an item while sources were being fetched.
    const latestKnown = await options.store.known();
    const resolved = pending.filter(item => isRegistered(item.candidate, latestKnown));
    await options.store.markRegistered(resolved.map(item => item.id));
    report.resolvedCount = resolved.length;
    const unresolved = pending.filter(item => !item.notified && !isRegistered(item.candidate, latestKnown));
    const notifications = unresolved.map(({ id, candidate }): AppearanceNotificationItem => ({
      id, title: candidate.title, category: candidate.category, sourceUrl: candidate.sourceUrl,
      startsAtLabel: candidate.note, action: "candidate",
    }));
    await options.notify(notifications, async (batch) => {
      await options.store.markNotified(batch.map(item => item.id));
      report.notificationCount += batch.length;
    });
  } catch {
    report.errors.push("Candidate persistence or notification failed; saved unsent candidates remain queued.");
  }
  return report;
}
