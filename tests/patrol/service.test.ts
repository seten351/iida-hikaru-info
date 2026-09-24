import assert from "node:assert/strict";
import test from "node:test";
import { executePatrol, isRegistered } from "../../scripts/patrol/service";
import { candidateId, type PatrolCandidate } from "../../scripts/patrol/types";
import type { KnownAppearance, PatrolStore, QueuedCandidate } from "../../scripts/patrol/store";

function candidate(number: number): PatrolCandidate {
  return { key: `program:hikaroom:${number}`, kind: "program", title: `飯田ヒカルのヒカROOM！ 第${number}回`, category: "配信", sourceUrl: `https://www.youtube.com/watch?v=abcdefgh${String(number).padStart(3, "0")}`, publishedAt: "2026-09-24T01:00:00Z", seriesId: "hikaroom", appearanceId: `hikaroom-episode-${number}`, note: "公式動画の出演候補" };
}

function memoryStore() {
  const queue = new Map<string, QueuedCandidate>();
  let known: KnownAppearance[] = [];
  let writes = 0;
  const store: PatrolStore = {
    known: async () => known,
    enqueue: async value => {
      writes++;
      const id = candidateId(value);
      if (!queue.has(id)) queue.set(id, { id, candidate: value, notified: false });
    },
    pending: async () => [...queue.values()],
    markRegistered: async ids => { writes++; ids.forEach(id => queue.delete(id)); },
    markNotified: async ids => { writes++; ids.forEach(id => { queue.get(id)!.notified = true; }); },
  };
  return { store, queue, get writes() { return writes; }, setKnown: (values: KnownAppearance[]) => { known = values; } };
}

test("same candidate is notified only once across runs", async () => {
  const state = memoryStore();
  let delivered = 0;
  const options = { dryRun: false, store: state.store, collectors: [{ name: "official", collect: async () => [candidate(37)] }], notify: async (items: Parameters<Parameters<typeof executePatrol>[0]["notify"]>[0], sent: Parameters<Parameters<typeof executePatrol>[0]["notify"]>[1]) => { delivered += items.length; await sent(items); } };
  await executePatrol(options);
  await executePatrol(options);
  assert.equal(delivered, 1);
  assert.equal(state.queue.size, 1);
});

test("failed later batch resumes only undelivered candidates, even outside the next feed", async () => {
  const state = memoryStore();
  const candidates = Array.from({ length: 12 }, (_, n) => candidate(n + 37));
  const first = await executePatrol({ dryRun: false, store: state.store, collectors: [{ name: "official", collect: async () => candidates }], notify: async (items, sent) => { await sent(items.slice(0, 10)); throw new Error("simulated second batch failure"); } });
  assert.equal(first.notificationCount, 10);
  assert.equal(first.errors.length, 1);
  const second = await executePatrol({ dryRun: false, store: state.store, collectors: [], notify: async (items, sent) => { assert.equal(items.length, 2); await sent(items); } });
  assert.equal(second.notificationCount, 2);
});

test("Antigravity registrations during fetch and between runs suppress queued notifications", async () => {
  const state = memoryStore();
  const value = candidate(37);
  const first = await executePatrol({ dryRun: false, store: state.store, collectors: [{ name: "official", collect: async () => { state.setKnown([{ id: value.appearanceId!, title: value.title }]); return [value]; } }], notify: async items => { assert.equal(items.length, 0); } });
  assert.equal(first.resolvedCount, 1);
  assert.equal(state.queue.size, 0);
  const second = await executePatrol({ dryRun: false, store: state.store, collectors: [{ name: "official", collect: async () => [value] }], notify: async items => { assert.equal(items.length, 0); } });
  assert.equal(second.candidates.length, 0);
});

test("a failed source stays a failed run while healthy sources are saved and notified", async () => {
  const state = memoryStore();
  const report = await executePatrol({ dryRun: false, store: state.store, collectors: [
    { name: "offline", collect: async () => { throw new Error("secret-url"); } },
    { name: "official", collect: async () => [candidate(37)] },
  ], notify: async (items, sent) => sent(items) });
  assert.equal(report.errors.length, 1);
  assert.equal(report.notificationCount, 1);
  assert.equal(JSON.stringify(report).includes("secret-url"), false);
});

test("dry-run performs no writes or notifications and does not consume delivery state", async () => {
  const state = memoryStore();
  const report = await executePatrol({ dryRun: true, store: state.store, collectors: [{ name: "official", collect: async () => [candidate(37)] }], notify: async () => { assert.fail("must not notify"); } });
  assert.equal(report.candidates.length, 1);
  assert.equal(state.writes, 0);
});

test("all sources failing never reports a clean no-updates run", async () => {
  const state = memoryStore();
  const report = await executePatrol({ dryRun: true, store: state.store, collectors: [{ name: "offline", collect: async () => { throw new Error("HTTP 503"); } }], notify: async () => {} });
  assert.equal(report.errors.length, 1);
  assert.equal(report.sources[0].error, "offline: source collection failed");
});

test("registration matching handles different IDs, typography, and individual source URLs", () => {
  const value = candidate(37);
  assert.ok(isRegistered(value, [{ id: "manually-entered", title: "飯田ヒカルのヒカROOM 第３７回" }]));
  assert.ok(isRegistered(value, [{ id: "different", title: "別名", sourceUrl: value.sourceUrl }]));
  assert.equal(isRegistered(value, [{ id: "hikaroom-episode-38", title: "飯田ヒカルのヒカROOM 第38回" }]), false);
  const onsen = { ...value, key: "program:kannahikaru:16", appearanceId: "kannahikaru-episode-16", title: "カンナヒカル（仮）第16回", sourceUrl: "https://www.onsen.ag/program/umauma" };
  assert.equal(isRegistered(onsen, [{ id: "kannahikaru-episode-15", title: "カンナヒカル（仮）第15回", sourceUrl: onsen.sourceUrl }]), false);
});
