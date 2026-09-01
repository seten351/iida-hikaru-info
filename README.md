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

出演情報はGit管理された `scripts/appearance-import-data.ts` から安全に投入します。公式情報元URL、公式発表日時、情報元内の識別子は必須です。

importは既定でdry-runとなり、追加・更新・変更なしの差分だけを表示します。確認後に `--apply` を付けた場合だけ書き込みます。通常importはレコードを削除しません。

```bash
npm run db:import
npm run db:import -- --apply
npm run db:verify
```

旧サンプルデータの削除は通常importと分離されています。実データの投入と表示を確認した後にdry-runし、既知のサンプル行だけが対象であることを確認してから実行します。

```bash
npm run db:remove-samples
npm run db:remove-samples -- --apply --confirm=remove-sample-appearances
```

DBスキーマは `src/db/schema.ts`、画面へ返すデータ取得処理は `src/server/appearances/repository.ts`、実データは `scripts/appearance-import-data.ts` に置いています。将来の自動収集も `src/server/appearances/import-service.ts` の検証・upsert経路を共有できます。

Vercel Web AnalyticsとSpeed InsightsをRoot Layoutへ組み込み、ページビューとCore Web Vitalsを収集します。利用にはVercel Dashboard側でも各機能を有効にしてください。

この環境ではCSS処理時の内部ポート制限を避けるため、開発・ビルドともNext.js公式のWebpackオプションを使用します。
