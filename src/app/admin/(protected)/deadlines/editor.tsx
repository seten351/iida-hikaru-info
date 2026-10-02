"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { getReceptionFields, receptionInformationTypes, receptionInformationTypeLabels, type AdminDeadlineFields, type ReceptionFields } from "@/domain/deadline";
import { DeadlinePrimaryPreview, DeadlineSourceFields } from "./source-fields";
import type { AdminDeadlineMutationInput, AdminSourceInput } from "@/server/admin/write-input";

import { finalizeAdminWriteAction, previewAdminWriteAction } from "../write-actions";
import { initialAdminWriteState, type AdminWriteActionState } from "../write-action-state";

type AppearanceOption = { id: string; title: string; sessionLabel: string | null; visibilityStatus: string };

const emptySource: AdminSourceInput = {
  canonicalUrl: "", sourceName: "", externalItemId: "", evidenceKey: "default",
  precision: "exact", publishedAt: null, publishedOn: null,
};


function WriteResult({ state }: { state: AdminWriteActionState }) {
  if (state.stage === "error") return <p className="admin-form-error" role="alert">{state.message}</p>;
  if (state.stage !== "complete") return null;
  return (
    <div className={`admin-write-result admin-write-result-${state.status}`} role="status">
      <p>{state.message}</p>
      {state.proposalIds.map((id) => <Link key={id} href={`/admin/deadlines/proposals/${id}`} prefetch={false}>変更履歴 {id}</Link>)}
      <Link href="/admin/deadlines" prefetch={false}>受付・販売一覧へ</Link>
    </div>
  );
}

