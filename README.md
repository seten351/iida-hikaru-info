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
npm run build
```

出演情報はNeon Postgresから取得します。ページはリクエスト時に現在時刻を取得し、日本時間で予定と履歴を分類します。

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

旧サンプルデータの削除は通常importと分離されています。実データの投入と表示を確認した後にdry-runし、既知のサンプル行だけが対象であることを確認してから実行します。

```bash
npm run db:remove-samples
npm run db:remove-samples -- --apply --confirm=remove-sample-appearances
```

DBスキーマは `src/db/schema.ts`、画面へ返すデータ取得処理は `src/server/appearances/repository.ts`、実データは `scripts/appearance-import-data.ts`、シリーズマスターは `scripts/appearance-series-data.ts` に置いています。将来の自動収集も `src/server/appearances/import-service.ts` の検証・upsert経路を共有できます。

Vercel Web AnalyticsとSpeed InsightsをRoot Layoutへ組み込み、ページビューとCore Web Vitalsを収集します。利用にはVercel Dashboard側でも各機能を有効にしてください。

この環境ではCSS処理時の内部ポート制限を避けるため、開発・ビルドともNext.js公式のWebpackオプションを使用します。

## 締切情報

チケットの受付やファン・同人サークル企画の申し込み締切を、出演情報とは独立して管理します。同じイベントの複数公演へ共通の締切を関連付けることも、出演情報がない企画を単独で登録することもできます。公開一覧とカレンダーは共通の検索条件を使い、締切の年は締切日で判定します。シリーズ選択の既存の優先順は維持します。

時刻が確認できた締切は日本時間で表示します。日付のみの場合は「時刻未確認」と表示し、翌日の日本時間0時に締切済みとなります。締切まで7暦日以内は「締切間近」、当日は「本日締切」です。管理者が指定する「受付終了」「中止」を優先し、日時未定は別枠に表示します。締切済みは一覧のチェックで表示でき、カレンダーでは締切の表示を切り替えられます。

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
