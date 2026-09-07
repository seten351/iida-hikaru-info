"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { appearanceCategoryDisplayOrder } from "@/domain/appearance";
import type {
  AdminAppearanceFields,
  AdminSourceInput,
  AdminWriteInput,
} from "@/server/admin/write-input";

import {
  finalizeAdminWriteAction,
  previewAdminWriteAction,
} from "./write-actions";
import {
  initialAdminWriteState,
  type AdminWriteActionState,
} from "./write-action-state";

function Result({ state }: { state: AdminWriteActionState }) {
  if (state.stage === "idle") return null;
  if (state.stage === "error") {
    return <p className="admin-form-error" role="alert">{state.message}</p>;
  }
  if (state.stage === "complete") {
    return (
      <div className={`admin-write-result admin-write-result-${state.status}`} role="status">
        <p>{state.message}</p>
        {state.proposalIds.map((id) => (
          <Link href={`/admin/proposals/${id}`} key={id} prefetch={false}>
            proposal {id}
          </Link>
        ))}
      </div>
    );
  }
  return null;
}

function Confirmation({ state }: { state: Extract<AdminWriteActionState, { stage: "preview" }> }) {
  const [result, action, pending] = useActionState(
    finalizeAdminWriteAction,
    initialAdminWriteState,
  );
  if (result.stage !== "idle") return <Result state={result} />;
  return (
    <section className="admin-confirm-panel">
      <h3>Preview</h3>
      <p>この内容をtransaction内で再検証し、proposal・content・revisionを確定します。</p>
      <pre className="admin-json">{JSON.stringify(state.input, null, 2)}</pre>
      <form action={action} className="admin-confirm-actions">
        <input name="previewToken" type="hidden" value={state.token} />
        <button disabled={pending} name="decision" type="submit" value="confirm">
          {pending ? "確定中…" : "この内容で確定"}
        </button>
        <button className="admin-danger-button" disabled={pending} name="decision" type="submit" value="reject">
          Previewを破棄
        </button>
      </form>
    </section>
  );
}

function usePreview(input: AdminWriteInput) {
  const [state, action, pending] = useActionState(
    previewAdminWriteAction,
    initialAdminWriteState,
  );
  const dispatch = (formData: FormData) => {
    formData.set("input", JSON.stringify(input));
    action(formData);
  };
  return { state, dispatch, pending };
}

const emptySource: AdminSourceInput = {
  canonicalUrl: "",
  sourceName: "",
  externalItemId: "",
  evidenceKey: "default",
  precision: "unknown",
  publishedAt: null,
  publishedOn: null,
};

export function AppearanceEditor({
  appearance,
  series,
}: {
  appearance?: AdminAppearanceFields & { version: number };
  series: Array<{ id: string; displayName: string }>;
}) {
  const [fields, setFields] = useState<AdminAppearanceFields>(
    appearance ?? {
      id: "",
      startsAt: "",
      title: "",
      seriesId: null,
      eventGroupId: null,
      eventTitle: null,
      sessionLabel: null,
      category: "その他",
    },
  );
  const [source, setSource] = useState(emptySource);
  const input: AdminWriteInput = appearance
    ? {
        kind: "appearance",
        operation: "update",
        appearanceId: appearance.id,
        expectedVersion: appearance.version,
        fields,
      }
    : { kind: "appearance", operation: "create", expectedVersion: null, fields, source };
  const { state, dispatch, pending } = usePreview(input);
  if (state.stage === "preview") return <Confirmation state={state} />;
  if (state.stage === "complete") return <Result state={state} />;

  const update = (name: keyof AdminAppearanceFields, value: string) => {
    setFields((current) => ({ ...current, [name]: value === "" ? null : value }));
  };
  const updateSource = (name: keyof AdminSourceInput, value: string) => {
    setSource((current) => ({ ...current, [name]: value === "" ? null : value }));
  };
  return (
    <form action={dispatch} className="admin-write-form">
      <label>appearance ID<input disabled={Boolean(appearance)} required value={fields.id} onChange={(event) => update("id", event.target.value)} /></label>
      <label>開始日時 (ISO 8601)<input required value={fields.startsAt} onChange={(event) => update("startsAt", event.target.value)} placeholder="2026-09-06T18:00:00+09:00" /></label>
      <label>タイトル<input required value={fields.title} onChange={(event) => update("title", event.target.value)} /></label>
      <label>カテゴリ<select value={fields.category} onChange={(event) => update("category", event.target.value)}>{appearanceCategoryDisplayOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>シリーズ<select value={fields.seriesId ?? ""} onChange={(event) => update("seriesId", event.target.value)}><option value="">なし</option>{series.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <label>event group ID<input value={fields.eventGroupId ?? ""} onChange={(event) => update("eventGroupId", event.target.value)} /></label>
      <label>event title<input value={fields.eventTitle ?? ""} onChange={(event) => update("eventTitle", event.target.value)} /></label>
      <label>session label<input value={fields.sessionLabel ?? ""} onChange={(event) => update("sessionLabel", event.target.value)} /></label>
      {!appearance ? <SourceFields source={source} update={updateSource} /> : null}
      <Result state={state} />
      <button disabled={pending} type="submit">{pending ? "検証中…" : "Preview"}</button>
    </form>
  );
}

export function EventGroupEditor({
  eventGroupId,
  eventTitle,
  appearances,
}: {
  eventGroupId: string;
  eventTitle: string;
  appearances: Array<{ id: string; title: string; sessionLabel: string; version: number }>;
}) {
  const [nextEventTitle, setNextEventTitle] = useState(eventTitle);
  const [targets, setTargets] = useState(appearances);
  const input: AdminWriteInput = {
    kind: "appearance-group",
    operation: "update",
    eventGroupId,
    eventTitle: nextEventTitle,
    targets: targets.map((target) => ({
      appearanceId: target.id,
      expectedVersion: target.version,
      title: target.title,
    })),
  };
  const { state, dispatch, pending } = usePreview(input);
  if (state.stage === "preview") return <Confirmation state={state} />;
  if (state.stage === "complete") return <Result state={state} />;

  return (
    <form action={dispatch} className="admin-write-form">
      <p className="admin-form-note">
        group内の全{appearances.length}件を同一transactionで更新します。開始日時・series・event group ID・session label・sourceは変更できません。
      </p>
      <label>event title<input required value={nextEventTitle} onChange={(event) => setNextEventTitle(event.target.value)} /></label>
      <fieldset className="admin-fieldset">
        <legend>appearance title</legend>
        {targets.map((target, index) => (
          <label key={target.id}>
            {target.sessionLabel} · {target.id} (v{target.version})
            <input
              required
              value={target.title}
              onChange={(event) => setTargets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))}
            />
          </label>
        ))}
      </fieldset>
      <Result state={state} />
      <button disabled={pending} type="submit">{pending ? "検証中…" : "Preview"}</button>
    </form>
  );
}

