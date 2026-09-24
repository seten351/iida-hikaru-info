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

## 補助巡回（GitHub Actions）

主担当はAntigravityの自動実行です。GitHub Actionsは二重確認と、Antigravityを開いていない間の情報収集を補います。毎日9:00・15:00・22:00（日本時間）に最新DBと照合し、未登録の情報だけを管理画面の `/admin/proposals` に `origin=collector`、`status=pending` の調査候補として保存・Discord通知します。Actionsは公開出演情報を追加・更新したり、Gitへ自動コミットしたりしません。

巡回先は所属事務所プロフィール、音泉「カンナヒカル（仮）」の番組一覧、公式YouTubeの「ヒカROOM」「ぴかのの定理」、直近7日のGoogle Newsです。番組ページ全体に埋め込まれた別番組データは使用しません。YouTubeフィードの公開日時は動画の公開日時として保存し、放送開始日時には流用しません。プロフィールやニュースは発表の裏取りが必要な候補であり、新規出演・公式発表と断定しません。巡回元のURLは調査用リンクとして保持し、出演情報の一次情報元には指定しません。Antigravityでの反映時には公式の個別告知URLと発表日時を確認し、XポストはSnowflake IDから正確な日時を復元します。

同じ候補の送信済み状態はDBに保存します。通知はDiscordの件数・文字数制限に合わせて全件分割し、失敗した後の実行では未送信分だけを再送します。Antigravityが登録した情報は送信直前にも最新DBと再照合し、該当候補を `superseded` にします。初回は過去の未登録プロフィール情報も調査候補に含まれます。Discordの送信成功直後からDBへの送信済み保存までの間にプロセスが終了した場合は、そのバッチが再送されることがあります。

必要なRepository Secretsは `DATABASE_URL` と `DISCORD_WEBHOOK_URL` です。DBは既存のAdmin activationが完了している必要があります。追加のマイグレーションは不要です。各取得処理にはタイムアウトと限定的な再試行を設定し、取得・通知・DB保存の失敗はActionsの失敗として扱います。成功した巡回先の候補は残します。Actionsの同時実行制御とDBロックで補助巡回同士の重複起動を防ぎます。

```bash
# 取得・照合のみ。DB保存・通知なし
npm run patrol:dry-run

# 補助巡回を実行。候補と送信済み状態をDBへ保存しDiscordへ通知
npm run patrol

# ネットワーク・DB接続を使わない回帰テスト
npm run test:patrol
```

ローカルでは `.env.local` を読み込みます。dry-runはDB設定がない場合に限りGit管理データとの比較に切り替わり、その比較元を明記します。実行結果はGit管理外の `.patrol-output/report.json`（`PATROL_REPORT_PATH` で変更可）へ出力し、ActionsではジョブのSummaryと14日保存のArtifactから確認できます。Antigravityの起動状態そのものは検知せず、常にDB上の登録結果を基準に補助します。

GitHubの定期実行は遅延することがあり、公開リポジトリは60日間活動がないとスケジュールが無効化されます。運用時は[GitHub Actionsのschedule仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)も確認してください。
