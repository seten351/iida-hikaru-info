# 飯田ヒカル 出演情報

飯田ヒカルさんの新着情報、今後の出演予定、過去の出演履歴をまとめるWebサイトです。

## このサイトについて

当サイトは非公式ファンサイトであり、飯田ヒカルさんご本人、所属事務所、各コンテンツ運営会社とは関係ありません。正確な情報は公式サイト・公式SNSをご確認ください。

## 開発環境

- Node.js 24.20.0（asdfで固定）
- npm 11.19.0
- Next.js 16.3.4

## ローカル起動

```bash
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## 確認コマンド

```bash
npm run lint
npm run test:latest-ui
npm run test:public-ui
npm run test:deadlines
npx tsc --noEmit
npm run build
```

出演情報はNeon Postgresから取得します。ページはリクエスト時に現在時刻を取得し、日本時間で予定と履歴を分類します。

## 公開ページ

640px以下のトップは通常の新着・受付販売カードを表示せず、専用一覧への導線と緊急情報最大2件を表示します。緊急情報は本日終了、本日または24時間以内の開始、日本時間の3日後までの終了を対象とし、該当がないときは欄ごと省略します。日付だけの開始を販売中や正確な時刻とはみなしません。641px以上では新着3件と受付販売合計3件を左右2列に表示します。

上部ナビの「新着」「受付・販売」は `/news`（公式発表順、30件ずつ）と `/deadlines` へ直接移動します。フリーワード・シリーズ・カテゴリ・年を引き継ぎ、受付条件は新着には持ち越しません。予定一覧とカレンダーは `#upcoming`、出演履歴は `#history` にまとめます。旧 `#latest`・`#deadlines` も維持します。新着の年は出演年、受付販売の年は終了年を優先し、終了日が不明なら開始年です。

受付販売一覧は未終了を初期表示し、「締切・販売終了」「開始予定」「終了・完売・中止」「すべて」の目的別chipsと種別で探せます。`receptionView=active|ending|starting|finished|all` は一覧専用で、既存検索条件とANDで適用します。省略時は未終了ですが、既存の終了状態検索は履歴を表示します。関連受付リンクは対象カードへ直接移動し、終了済みの対象も表示します。トップの件数制限は検索対象・カレンダー・今後の予定には適用しません。

860px以下の検索はキーワードを残し、詳細条件を折りたためます。カレンダーは受付開始・販売開始・締切・販売終了を集約表示し、日付選択後に全情報を確認できます。年月操作は44px以上の操作領域を確保して折り返し、空日の詳細は短く表示します。出演履歴・新着のページ送りも文字拡大時に折り返して横はみ出しを防ぎます。カードの7暦日以内の締切間近判定、共有時計、公開データの共有キャッシュは維持します。

## データベース

Vercel Marketplaceで接続したNeon PostgresとDrizzle ORMを使用します。接続情報はGit管理外の`.env.local`から読み込みます。

初回セットアップまたはスキーマ変更時は、VercelのDevelopment環境変数を取得してから、マイグレーションを明示的に実行します。

```bash
npx vercel env pull .env.local --yes
npm run db:generate
npm run db:migrate
```

出演情報はGit管理された `scripts/appearance-import-data.ts` と `scripts/appearance-series-data.ts` から安全に投入します。シリーズは正規化IDと表示名をマスターで管理し、出演ごとに任意で関連付けます。公式情報元URLと情報元内の識別子は必須です。公式発表は、時刻まで判明した場合・日付のみ判明した場合・不明の場合を区別して記録し、架空の時刻は補完しません。

importは既定でdry-runとなり、追加・更新・変更なしの差分だけを表示します。確認後に `--apply` を付けた場合だけ書き込みます。通常importはレコードを削除しません。

```bash
npm run db:import
npm run db:import -- --apply
npm run db:verify
```

Admin activation完了後はレガシーな `db:import --apply` がロックされるため、Git管理データからAdmin write契約（proposal/revision/source link整合性）に則って未登録データを安全に投入する場合は `db:admin-import` を使用します。

