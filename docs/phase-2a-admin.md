# Phase 2A Admin運用メモ

Phase 2Aはread-only Adminであり、appearance・proposal・source・series・revisionの内容確認だけを提供する。content mutation、preview/confirm、proposal承認、Admin activationは実装していない。`ADMIN_WRITE_ENABLED=true`でも、Phase 2Aの画面にcontent書き込み操作は現れない。

## 環境変数

すべて環境ごとに明示設定する。

- `ADMIN_UI_ENABLED`: `true`でAdmin境界を有効化する。未設定または`false`では`/admin`を404にする。
- `ADMIN_WRITE_ENABLED`: Phase 2Aでは`false`。将来のcontent mutation用flagとして厳密に検証する。
- `ADMIN_PASSWORD_HASH`: `npm run admin:password-verifier`が出力するscrypt verifier。平文passwordは設定しない。
- `ADMIN_SESSION_SECRET`: 32 byte以上のランダム値。
- `ADMIN_RATE_LIMIT_SECRET`: IPをHMAC化するための、32 byte以上かつsession secretとは別のランダム値。
- `APP_ORIGIN`: scheme・host・portだけからなる単一のorigin。末尾slash、path、query、fragmentは不可。ProductionではHTTPS必須。

`APP_ORIGIN`はProduction、Preview/rehearsal、Developmentでそれぞれ実際のoriginを1つだけ設定する。`VERCEL_URL`などから追加originを自動許可しない。

Admin用secretの不足・形式不正はAdmin境界だけをfail closedにする。`ADMIN_UI_ENABLED=false`ならAdmin用secretを要求せず、公開サイトのbuild・起動・表示を妨げない。

## Password verifier

対話TTYでpasswordを2回入力する。コマンドライン引数ではpasswordを受け付けず、入力内容をechoしない。

```bash
npm run admin:password-verifier
```

出力された`scrypt$v=1$...`の1行だけを`ADMIN_PASSWORD_HASH`へ保存する。scrypt parametersは`N=131072, r=8, p=1`、salt 16 byte、derived key 32 byteで固定し、異なる形式や低コストparameterを拒否する。

## Migrationと検証

Production DBへ直接適用せず、Production由来Neon branchで行う。migrationにはdirect URL、アプリとverifyにはpooled URLを使う。

```bash
DATABASE_URL_UNPOOLED="$(neon connection-string <VERIFY_BRANCH> --project-id <PROJECT_ID>)" npx drizzle-kit migrate
DATABASE_URL="$(neon connection-string <VERIFY_BRANCH> --project-id <PROJECT_ID> --pooled)" npm run db:verify
DATABASE_URL="$(neon connection-string <VERIFY_BRANCH> --project-id <PROJECT_ID> --pooled)" PHASE_2A_TEST_DATABASE=1 npm run verify:phase2a
npm run test:phase2a
```

Production rolloutは既存Planの順序を維持し、Phase 2Aの検証だけでAdmin activationやProduction migrationへ進めない。
