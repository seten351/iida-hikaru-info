# 受付・販売情報

既存の締切機能を拡張し、チケット申込・イベント受付・配信販売・受注物販・通常通販を管理する。公開URL `/deadlines`、Admin `/admin/deadlines`、既存アンカーとCLI名は継続する。

## 日時と状態

- 開始は `startsAtPrecision / startsAt / startsOn`、終了は従来の `deadlinePrecision / deadlineAt / deadlineOn`。それぞれ `exact / date / unknown` を指定する。開始だけ・終了だけ・両方未確認でも登録できる。
- `exact` はタイムゾーン付きISO 8601、`date` は日付のみ。日付しか分からない場合は時刻を作らず、開始当日は「本日開始・時刻未確認」、翌日から開始済みと判定する。日付のみの終了は当日「時刻未確認」を表示し、翌日のJST日付境界で終了と判定する。
- `state` は `scheduled / closed / cancelled / sold_out`。`scheduled` の表示は共通domainが日時から判定する。`phaseOverride: auto / not_open / open` は一次情報による状況確認で、自動判定できない場合を補う。確定日時に矛盾する指定は拒否する。
- 「受付前・販売前」の確認後に確定した開始日時を跨いだ場合や、日付のみの開始日の翌日になった場合は、既存の確認値に表示を固定せず開始済みとして判定する。
- `informationType` は `ticket_application / event_registration / streaming_sale / made_to_order / online_sale / other / unspecified`。`projectType: official / fan` は別の区分。
- `online_sale` は通常通販のほか、アプリ等で行う会場物販の事前購入も含む。受取・配送方法は個別の公式案内を引き継ぎ、この種別だけで配送や受注生産を断定しない。受注生産を確認できる場合は `made_to_order` を使う。
- `saleMode: initial / resale` を状態とは別に指定する。期間延長・完売・同じ販売枠の再販は、IDと受付・販売名を維持してupdateする。過去の期間はAdmin revisionに残り、公開画面は現在の期間を表示する。
- 種別・期間・状況の未確認を根拠なく補完しない。終了不明は無期限販売を意味しない。別受付段階・別チャネルは区別した受付名とevidence keyで登録し、必ず事前照合する。

## v2入力と一次情報

通常操作は既存の `npm run db:admin-import-deadlines -- --input <JSON>` を使う。1件のJSONに `schemaVersion: 2` と、追加項目を含む全fieldsを指定する。IDは変更できず、updateには照合時の最新 `expectedVersion` を固定する。

以下は形式説明用の例であり、実登録には確認した企画名と個別一次情報を指定する。

```json
{
  "kind": "deadline",
  "schemaVersion": 2,
  "operation": "create",
  "expectedVersion": null,
  "fields": {
    "id": "goods-online-sale",
    "label": "公式通販",
    "projectTitle": "確認済みの物販企画名",
    "organizer": "公式販売者",
    "projectType": "official",
    "seriesId": null,
    "informationType": "online_sale",
    "startsAtPrecision": "date",
    "startsAt": null,
    "startsOn": "2026-10-01",
    "deadlinePrecision": "unknown",
    "deadlineAt": null,
    "deadlineOn": null,
    "state": "scheduled",
    "phaseOverride": "auto",
    "saleMode": "initial",
    "applicationUrl": "https://example.com/store/item",
    "note": null,
    "appearanceIds": []
  },
  "source": {
    "canonicalUrl": "https://example.com/news/goods-sale",
    "sourceName": "official:store",
    "externalItemId": "goods-sale",
    "evidenceKey": "goods-online-sale",
    "precision": "date",
    "publishedAt": null,
    "publishedOn": "2026-09-30"
  },
  "evidenceSources": []
}
```

更新は現在の `source`（primary）を引き継ぎ、延長・完売・再販・種別確認などの個別告知を `evidenceSources` に追加する。primary維持で種別・日時・状態・再販を変更するときは追加根拠が必須。同じ記事が更新された場合は、その既存sourceを根拠として再提示できるが、既存の公開日時を作り替えない。

v2は既存のactive根拠を保持し、active primaryは必ず1件とする。primaryを変更する場合は `source` を明示的に変更し、Previewで差を確認する。同じactive情報元の公開日時訂正はこの更新では行わない。個別告知URLを使い、Xはstatus URL・`x:`情報源名・ポストIDを一致させる。公開日時はSnowflakeからexactとして復元する。