```bash
npm run db:admin-import
```

### ゲスト情報の確認・更新

`drizzle/0013_add_appearance_guests.sql` で出演と提案にゲスト情報を追加します。既存出演は未確認の初期値になり、公開日時・情報元・versionは変更しません。アプリの切り替え前に接続先を確認して `npm run db:migrate` を実行してください。機能実装時は隔離したPostgresで検証し、2026-09-30に別Neonプロジェクトへ本番DBをコピーして最終検証後、本番0013適用とアプリの昇格を完了しました。機能導入時は既存170件を未確認のまま維持しました。その後の少数データ確認で日時精度低下を検出し、修正・復旧まで投入を停止しました。2026-10-01に修正の本番有効化を確認し、停止していた3件を含む61件を既存Admin writeで更新しました。全170件の一次情報調査結果は確認済み62件・完全未確認108件です。根拠不足のレコードは推測で補完していません。[全件調査・本番反映記録](docs/guest-audit/2026-10-01.md)、[日時精度修正・復旧記録](docs/guest-timestamp-precision-repair-2026-09-30.md)、[機能の本番反映結果](docs/guest-production-rollout-2026-09-30.md) を参照してください。ゲスト機能の回帰テストは `npm run test:guests` で実行できます。

出演レコードの `guestInfo` は `isHikaruGuest` と `guestNames` を持ちます。`isHikaruGuest: null` は未確認、`true` は飯田ヒカルさん本人のゲスト出演、`false` は公式情報でゲストではないことを確認済みの状態です。告知にゲスト表記が見つからないだけでは `false` にせず、未確認のままにします。`guestNames` には飯田ヒカルさん以外のゲストだけを公式記載順で入れ、複数名は配列にします。公開UIでは本人が `true` の場合だけ「ゲスト出演」を表示し、`false` と `null` はどちらも本人の出演形態を表示しません。他ゲスト名がある場合は本人の区分にかかわらず「ゲスト：○○」を表示し、本人もゲストなら両方を表示します。DB・管理画面では確認済みと未確認の区別を維持します。

Antigravityが既存出演のゲスト情報を変更するときは、最初に対象IDの最新版を読み取り専用SQLで確認します。`a.*` で現在の全fieldsとversionを、`guest_info` でゲスト状態を、`source_links` で情報元とprimary・公開日時を確認できます。

```sql
BEGIN READ ONLY;
SELECT
  a.*,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'sourceId', asl.source_id,
      'evidenceKey', asl.evidence_key,
      'active', asl.active,
      'isPrimary', asl.is_primary,
      'canonicalUrl', si.canonical_url,
      'sourceName', sid.source_name,
      'externalItemId', sid.external_item_id,
      'precision', asl.published_at_precision,
      'publishedAt', asl.published_at,
      'publishedOn', asl.published_on
    ) ORDER BY asl.active DESC, asl.is_primary DESC, asl.evidence_key)
    FROM appearance_source_links AS asl
    JOIN source_items AS si ON si.id = asl.source_id
    LEFT JOIN source_identities AS sid ON sid.id = asl.source_identity_id
    WHERE asl.appearance_id = a.id
  ), '[]'::jsonb) AS source_links
FROM appearances AS a
WHERE a.id = 'antigravity-guest-example-0001';
COMMIT;
```

既存レコードの更新は `db:admin-import --input` に1件のJSONを渡します。`fields` は上の読み取り結果から全項目を引き継ぎ、`expectedVersion` も取得した値に固定します。公式の個別告知を `evidenceSources` に指定し、`publishedAt` は告知日時を使います。Xの告知はポストIDのSnowflakeから正確な日時を復元してください。ゲスト情報以外の更新では `guestInfo` を省略でき、省略時は既存値を保持します。ゲスト更新だけでprimary情報元や公開日時を変更しません。本人のゲスト出演と他ゲストは同時に登録できます。

