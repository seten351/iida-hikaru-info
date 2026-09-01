# 飯田ヒカル 出演情報

飯田ヒカルさんの新着情報、今後の出演予定、過去の出演履歴をまとめるWebサイトのローカル最小版です。

現在の掲載内容はすべて表示確認用の架空のサンプルデータで、実際の出演情報ではありません。

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

表示確認用のサンプルデータ投入と内容検証も、それぞれ明示的に実行します。seedは同じIDのレコードを更新するため、繰り返し実行できます。

```bash
npm run db:seed
npm run db:verify
```

DBスキーマは`src/db/schema.ts`、画面へ返すデータ取得処理は`src/server/appearances/repository.ts`、サンプルデータは`scripts/appearance-seed-data.ts`に置いています。

この環境ではCSS処理時の内部ポート制限を避けるため、開発・ビルドともNext.js公式のWebpackオプションを使用します。