1. `npm run check:deadline-duplicate -- "<企画名・受付名・告知URL・ID>"` で既存情報を照合する。
2. 最新の内部readerを使用して全fields・source・versionを引き継ぐ。操作JSONはGit外の一時ファイルに置く。
3. `npm run db:admin-import-deadlines -- --input <JSON>` で読み取り専用Previewを実行する。before/after・追加根拠・primary変更・日時精度・対象versionを確認する。
4. 出力の `inputHash` を `--apply --reviewed-hash <inputHash>` に渡す。入力を変更したらPreviewからやり直す。
5. `superseded / rejected` は未反映。最新情報を再照合する。通信・キャッシュ失効の障害時は同じJSON/hashで冪等に再試行する。
6. 操作JSONは終了後に削除する。非公開化・復元は明示根拠がある場合のみ行い、巡回から消えただけで終了・完売・中止を推測しない。

Adminも同じ検証・署名付きPreview・確定経路を使用する。通常更新はAntigravityが担当し、人間のAdminは確認・監査・緊急修正を中心とする。巡回基盤・実行間隔・出演更新経路は変更しない。

## 互換性と公開表示

- `schemaVersion` のない旧JSONの正規化・hash・冪等キーは維持する。旧updateで追加項目を省略しても保存済みの追加項目は消さない。旧形式のprimary差し替え動作も維持する。
- fingerprintは従来どおり関連出演（単独なら企画名）と受付名から作る。日時・種別・再販区分は含めない。
- 移行で既存ID・version・公開日時・監査履歴・日時精度を変更しない。追加項目は種別未確認・開始未確認・自動・初回の既定値。
- 新revisionはsnapshot schema 2で、過去schema 1の閲覧・承認済み操作の再実行を維持する。
- トップは締切優先3件と開始予定・販売中3件。一覧は終了日時あり／終了未確認／終了・完売・中止に分ける。終了・完売・中止は初期非表示。
- カレンダーは開始日と終了日のみ表示し、同日なら1件に両ラベルを付ける。検索の年は終了年を優先し、終了不明なら開始年。種別・状態フィルターは出演・新着には作用しない。
- 出演新着の並びと関連出演の公開可否を維持する。状態は共有キャッシュに保存せず、共通domainとリクエスト／クライアント時計で判定する。Admin／CLIの即時失効と失敗時の再試行を維持する。

## migration・検証・本番反映

追加migrationは `0014_add_deadline_sold_out.sql` と `0015_add_reception_sales_fields.sql`。既存0000〜0013は編集しない。0014は状態enumの値追加のみ、0015は追加列・既定値・開始精度・期間順序の制約で、新しいenum値をmigration内では使用しない。アプリの拡張書き込みはmigrationのコミット後に開始する。適用には既存のDrizzle migratorと直接接続を使う。

```bash
npm run test:deadlines
npm run test:deadlines-db
npm run test:public-cache
npm run test:public-cache-runtime
npm run test:latest-ui
npm run test:patrol
npm run test:guests
npm run test:publication
node --conditions=react-server --import tsx --test tests/admin/*.test.ts
npm run lint
npx tsc --noEmit
npm run build
```

`npm run verify:reception-migration` は設定済みDBを明示的なREAD ONLYトランザクションで読み取り、認証情報・認証試行テーブルを除いた既存データをメモリ内PGliteに復元する。0000〜0013のhash一致、復元一致、0014／0015適用後の既存全列・監査履歴・小数秒日時のfingerprint一致と追加列の中立的既定値を確認する。外部DBにmigration・更新は行わず、データをファイルへ保存しない。ソースが0000〜0013以外なら停止する。

2026-10-02の隔離検証では、既存17テーブル（出演170件、締切7件、出演revision445件、締切revision8件等）を復元し、既存全列・監査JSONの配列順序・日時精度が移行前後で一致した。既存データfingerprintは `b8962b6773844c74032db9e8aa24f4cf1386dd379f287bff4a4492ce1e884445`。取得データはメモリ内だけで扱い、スナップショットファイルは残していない。

本番反映前には、対象DB・適用履歴・接続先を再照合し、復旧用ブランチを保持する。隔離したNeonブランチでも直接接続のDrizzle migratorによる適用を確認した後、DB追加→互換対応アプリ→公開・Admin・CLI・失効確認→Antigravity v2入力開始の順に切り替える。設定本体は外部にあるため、稼働中指示の版、CLI版、DB scope、失効通知URL／secretを確認して反映を記録する。

拡張データ投入後は、拡張情報を読める互換対応版へアプリを戻す。逆migrationでデータ・履歴を削除しない。実装段階には本番migration・本番デプロイ・稼働中Antigravityの設定変更を含めず、2026-10-02の反映結果は[本番反映記録](reception-sales-production-20261002.md)に記載した。