通常の出演更新ではvisibility関連日時を更新せず、既存の出演日時と入力が同じ場合も日時カラムを更新しません。これにより、管理画面・CLIがJavaScriptのミリ秒精度で読み取ってもDBのマイクロ秒精度を保持します。`visibility_changed_at` は非公開化・復元時だけ変更します。精度の監査はJavaScriptの`Date`同士ではなく、読み取り専用SQLの`to_jsonb(a)`などでDBの生の値を比較してください。2026-10-01の補完再開後も全170件の出演・公開・visibility関連日時、主情報元、既存リンクが値・精度とも保持されていることを確認しました。

```json
{
  "kind": "appearance",
  "operation": "update",
  "appearanceId": "antigravity-guest-example-0001",
  "expectedVersion": 7,
  "fields": {
    "id": "antigravity-guest-example-0001",
    "startsAtPrecision": "date",
    "startsAt": null,
    "startsOn": "2026-10-01",
    "title": "番組名 第1回",
    "seriesId": "example-program",
    "eventGroupId": null,
    "eventTitle": null,
    "sessionLabel": null,
    "category": "ラジオ",
    "guestInfo": {
      "isHikaruGuest": true,
      "guestNames": ["ゲストA", "ゲストB"]
    }
  },
  "evidenceSources": [
    {
      "canonicalUrl": "https://example.com/news/individual-guest-announcement",
      "sourceName": "official:example",
      "externalItemId": "guest-announcement-2026-10-01",
      "evidenceKey": "guest-announcement",
      "precision": "exact",
      "publishedAt": "2026-09-30T12:00:00+09:00",
      "publishedOn": null
    }
  ]
}
```

まず読み取り専用dry-runを実行し、ID・version・ゲスト情報のbefore／after・根拠リンク・primary情報元と公開日時が保たれていることを確認します。出力された `inputHash` と同じJSONで確定します。例のID・告知URL・人物名・日時はすべて架空です。`.env.local` の接続先を確認してから実行してください。

```bash
npm run db:admin-import -- --input /tmp/appearance-guest-operation.json
npm run db:admin-import -- --input /tmp/appearance-guest-operation.json --apply --reviewed-hash "<dry-runのinputHash>"
```

競合で `superseded` になった場合は最新レコードと告知を再確認し、全fieldsと `expectedVersion` を更新してdry-runからやり直します。確定結果が通信障害で不明な場合は、同じJSON・同じhashで再試行すると冪等キーで結果を取得できます。複数公演は公演ごとに1件ずつ処理し、確定済みの分は保持されます。この機能導入では既存170件を一括調査・補完しません。

### 公開日時・情報元の確認・更新

既存出演の公開日時だけを改善するときは、1レコードずつ処理するsource専用CLIを使用します。音声作品も対象にでき、出演フィールドや他レコードは変更しません。入力JSONには `kind: "source"` と `append`、`replace`、`primary` のいずれかを指定します。`replace` は対象レコードの既存active source linksをすべて非活性にして、新しい情報元1件をprimaryにします。既存リンクを残す場合は `append` 後に、日時精度が `exact` または `date` のリンクを `primary` にします。

```bash
npm run db:admin-publication -- --input /tmp/publication-operation.json
npm run db:admin-publication -- --input /tmp/publication-operation.json --apply --reviewed-hash "<dry-runのinputHash>"
```

既定は読み取り専用dry-runで、対象のbefore／afterと正規化入力、`inputHash`を表示します。確定時は同じJSONと確認済みhashが必要です。同じ入力の再試行には内容由来の同じ冪等キーを使うため、確定後に別の情報元変更があっても二重反映しません。`unknown`の情報元は、現在のprimaryが`exact`または`date`の場合に限りsecondaryとして`append`できます。このsecondaryは公開ページの情報元リンクには加わりますが、primary由来の公開日時は変更しません。`unknown`での`replace`や`primary`指定は拒否します。既存のactive primaryと同じURL・evidence keyへの`append`も拒否するため、既存primaryを修正する場合は`replace`を使います。CLIの回帰テストは`npm run test:publication`で実行できます。

旧サンプルデータの削除は通常importと分離されています。実データの投入と表示を確認した後にdry-runし、既知のサンプル行だけが対象であることを確認してから実行します。