function SourceFields({
  source,
  update,
}: {
  source: AdminSourceInput;
  update: (name: keyof AdminSourceInput, value: string) => void;
}) {
  return (
    <fieldset className="admin-fieldset">
      <legend>情報源</legend>
      <label>canonical URL<input required type="url" value={source.canonicalUrl} onChange={(event) => update("canonicalUrl", event.target.value)} /></label>
      <label>source name<input required value={source.sourceName} onChange={(event) => update("sourceName", event.target.value)} /></label>
      <label>external item ID<input required value={source.externalItemId} onChange={(event) => update("externalItemId", event.target.value)} /></label>
      <label>evidence key<input required value={source.evidenceKey} onChange={(event) => update("evidenceKey", event.target.value)} /></label>
      <label>publication precision<select value={source.precision} onChange={(event) => update("precision", event.target.value)}><option value="unknown">unknown</option><option value="date">date</option><option value="exact">exact</option></select></label>
      {source.precision === "exact" ? <label>published at (ISO 8601)<input required value={source.publishedAt ?? ""} onChange={(event) => update("publishedAt", event.target.value)} /></label> : null}
      {source.precision === "date" ? <label>published on<input required type="date" value={source.publishedOn ?? ""} onChange={(event) => update("publishedOn", event.target.value)} /></label> : null}
    </fieldset>
  );
}

export function FixedMutationFlow({ input, label }: { input: AdminWriteInput; label: string }) {
  const { state, dispatch, pending } = usePreview(input);
  if (state.stage === "preview") return <Confirmation state={state} />;
  if (state.stage === "complete") return <Result state={state} />;
  return (
    <form action={dispatch} className="admin-inline-write">
      <Result state={state} />
      <button disabled={pending} type="submit">{pending ? "検証中…" : label}</button>
    </form>
  );
}

export function SourceMutationEditor({
  targets,
  allowTargetEdit = false,
}: {
  targets: Array<{ appearanceId: string; expectedVersion: number }>;
  allowTargetEdit?: boolean;
}) {
  const [operation, setOperation] = useState<"append" | "replace">("append");
  const [source, setSource] = useState(emptySource);
  const [targetText, setTargetText] = useState(
    targets.map((target) => `${target.appearanceId}:${target.expectedVersion}`).join("\n"),
  );
  const parsedTargets = targetText.split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.lastIndexOf(":");
    return { appearanceId: line.slice(0, separator), expectedVersion: Number(line.slice(separator + 1)) };
  });
  const input: AdminWriteInput = { kind: "source", operation, targets: parsedTargets, source };
  const { state, dispatch, pending } = usePreview(input);
  if (state.stage === "preview") return <Confirmation state={state} />;
  if (state.stage === "complete") return <Result state={state} />;
  const updateSource = (name: keyof AdminSourceInput, value: string) => {
    setSource((current) => ({ ...current, [name]: value === "" ? null : value }));
  };
  return (
    <form action={dispatch} className="admin-write-form">
      {allowTargetEdit ? <label>appearance ID:version（1行1件、最大100件）<textarea required rows={8} value={targetText} onChange={(event) => setTargetText(event.target.value)} /></label> : null}
      <label>操作<select value={operation} onChange={(event) => setOperation(event.target.value as "append" | "replace")}><option value="append">追加（secondary）</option><option value="replace">全active sourceを差し替え（primary）</option></select></label>
      <SourceFields source={source} update={updateSource} />
      <Result state={state} />
      <button disabled={pending} type="submit">{pending ? "検証中…" : "Preview"}</button>
    </form>
  );
}

export function SeriesEditor({ series }: { series?: { id: string; displayName: string; version: number } }) {
  const [seriesId, setSeriesId] = useState(series?.id ?? "");
  const [displayName, setDisplayName] = useState(series?.displayName ?? "");
  const input: AdminWriteInput = series
    ? { kind: "series", operation: "update", seriesId, expectedVersion: series.version, displayName }
    : { kind: "series", operation: "create", seriesId, expectedVersion: null, displayName };
  const { state, dispatch, pending } = usePreview(input);
  if (state.stage === "preview") return <Confirmation state={state} />;
  if (state.stage === "complete") return <Result state={state} />;
  return (
    <form action={dispatch} className="admin-write-form">
      <label>series ID<input disabled={Boolean(series)} required value={seriesId} onChange={(event) => setSeriesId(event.target.value)} /></label>
      <label>表示名<input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <Result state={state} />
      <button disabled={pending} type="submit">{pending ? "検証中…" : "Preview"}</button>
    </form>
  );
}