function Confirmation({ state, originalSource, originalFields }: { state: Extract<AdminWriteActionState, { stage: "preview" }>; originalSource?: AdminSourceInput; originalFields?: AdminDeadlineFields }) {
  const [result, action, pending] = useActionState(finalizeAdminWriteAction, initialAdminWriteState);
  if (result.stage !== "idle") return <WriteResult state={result} />;
  return (
    <section className="admin-confirm-panel">
      <h2>変更内容の確認</h2>
      <p>受付・販売・関連出演・告知元をまとめて検証し、変更履歴とともに確定します。</p>
      {state.input.kind === "deadline" && (state.input.operation === "create" || state.input.operation === "update") ? <>
        <DeadlinePrimaryPreview before={originalSource} after={state.input.source} />
        <p>追加根拠: {state.input.evidenceSources?.length ?? 0}件</p>
        {originalFields ? <details><summary>変更前の受付・販売情報</summary><pre className="admin-json">{JSON.stringify(originalFields, null, 2)}</pre></details> : null}
      </> : null}
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
  const [fields, setFields] = useState<AdminDeadlineFields & ReceptionFields>(() => ({ ...(deadline ?? {
    id: "", label: "", projectTitle: "", organizer: "", projectType: "official", seriesId: null,
    deadlinePrecision: "unknown", deadlineAt: null, deadlineOn: null, applicationUrl: null,
    note: null, state: "scheduled", appearanceIds: appearances.some((item) => item.id === initialAppearanceId) ? [initialAppearanceId!] : [],
  }), ...getReceptionFields(deadline ?? {}) }));
  const [source, setSource] = useState(initialSource ?? emptySource);
  const [evidenceSources, setEvidenceSources] = useState<AdminSourceInput[]>([]);
  const [appearanceSearch, setAppearanceSearch] = useState("");
  const input: AdminDeadlineMutationInput = deadline
    ? { kind: "deadline", schemaVersion: 2, operation: "update", deadlineId: deadline.id, expectedVersion: deadline.version, fields, source, evidenceSources }
    : { kind: "deadline", schemaVersion: 2, operation: "create", expectedVersion: null, fields, source, evidenceSources };
  const { state, dispatch, pending } = useDeadlinePreview(input);
  if (state.stage === "preview") return <Confirmation state={state} originalSource={initialSource} originalFields={deadline} />;
  if (state.stage === "complete") return <WriteResult state={state} />;
  const update = <K extends keyof (AdminDeadlineFields & ReceptionFields)>(name: K, value: (AdminDeadlineFields & ReceptionFields)[K]) => setFields((current) => ({ ...current, [name]: value }));
  const visibleAppearances = appearances.filter((item) => fields.appearanceIds.includes(item.id) || `${item.title} ${item.id}`.toLocaleLowerCase().includes(appearanceSearch.toLocaleLowerCase()));
  return (
    <form action={dispatch} className="admin-write-form">
      <label>受付・販売ID<input required disabled={Boolean(deadline)} value={fields.id} onChange={(event) => update("id", event.target.value)} placeholder="event-ticket-first-entry" /></label>
      <label>対象企画名<input required value={fields.projectTitle} onChange={(event) => update("projectTitle", event.target.value)} /></label>
      <label>受付・販売名<input required value={fields.label} onChange={(event) => update("label", event.target.value)} placeholder="チケット先行抽選申込" /></label>
      <label>主催者<input required value={fields.organizer} onChange={(event) => update("organizer", event.target.value)} /></label>
      <label>受付・販売種別<select value={fields.informationType} onChange={(event) => update("informationType", event.target.value as ReceptionFields["informationType"])}>{receptionInformationTypes.map((type) => <option key={type} value={type}>{receptionInformationTypeLabels[type]}</option>)}</select></label>
      <label>企画区分<select value={fields.projectType} onChange={(event) => update("projectType", event.target.value as AdminDeadlineFields["projectType"])}><option value="official">公式企画</option><option value="fan">同人・ファン企画</option></select></label>
      <label>単独企画のシリーズ<select disabled={fields.appearanceIds.length > 0} value={fields.seriesId ?? ""} onChange={(event) => update("seriesId", event.target.value || null)}><option value="">なし</option>{series.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <p className="admin-form-note">出演がある企画は既存の出演を選択します。単独の同人・ファン企画は関連出演を選択せず登録できます。</p>
      <label>開始日時の精度<select value={fields.startsAtPrecision} onChange={(event) => {
        const startsAtPrecision = event.target.value as ReceptionFields["startsAtPrecision"];
        setFields((current) => ({ ...current, startsAtPrecision, startsAt: startsAtPrecision === "exact" ? current.startsAt : null, startsOn: startsAtPrecision === "date" ? current.startsOn : null }));
      }}><option value="exact">日時確定</option><option value="date">日付のみ確定（時刻未確認）</option><option value="unknown">開始日時未確認</option></select></label>
      {fields.startsAtPrecision === "exact" ? <label>開始日時（タイムゾーン付きISO 8601）<input required value={fields.startsAt ?? ""} onChange={(event) => update("startsAt", event.target.value || null)} placeholder="2026-10-01T12:00:00+09:00" /></label> : null}
      {fields.startsAtPrecision === "date" ? <label>開始日（日本時間）<input required type="date" value={fields.startsOn ?? ""} onChange={(event) => update("startsOn", event.target.value || null)} /></label> : null}
      <p className="admin-form-note">開始・終了はそれぞれ未確認のまま登録できます。日付しか分からない場合、時刻を推測しないでください。</p>
      <label>終了・締切日時の精度<select value={fields.deadlinePrecision} onChange={(event) => {
        const deadlinePrecision = event.target.value as AdminDeadlineFields["deadlinePrecision"];
        setFields((current) => ({ ...current, deadlinePrecision, deadlineAt: deadlinePrecision === "exact" ? current.deadlineAt : null, deadlineOn: deadlinePrecision === "date" ? current.deadlineOn : null }));
      }}><option value="exact">日時確定</option><option value="date">日付のみ確定（時刻未確認）</option><option value="unknown">終了日時未確認</option></select></label>
      {fields.deadlinePrecision === "exact" ? <label>終了・締切日時（タイムゾーン付きISO 8601）<input required value={fields.deadlineAt ?? ""} onChange={(event) => update("deadlineAt", event.target.value || null)} placeholder="2026-10-10T23:59:00+09:00" /><span className="admin-form-note">日本時間は末尾に +09:00 を指定します。表示は日本時間に統一されます。</span></label> : null}
      {fields.deadlinePrecision === "date" ? <label>終了・締切日（日本時間）<input required type="date" value={fields.deadlineOn ?? ""} onChange={(event) => update("deadlineOn", event.target.value || null)} /></label> : null}
      <label>受付・販売状態<select value={fields.state} onChange={(event) => update("state", event.target.value as AdminDeadlineFields["state"])}><option value="scheduled">通常（開始・終了は自動判定）</option><option value="closed">終了（早期終了など）</option><option value="sold_out">完売</option><option value="cancelled">中止</option></select></label>
      <label>一次情報で確認した受付・販売状況<select value={fields.phaseOverride} onChange={(event) => update("phaseOverride", event.target.value as ReceptionFields["phaseOverride"])}><option value="auto">日時から自動判定</option><option value="not_open">受付前・販売前（確認済み）</option><option value="open">受付中・販売中（確認済み）</option></select></label>
      <label>再販区分<select value={fields.saleMode} onChange={(event) => update("saleMode", event.target.value as ReceptionFields["saleMode"])}><option value="initial">初回・通常</option><option value="resale">再販</option></select></label>
      <p className="admin-form-note">再販・延長は同じIDで開始・終了を更新します。以前の期間は変更履歴に保存されます。確認済み状況を指定するときは根拠を追加してください。</p>
      <label>受付・販売先URL<input type="url" value={fields.applicationUrl ?? ""} onChange={(event) => update("applicationUrl", event.target.value || null)} /></label>
      <label>補足<textarea rows={4} value={fields.note ?? ""} onChange={(event) => update("note", event.target.value || null)} /></label>
      <fieldset className="admin-fieldset">
        <legend>関連出演 ({fields.appearanceIds.length}件)</legend>
        <label>出演を検索<input value={appearanceSearch} onChange={(event) => setAppearanceSearch(event.target.value)} /></label>
        <p className="admin-form-note">複数公演に共通する受付は、その公演をすべて選択します。非公開出演だけに関連する受付・販売情報は公開表示されません。</p>
        <div className="admin-deadline-appearance-options">
          {visibleAppearances.map((item) => <label key={item.id} className="admin-deadline-appearance-option"><input type="checkbox" checked={fields.appearanceIds.includes(item.id)} onChange={(event) => setFields((current) => ({ ...current, seriesId: null, appearanceIds: event.target.checked ? [...current.appearanceIds, item.id] : current.appearanceIds.filter((id) => id !== item.id) }))} /><span>{item.title}{item.sessionLabel ? ` · ${item.sessionLabel}` : ""}<small>{item.id} · {item.visibilityStatus}</small></span></label>)}
          {visibleAppearances.length === 0 ? <p>該当する出演はありません。</p> : null}
        </div>
      </fieldset>
      <fieldset className="admin-fieldset">
        <legend>Primary告知元</legend>
        <p className="admin-form-note">受付・販売を確認できる個別告知を登録します。期間・完売・再販だけの更新では現在のprimaryを維持し、新しい告知を下の追加根拠に登録してください。</p>
        <DeadlineSourceFields source={source} onChange={setSource} />
      </fieldset>
      <fieldset className="admin-fieldset">
        <legend>追加の根拠 ({evidenceSources.length}件)</legend>
        <p className="admin-form-note">延長・完売・再販などを確認した一次情報を追加します。既存の根拠は保持されます。</p>
        {evidenceSources.map((evidence, index) => <section className="admin-subpanel" key={index}>
          <h3>追加根拠 {index + 1}</h3>
          <DeadlineSourceFields source={evidence} onChange={(next) => setEvidenceSources((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} />
          <button type="button" onClick={() => setEvidenceSources((current) => current.filter((_, itemIndex) => itemIndex !== index))}>この追加根拠を取り除く</button>
        </section>)}
        <button disabled={evidenceSources.length >= 20} type="button" onClick={() => setEvidenceSources((current) => [...current, { ...emptySource }])}>根拠を追加</button>
      </fieldset>
      <WriteResult state={state} />
      <button disabled={pending} type="submit">{pending ? "検証中…" : "変更内容をPreview"}</button>
    </form>
  );
}