```bash
npm run db:remove-samples
npm run db:remove-samples -- --apply --confirm=remove-sample-appearances
```

DBスキーマは `src/db/schema.ts`、画面へ返すデータ取得処理は `src/server/appearances/repository.ts`、実データは `scripts/appearance-import-data.ts`、シリーズマスターは `scripts/appearance-series-data.ts` に置いています。将来の自動収集も `src/server/appearances/import-service.ts` の検証・upsert経路を共有できます。

Vercel Web AnalyticsとSpeed InsightsをRoot Layoutへ組み込み、ページビューとCore Web Vitalsを収集します。利用にはVercel Dashboard側でも各機能を有効にしてください。

この環境ではCSS処理時の内部ポート制限を避けるため、開発・ビルドともNext.js公式のWebpackオプションを使用します。

## 受付・販売情報

チケット申込・イベント受付・配信販売・受注物販・通常通販を、既存deadline機能と同じAdmin／CLI更新経路で扱います。開始だけ・終了だけ・両方未確認でも登録でき、日時精度・完売・再販・一次情報の追加に対応します。旧URL・CLI・旧JSONのhash・fingerprint・監査履歴は維持します。

v2入力例、Preview→hash→apply、Antigravity運用指示、追加migration 0014／0015、実データの読み取り専用・隔離検証、本番反映前の手順は [受付・販売情報の運用ガイド](docs/reception-sales.md) を参照してください。以下は互換性を維持する旧形式の締切情報です。

## 締切情報

チケットの受付やファン・同人サークル企画の申し込み締切を、出演情報とは独立して管理します。同じイベントの複数公演へ共通の締切を関連付けることも、出演情報がない企画を単独で登録することもできます。公開一覧とカレンダーは共通の検索条件を使い、締切の年は締切日で判定します。シリーズ選択の既存の優先順は維持します。

時刻が確認できた締切は日本時間で表示します。日付のみの場合は「時刻未確認」と表示し、翌日の日本時間0時に締切済みとなります。締切まで7暦日以内は「締切間近」、当日は「本日締切」です。管理者が指定する「受付終了」「中止」を優先し、日時未定は状態に応じて分類します。締切済みは一覧の目的別chipsで表示でき、カレンダーでは受付販売の表示を切り替えられます。

### マイグレーション

生成済みの `drizzle/0012_add_application_deadlines.sql` は締切テーブル、関連出演・情報元、提案・履歴を追加します。既存の出演情報を変更せず、締切データも投入しません。期限の精度、重複、情報元の所有関係、主情報元が必ず1件であることをDB制約で検証します。主情報元の制約トリガーもSQLに含まれるため、スキーマpushではなくこのマイグレーションを使ってください。再生成は不要です。

まずバックアップまたは分岐した隔離DBで、現在の適用履歴を確認してから適用してください。以下は接続先を明示し、`.env.local` を読み込まずに実行する例です。`DATABASE_URL_UNPOOLED` には適用対象の直接接続URLを指定します。

```bash
DATABASE_URL_UNPOOLED='<隔離した開発DBの直接接続URL>' node node_modules/drizzle-kit/bin.cjs migrate
npm run lint
npm run test:deadlines
npm run test:deadlines-db
npm run build
```

アプリの切り替えより先に0012を適用します。この実装作業では本番DBへの適用・データ投入は行いません。DBテストは全マイグレーションとAdmin writeをメモリ内Postgresで検証し、接続情報や外部DBを使用しません。

### 本番反映手順

本番反映を依頼された場合は、Vercelの本番プロジェクト・デプロイ・本番DB接続先を照合します。既存のマイグレーション履歴のhash・日時がGitの0000〜0011と一致し、0012だけが未適用であることを確認してください。次にNeonの本番ブランチから隔離ブランチを作り、直接接続で0012を適用します。適用前後で既存全テーブルの件数・内容の指紋が一致し、新しい締切テーブルが空であることを確認します。隔離DBだけでPreviewの読み取り専用性、登録・延長・受付終了・中止・非公開化・復元、関連出演、日時精度、競合検知、冪等な再実行を検証します。

