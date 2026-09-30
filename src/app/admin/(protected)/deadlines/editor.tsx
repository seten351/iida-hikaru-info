"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { AdminDeadlineFields } from "@/domain/deadline";
import type { AdminDeadlineMutationInput, AdminSourceInput } from "@/server/admin/write-input";

import { finalizeAdminWriteAction, previewAdminWriteAction } from "../write-actions";
import { initialAdminWriteState, type AdminWriteActionState } from "../write-action-state";

type AppearanceOption = { id: string; title: string; sessionLabel: string | null; visibilityStatus: string };

const emptySource: AdminSourceInput = {
  canonicalUrl: "", sourceName: "", externalItemId: "", evidenceKey: "default",
  precision: "exact", publishedAt: null, publishedOn: null,
};

function isXPostUrl(value: string) {
  try {
    const url = new URL(value);
    return ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)
      && /^\/[^/]+\/status\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function WriteResult({ state }: { state: AdminWriteActionState }) {
  if (state.stage === "error") return <p className="admin-form-error" role="alert">{state.message}</p>;
  if (state.stage !== "complete") return null;
  return (
    <div className={`admin-write-result admin-write-result-${state.status}`} role="status">
      <p>{state.message}</p>
      {state.proposalIds.map((id) => <Link key={id} href={`/admin/deadlines/proposals/${id}`} prefetch={false}>変更履歴 {id}</Link>)}
      <Link href="/admin/deadlines" prefetch={false}>締切一覧へ</Link>
    </div>
  );
}

function Confirmation({ state }: { state: Extract<AdminWriteActionState, { stage: "preview" }> }) {
  const [result, action, pending] = useActionState(finalizeAdminWriteAction, initialAdminWriteState);
  if (result.stage !== "idle") return <WriteResult state={result} />;
  return (
    <section className="admin-confirm-panel">
      <h2>変更内容の確認</h2>
      <p>締切・関連出演・告知元をまとめて検証し、変更履歴とともに確定します。</p>
      <pre className="admin-json">{JSON.stringify(state.input, null, 2)}</pre>
      <form action={action} className="admin-confirm-actions">
        <input type="hidden" name="previewToken" value={state.token} />
        <button disabled={pending} name="decision" value="confirm" type="submit">{pending ? "確定中…" : "この内容で確定"}</button>
        <button disabled={pending} className="admin-danger-button" name="decision" value="reject" type="submit">変更を破棄</button>
      </form>
    </section>
  );
}

function useDeadlinePreview(input: AdminDeadlineMutationInput) {
  const [state, action, pending] = useActionState(previewAdminWriteAction, initialAdminWriteState);
  const dispatch = (data: FormData) => {
    data.set("input", JSON.stringify(input));
    action(data);
  };
  return { state, dispatch, pending };
}

export function DeadlineVisibilityEditor({ input, label }: { input: AdminDeadlineMutationInput; label: string }) {
  const { state, dispatch, pending } = useDeadlinePreview(input);
  if (state.stage === "preview") return <Confirmation state={state} />;
  if (state.stage === "complete") return <WriteResult state={state} />;
  return <form action={dispatch} className="admin-inline-write"><WriteResult state={state} /><button disabled={pending} type="submit">{pending ? "検証中…" : label}</button></form>;
}

export function DeadlineEditor({ deadline, source: initialSource, series, appearances, initialAppearanceId }: {
  deadline?: AdminDeadlineFields & { version: number };
  source?: AdminSourceInput;
  series: Array<{ id: string; displayName: string }>;
  appearances: AppearanceOption[];
  initialAppearanceId?: string;
}) {
  const [fields, setFields] = useState<AdminDeadlineFields>(deadline ?? {
    id: "", label: "", projectTitle: "", organizer: "", projectType: "official", seriesId: null,
    deadlinePrecision: "exact", deadlineAt: null, deadlineOn: null, applicationUrl: null,
    note: null, state: "scheduled", appearanceIds: appearances.some((item) => item.id === initialAppearanceId) ? [initialAppearanceId!] : [],
  });
  const [source, setSource] = useState(initialSource ?? emptySource);
  const automaticXPublication = isXPostUrl(source.canonicalUrl);
  const [appearanceSearch, setAppearanceSearch] = useState("");
  const input: AdminDeadlineMutationInput = deadline
    ? { kind: "deadline", operation: "update", deadlineId: deadline.id, expectedVersion: deadline.version, fields, source }
    : { kind: "deadline", operation: "create", expectedVersion: null, fields, source };
  const { state, dispatch, pending } = useDeadlinePreview(input);
  if (state.stage === "preview") return <Confirmation state={state} />;
  if (state.stage === "complete") return <WriteResult state={state} />;
  const update = <K extends keyof AdminDeadlineFields>(name: K, value: AdminDeadlineFields[K]) => setFields((current) => ({ ...current, [name]: value }));
  const updateSource = <K extends keyof AdminSourceInput>(name: K, value: AdminSourceInput[K]) => setSource((current) => ({ ...current, [name]: value }));
  const visibleAppearances = appearances.filter((item) => fields.appearanceIds.includes(item.id) || `${item.title} ${item.id}`.toLocaleLowerCase().includes(appearanceSearch.toLocaleLowerCase()));
  return (
    <form action={dispatch} className="admin-write-form">
      <label>締切ID<input required disabled={Boolean(deadline)} value={fields.id} onChange={(event) => update("id", event.target.value)} placeholder="event-ticket-first-entry" /></label>
      <label>対象企画名<input required value={fields.projectTitle} onChange={(event) => update("projectTitle", event.target.value)} /></label>
      <label>受付名・段階名<input required value={fields.label} onChange={(event) => update("label", event.target.value)} placeholder="チケット先行抽選申込" /></label>
      <label>主催者<input required value={fields.organizer} onChange={(event) => update("organizer", event.target.value)} /></label>
      <label>企画区分<select value={fields.projectType} onChange={(event) => update("projectType", event.target.value as AdminDeadlineFields["projectType"])}><option value="official">公式企画</option><option value="fan">同人・ファン企画</option></select></label>
      <label>単独企画のシリーズ<select disabled={fields.appearanceIds.length > 0} value={fields.seriesId ?? ""} onChange={(event) => update("seriesId", event.target.value || null)}><option value="">なし</option>{series.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <p className="admin-form-note">出演がある企画は既存の出演を選択します。単独の同人・ファン企画は関連出演を選択せず登録できます。</p>
      <label>締切日時の精度<select value={fields.deadlinePrecision} onChange={(event) => {
        const deadlinePrecision = event.target.value as AdminDeadlineFields["deadlinePrecision"];
        setFields((current) => ({ ...current, deadlinePrecision, deadlineAt: deadlinePrecision === "exact" ? current.deadlineAt : null, deadlineOn: deadlinePrecision === "date" ? current.deadlineOn : null }));
      }}><option value="exact">日時確定</option><option value="date">日付のみ確定（時刻未確認）</option><option value="unknown">締切日時未定</option></select></label>
      {fields.deadlinePrecision === "exact" ? <label>締切日時（タイムゾーン付きISO 8601）<input required value={fields.deadlineAt ?? ""} onChange={(event) => update("deadlineAt", event.target.value || null)} placeholder="2026-10-10T23:59:00+09:00" /><span className="admin-form-note">日本時間は末尾に +09:00 を指定します。表示は日本時間に統一されます。</span></label> : null}
      {fields.deadlinePrecision === "date" ? <label>締切日（日本時間）<input required type="date" value={fields.deadlineOn ?? ""} onChange={(event) => update("deadlineOn", event.target.value || null)} /></label> : null}
      <label>受付状態<select value={fields.state} onChange={(event) => update("state", event.target.value as AdminDeadlineFields["state"])}><option value="scheduled">通常（期限経過は自動判定）</option><option value="closed">受付終了（早期終了など）</option><option value="cancelled">中止</option></select></label>
      <label>申し込み先URL<input type="url" value={fields.applicationUrl ?? ""} onChange={(event) => update("applicationUrl", event.target.value || null)} /></label>
      <label>補足<textarea rows={4} value={fields.note ?? ""} onChange={(event) => update("note", event.target.value || null)} /></label>
      <fieldset className="admin-fieldset">
        <legend>関連出演 ({fields.appearanceIds.length}件)</legend>
        <label>出演を検索<input value={appearanceSearch} onChange={(event) => setAppearanceSearch(event.target.value)} /></label>
        <p className="admin-form-note">複数公演に共通する受付は、その公演をすべて選択します。非公開出演だけに関連する締切は公開表示されません。</p>
        <div className="admin-deadline-appearance-options">
          {visibleAppearances.map((item) => <label key={item.id} className="admin-deadline-appearance-option"><input type="checkbox" checked={fields.appearanceIds.includes(item.id)} onChange={(event) => setFields((current) => ({ ...current, seriesId: null, appearanceIds: event.target.checked ? [...current.appearanceIds, item.id] : current.appearanceIds.filter((id) => id !== item.id) }))} /><span>{item.title}{item.sessionLabel ? ` · ${item.sessionLabel}` : ""}<small>{item.id} · {item.visibilityStatus}</small></span></label>)}
          {visibleAppearances.length === 0 ? <p>該当する出演はありません。</p> : null}
        </div>
      </fieldset>
      <fieldset className="admin-fieldset">
        <legend>締切の告知元</legend>
        <p className="admin-form-note">申し込み先とは別に、締切を確認できる個別の告知記事・主催者の投稿を登録します。変更時は現在のprimary告知元を差し替えます。</p>
        <label>告知元URL<input required type="url" value={source.canonicalUrl} onChange={(event) => {
          const canonicalUrl = event.target.value;
          setSource((current) => ({ ...current, canonicalUrl, ...(isXPostUrl(canonicalUrl) ? { precision: "exact" as const, publishedOn: null } : {}) }));
        }} /></label>
        <label>情報源名<input required value={source.sourceName} onChange={(event) => updateSource("sourceName", event.target.value)} placeholder="x:official_account" /></label>
        <label>告知ID<input required value={source.externalItemId} onChange={(event) => updateSource("externalItemId", event.target.value)} /></label>
        <label>evidence key<input required value={source.evidenceKey} onChange={(event) => updateSource("evidenceKey", event.target.value)} /></label>
        <label>告知日時の精度<select disabled={automaticXPublication} value={source.precision} onChange={(event) => {
          const precision = event.target.value as AdminSourceInput["precision"];
          setSource((current) => ({ ...current, precision, publishedAt: precision === "exact" ? current.publishedAt : null, publishedOn: precision === "date" ? current.publishedOn : null }));
        }}><option value="exact">日時確定</option><option value="date">日付のみ確定</option><option value="unknown">日時不明</option></select></label>
        {source.precision === "exact" ? <label>告知日時（タイムゾーン付きISO 8601）<input required={!automaticXPublication} value={source.publishedAt ?? ""} onChange={(event) => updateSource("publishedAt", event.target.value || null)} placeholder={automaticXPublication ? "ポストIDから自動算出（入力不要）" : "2026-09-30T18:00:00+09:00"} /></label> : null}
        {source.precision === "date" ? <label>告知日<input required type="date" value={source.publishedOn ?? ""} onChange={(event) => updateSource("publishedOn", event.target.value || null)} /></label> : null}
        <p className="admin-form-note">Xの個別告知はポストIDから正確な投稿日時を自動算出します。告知日時は空欄で登録できます。情報源名は x:アカウント名、告知IDはポストIDを指定してください。</p>
      </fieldset>
      <WriteResult state={state} />
      <button disabled={pending} type="submit">{pending ? "検証中…" : "変更内容をPreview"}</button>
    </form>
  );
}
