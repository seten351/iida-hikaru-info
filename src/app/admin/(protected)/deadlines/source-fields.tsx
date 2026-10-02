"use client";

import type { AdminSourceInput } from "@/server/admin/write-input";

function isXPostUrl(value: string) {
  try {
    const url = new URL(value);
    return ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)
      && /^\/[^/]+\/status\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}


export function DeadlineSourceFields({ source, onChange }: { source: AdminSourceInput; onChange: (source: AdminSourceInput) => void }) {
  const automaticXPublication = isXPostUrl(source.canonicalUrl);
  const updateSource = <K extends keyof AdminSourceInput>(name: K, value: AdminSourceInput[K]) => onChange({ ...source, [name]: value });
  return <>
        <label>告知元URL<input required type="url" value={source.canonicalUrl} onChange={(event) => {
          const canonicalUrl = event.target.value;
          onChange({ ...source, canonicalUrl, ...(isXPostUrl(canonicalUrl) ? { precision: "exact" as const, publishedOn: null } : {}) });
        }} /></label>
        <label>情報源名<input required value={source.sourceName} onChange={(event) => updateSource("sourceName", event.target.value)} placeholder="x:official_account" /></label>
        <label>告知ID<input required value={source.externalItemId} onChange={(event) => updateSource("externalItemId", event.target.value)} /></label>
        <label>evidence key<input required value={source.evidenceKey} onChange={(event) => updateSource("evidenceKey", event.target.value)} /></label>
        <label>告知日時の精度<select disabled={automaticXPublication} value={source.precision} onChange={(event) => {
          const precision = event.target.value as AdminSourceInput["precision"];
          onChange({ ...source, precision, publishedAt: precision === "exact" ? source.publishedAt : null, publishedOn: precision === "date" ? source.publishedOn : null });
        }}><option value="exact">日時確定</option><option value="date">日付のみ確定</option><option value="unknown">日時不明</option></select></label>
        {source.precision === "exact" ? <label>告知日時（タイムゾーン付きISO 8601）<input required={!automaticXPublication} value={source.publishedAt ?? ""} onChange={(event) => updateSource("publishedAt", event.target.value || null)} placeholder={automaticXPublication ? "ポストIDから自動算出（入力不要）" : "2026-09-30T18:00:00+09:00"} /></label> : null}
        {source.precision === "date" ? <label>告知日<input required type="date" value={source.publishedOn ?? ""} onChange={(event) => updateSource("publishedOn", event.target.value || null)} /></label> : null}
        <p className="admin-form-note">Xの個別告知はポストIDから正確な投稿日時を自動算出します。告知日時は空欄で登録できます。情報源名は x:アカウント名、告知IDはポストIDを指定してください。</p>
  </>;
}

export function DeadlinePrimaryPreview({ before, after }: { before?: AdminSourceInput; after: AdminSourceInput }) {
  const changed = Boolean(before && (before.canonicalUrl !== after.canonicalUrl || before.evidenceKey !== after.evidenceKey || before.sourceName !== after.sourceName || before.externalItemId !== after.externalItemId || before.precision !== after.precision || before.publishedOn !== after.publishedOn || (before.publishedAt ? Date.parse(before.publishedAt) : null) !== (after.publishedAt ? Date.parse(after.publishedAt) : null)));
  return <section className="admin-subpanel">
    <h3>Primary告知元: {before ? changed ? "変更あり" : "維持" : "新規"}</h3>
    {before ? <p>変更前: {before.canonicalUrl} · {before.evidenceKey}</p> : null}
    <p>変更後: {after.canonicalUrl} · {after.evidenceKey}</p>
    <p className="admin-form-note">{changed ? "primary告知元または告知日時を変更します。公開発表日時への影響も確認してください。" : "追加の根拠はprimary告知元を変更せずに保存します。"}</p>
  </section>;
}