隔離検証が通ったら、適用直前の復旧用Neonブランチを保持し、本番へ同じ0012をDrizzleのマイグレーターで適用します。既存データの件数・指紋、適用履歴、新しい制約トリガーと締切テーブルが空であることを再確認してから、アプリをデプロイします。接続情報をコマンド引数やログへ出さず、Git外の一時ファイルまたはプロセス環境で渡してください。

Vercelでは本番環境のビルドをまずドメイン切り替えなしで作り、`READY`と公開ページ・検索・カレンダー・Admin入口を確認してから本番へ昇格できます。

```bash
npx vercel deploy --prod --skip-domain --yes
npx vercel inspect <作成されたデプロイURL>
npx vercel promote <確認済みデプロイURL> --yes
```

切り替え後は本番ドメインでも公開画面・検索・カレンダーを確認します。締切データ投入を伴わないAdmin writeのスモークテストは読み取り専用Preview・入力ハッシュ不一致の拒否で行い、全操作の確定は隔離DBで検証します。締切の本番データ投入とAntigravityの締切運用開始は別作業です。失敗時は次工程へ進まず、原因とDB適用・デプロイの到達状態を記録してください。アプリを戻す場合も0012を逆適用して既存データを削除せず、保持した旧デプロイへの切り替えを優先します。

### 管理・インポート

通常の登録・更新は、稼働済みのAntigravity自動巡回で確認した告知を既存のAdmin writeフローへ渡して行います。Codex等も同じ締切インポートを利用できます。新しい巡回基盤は追加せず、出演情報の巡回・更新フローも変更しません。人間の管理画面は確認・監査・緊急時の修正を中心とし、手動操作は最終手段です。CLIと手動UIは共通のAdmin writeによる検証・確定、version競合検知、冪等性、提案・変更履歴を使い、Admin activation前の書き込みは拒否します。

通常操作には `--input <JSONファイル>` で `AdminDeadlineMutationInput` を1件指定します。配列ではありません。登録は `create`、編集・締切延長・受付終了・中止は `update`、非公開化は `hide`、復元は `restore` です。`update` は部分更新ではなく全fieldsとsourceを指定します。変更対象の最新レコードは既存の内部読み取り関数から取得できます（以下のIDを対象のIDに置き換えてください）。

```bash
NODE_OPTIONS=--conditions=react-server npx dotenv -e .env.local -- node --import tsx -e 'import("./src/server/deadlines/record-reader.ts").then(async ({ readDeadlineRecords }) => console.log(JSON.stringify((await readDeadlineRecords()).find(row => row.id === "event-ticket-first-entry"), null, 2)))'
```

登録用JSONの例です。個別の告知URL・確認済みの告知日時を指定し、Xの場合はポストIDから正確な告知日時を復元します。ファン企画は `projectType: "fan"` にしてください。日時精度は `exact` / `date` / `unknown`、受付状態は `scheduled` / `closed` / `cancelled` です。

```json
{
  "kind": "deadline",
  "operation": "create",
  "expectedVersion": null,
  "fields": {
    "id": "event-ticket-first-entry",
    "label": "先行抽選",
    "projectTitle": "対象企画名",
    "organizer": "主催者名",
    "projectType": "official",
    "seriesId": null,
    "deadlinePrecision": "exact",
    "deadlineAt": "2026-10-10T23:59:00+09:00",
    "deadlineOn": null,
    "applicationUrl": "https://example.com/tickets/event",
    "note": null,
    "state": "scheduled",
    "appearanceIds": []
  },
  "source": {
    "canonicalUrl": "https://example.com/news/event-entry",
    "sourceName": "official:organizer",
    "externalItemId": "event-entry",
    "evidenceKey": "first-entry",
    "precision": "exact",
    "publishedAt": "2026-09-30T12:00:00+09:00",
    "publishedOn": null
  }
}
```

更新時は `operation: "update"` と `deadlineId` を指定し、`expectedVersion` に取得したversionを固定して入れ、既存の全fields・sourceを引き継いで必要な箇所だけ変えます。締切延長は既存IDの日時を変更し、早期受付終了は `state: "closed"`、中止は `state: "cancelled"` とし、その根拠となる告知をsourceに指定します。日付だけ判明している場合は `deadlinePrecision: "date"`・`deadlineOn` を使い、`deadlineAt` はnullにします。不明な時刻は推測しません。非公開化・復元にはfields/sourceを付けず、以下の形を使います（復元は `operation: "restore"`）。

```json
{ "kind": "deadline", "operation": "hide", "deadlineId": "event-ticket-first-entry", "expectedVersion": 3 }
```

操作JSONはGit外の一時ファイルに置き、完了後に削除してください。以下のコマンドは `.env.local` を読み込むため、接続先を確認してから実行します。まず重複を照合し、既定の読み取り専用dry-runで対象ID・現在/期待version・before/after（日時・状態・公開状態・関連出演・主情報元と全active情報元）・正規化済み入力をエージェント自身が確認します。更新ではactive情報元を指定sourceで置き換え、旧リンクは履歴として保持します。出力の `inputHash` を確定コマンドへ渡します。

```bash
npm run check:deadline-duplicate -- "企画名・受付名・個別告知URL・締切ID"
npm run db:admin-import-deadlines -- --input /tmp/deadline-operation.json
# エージェント自身が上記Previewを確認し、出力されたinputHashで確定する
deadline_reviewed_hash='ここに出力されたinputHashの64桁を貼り付ける'
npm run db:admin-import-deadlines -- --input /tmp/deadline-operation.json --apply --reviewed-hash "$deadline_reviewed_hash"
```

`--reviewed-hash` はエージェントによる確認済み入力の識別であり、人間承認を必須にしません。JSON確定にはこのハッシュが必須で、正規化後の入力と一致しなければDB処理前に拒否します。内容を変更したら再度dry-runから確認します。確定処理は共通Admin write内で再検証するため、Preview後のversion競合は `superseded`、検証不成立は `rejected` として履歴に残し、変更を反映せず終了コード1で停止します。最新レコード・告知を再照合してやり直してください。接続障害で確定結果が不明な場合は、同じJSON・同じハッシュで確定を再試行します。承認済み操作は `replayed: true` と保存済み結果を返し、現在のversionが進んでいても二重反映しません。複数の操作は1件ずつ行い、確定済みの分は残ります。

巡回で見つからなくなっただけでは非公開化しません。非公開化・復元は根拠を確認した明示操作に限定し、非公開レコードを自動復元しません。手動UIのセッション・Origin検証・署名付きPreviewは従来どおりです。

Git管理の `scripts/deadline-import-data.ts` の初期配列は空です。確認済みのデータだけを追加し、ファン企画は `projectType: "fan"` と明示してください。日付・日時が不明な場合は推測せず、`deadlinePrecision` を `date` または `unknown` にします。同じ企画・受付の締切延長は既存IDを維持し、別の受付段階には受付名とevidence keyを区別します。

従来のデータ配列インポートはそのまま利用できます。引数なしは読み取り専用dry-runで、`--apply` の場合だけ確定します。JSON専用の `--reviewed-hash` は不要です。対象公演・シリーズ・情報元identityも全件事前検証し、非公開の締切はスキップします。競合で途中停止したら再度dry-runで差分を確認して続行してください。

```bash
npm run check:deadline-duplicate -- "企画名・受付段階・告知URL・出演ID"
npm run db:admin-import-deadlines
npm run db:admin-import-deadlines -- --apply
```

## 補助巡回（GitHub Actions・手動実行）

定期的な情報収集・更新はAntigravityに一本化しています。GitHub Actionsの定期実行は停止し、Actions画面の `Appearance Backup Patrol` → `Run workflow` から必要なときだけ補助巡回を実行できます。`dry_run=true` は取得・DB照合のみ、`false` は未登録の情報を管理画面の `/admin/proposals` に `origin=collector`、`status=pending` の調査候補として保存し、Discordへ通知します。Actionsは公開出演情報を追加・更新したり、Gitへ自動コミットしたりしません。

巡回先は所属事務所プロフィール、音泉「カンナヒカル（仮）」の番組一覧、公式YouTubeの「ヒカROOM」「ぴかのの定理」、直近7日のGoogle Newsです。番組ページ全体に埋め込まれた別番組データは使用しません。YouTubeのAtomフィードが404・5xx・タイムアウト等で取得できない場合は、公式チャンネルの動画・ライブ一覧と個別動画ページへ切り替えます。チャンネルID、動画ID、番組回数、タイムゾーン付きの公開日時を検証し、最新15回までを候補にします。フィードや動画ページの公開日時は動画の公開日時として保存し、放送開始日時には流用しません。プロフィールやニュースは発表の裏取りが必要な候補であり、新規出演・公式発表と断定しません。巡回元のURLは調査用リンクとして保持し、出演情報の一次情報元には指定しません。Antigravityでの反映時には公式の個別告知URLと発表日時を確認し、XポストはSnowflake IDから正確な日時を復元します。

同じ候補の送信済み状態はDBに保存します。通知はDiscordの件数・文字数制限に合わせて全件分割し、失敗した後の実行では未送信分だけを再送します。Antigravityが登録した情報は送信直前にも最新DBと再照合し、該当候補を `superseded` にします。初回は過去の未登録プロフィール情報も調査候補に含まれます。Discordの送信成功直後からDBへの送信済み保存までの間にプロセスが終了した場合は、そのバッチが再送されることがあります。

必要なRepository Secretsは `DATABASE_URL` と `DISCORD_WEBHOOK_URL` です。DBは既存のAdmin activationが完了している必要があります。追加のマイグレーションは不要です。各取得処理にはタイムアウトと限定的な再試行を設定し、取得・通知・DB保存の失敗はActionsの失敗として扱います。HTTP取得に失敗した場合は、秘密情報や応答本文を含めずステータスコード等を記録します。成功した巡回先の候補は残します。Actionsの同時実行制御とDBロックで補助巡回同士の重複起動を防ぎます。

GitHubの共有ランナーでは、YouTubeがログイン要求を返して公開メタデータも取得できない場合や、所属事務所へのHTTPS接続がタイムアウトする場合があります。これらは取得失敗として記録し、確認済みの情報がないまま「更新なし」とは扱いません。安定運用には、取得元へのアクセスが可能な実行環境や公式APIの利用が必要です。

```bash
# 取得・照合のみ。DB保存・通知なし
npm run patrol:dry-run

# 補助巡回を実行。候補と送信済み状態をDBへ保存しDiscordへ通知
npm run patrol

# ネットワーク・DB接続を使わない回帰テスト
npm run test:patrol
```

ローカルでは `.env.local` を読み込みます。dry-runはDB設定がない場合に限りGit管理データとの比較に切り替わり、その比較元を明記します。実行結果はGit管理外の `.patrol-output/report.json`（`PATROL_REPORT_PATH` で変更可）へ出力し、ActionsではジョブのSummaryと14日保存のArtifactから確認できます。Antigravityの起動状態そのものは検知せず、常にDB上の登録結果を基準に補助します。

### 公開DB取得キャッシュ

公開3ページで公開取得結果だけを共有するNext.js 16の`use cache: remote`を導入しています。設定欠落時は無効で、Admin・Preview・時刻依存の表示判定はキャッシュしません。2026-10-01にOFFで回帰確認後、本番で有効化しました（[本番反映記録](docs/public-db-cache-production-rollout-2026-10-01.md)）。Productionの設定、Antigravity／CLIの確定後通知、緊急迂回、検証手順は[公開DB取得キャッシュ](docs/public-db-cache.md)を参照してください。`npm run test:public-cache`で失効の安全性を、build後の`npm run test:public-cache-runtime`でローカルの実Nextサーバーによる共有・SQL削減を確認できます。
