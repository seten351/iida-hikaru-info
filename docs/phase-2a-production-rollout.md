# Phase 2A read-only Admin Production rollout runbook

## 目的と適用範囲

このrunbookは、`39fc5fb`と`0007_sad_blackheart.sql`をProductionへread-onlyで導入するための手順である。

既存Planおよび`docs/phase-1-production-rollout.md`のPhase 1 rollout順序は変更せず、その完了状態を前提としてPhase 2Aだけを追加導入する。

Phase 2Aで有効にするのは、Admin loginと次の閲覧画面だけとする。

- proposal
- appearance
- source
- series
- appearance / series revision
- 未実装であることを示すrun履歴画面

次はこのrolloutの対象外であり、実行・代替実装・手動SQLによる再現を禁止する。

- content mutation
- preview / confirm
- proposal承認・却下
- Admin activation
- `content_management_state.content_mode`の変更
- `admin_activated_at`または`legacy_import_locked_at`の設定

Production rollout完了後も`contentMode=bootstrap`、`ADMIN_WRITE_ENABLED=false`を維持する。login rate limitのための`admin_auth_attempts`への一時的な書き込みだけはPhase 2Aの想定内であり、content writeではない。

## 2026-09-03時点の前提

- 依頼時申告のVercel Production Current: `82b3bd9`
- 依頼時申告のProduction DB: migration `0006`まで適用済み
- Production data: 120 appearances / 97 derived cards / 31 series
- local `main`: `39fc5fb`
- `origin/main`: `a1f398f`
- commit系列: `82b3bd9 -> a1f398f -> 39fc5fb`
- `a1f398f`はPhase 1 runbook文書だけのcommit
- Vercel project: `iida-hikaru-info` (`prj_8JpSJUf6supvOrWMncRxnO2IoYSg`)
- Neon project: `long-silence-57673276`
- Neon Production branch: `main`

rollout当日は必ず実状態を再取得する。Vercel Current、`origin/main`、Production migration、件数のいずれかが上記と異なる場合、このrunbookのSHAをそのまま適用せず停止して差分を再評価する。

前回の`verify-phase2a-20260902T124300Z` branchは再利用しない。Productionの最新時点からfresh rehearsalを作る。

## 実差分から確認した適用順序

`39fc5fb^..39fc5fb`は38 files、4070 insertions / 1 deletionで、アプリとmigration `0007`を同じcommitに含む。`0007`のjournal値は`1788353150633`である。

### `0007`が行う変更

- `admin_auth_purpose` enumを追加
- `series_revision_operation` enumを追加
- `admin_auth_attempts` tableとindexを追加
- `appearance_series_revisions` table、PK、FK、check constraintsを追加
- `appearance_proposals.review_note`をnullableで追加
- `appearance_proposals.idempotency_key`をnullableで追加し、非NULL値だけのunique indexを追加
- `appearance_series.version integer default 1 not null`と正数checkを追加
- `proposal_source_links.is_primary boolean default false not null`を追加
- 既存31 seriesについてversion 1の初期snapshotを`appearance_series_revisions`へinsert

`0007`は既存appearance、appearance source link、appearance revision、visibility、legacy mirror、`content_management_state`を更新しない。tableやcolumnの削除、rename、型変更もない。

### compatibility matrix

| 稼働コード | DB | flags | 判定 |
| --- | --- | --- | --- |
| `82b3bd9` | `0006` | Adminなし | 現在のPhase 1C正常状態 |
| `82b3bd9` | `0007` | Adminなし | 安全。`0007`は旧コードが参照しないadditive schema |
| `39fc5fb` | `0006` | UI=false / write=false | 公開サイトだけなら安全。Proxyが`/admin`を404にし、Admin secretや新tableを要求しない |
| `39fc5fb` | `0006` | UI=true | 禁止。login rate limitとseries readが`0007`のtableを必要とする |
| `39fc5fb` | `0007` | UI=false / write=false | 最初のProduction deployment状態 |
| `39fc5fb` | `0007` | UI=true / write=false | 今回の最終状態 |
| `39fc5fb` | `0007` | write=true | 禁止。Phase 2A rollout対象外 |

したがって、絶対順序は次とする。

1. fresh rehearsalを完了する。
2. `39fc5fb`をProduction env・両flag無効でstaged deployし、公開表示を確認する。
3. Production退避branchを作る。
4. Productionへ`0007`を適用してread-only post-checkを行う。
5. 両flag無効の`39fc5fb`をProduction Currentへ切り替える。
6. 公開サイトと`/admin`の404を確認する。
7. `origin/main`を`39fc5fb`へfast-forwardする。
8. push由来deploymentも両flag無効で正常なことを確認する。
9. 同じ`39fc5fb`をUI=true / write=falseで新規deployし、Production Currentへ切り替える。

`0007`より先にUIを有効化してはならない。Productionでdown migrationは行わない。

## 絶対ルール

1. operatorを1名に固定し、並行deploy、手動DB変更、`db:import --apply`を停止する。
2. migrationは`39fc5fb`の独立checkoutから、direct URLで実行する。
3. アプリ、DB verify、dry-runはpooled URLを使う。
4. `verify:phase1c`と`verify:phase2a`はDB write testを含むため、Production branchへ向けない。
5. Productionでは`verify-appearances.ts`、`import-appearances.ts`のdry-run、read-only SQLだけを使う。
6. connection string、password、verifier、session secret、rate-limit secretをrolloutログやshell historyへ残さない。
7. `APP_ORIGIN`は環境ごとに1つを明示し、`VERCEL_URL`やPreview URLを自動追加しない。
8. Productionの`APP_ORIGIN`はHTTPSの本番originだけとし、末尾slash、path、query、fragmentを付けない。
9. rehearsalとProductionでAdmin password / session secret / rate-limit secretを共有しない。
10. `ADMIN_WRITE_ENABLED`が`true`、または`contentMode`が`bootstrap`以外なら即時停止する。
11. migrationやdeployの失敗時にbackup branchから自動restoreしない。
12. force-push、history rewrite、DB down migrationを行わない。

## 事前準備

### 1. exact checkout

既存worktreeを汚さず、`39fc5fb`をdetached worktreeへ固定する。

```bash
git fetch origin
git worktree add --detach /tmp/iida-phase2a-39fc5fb 39fc5fb
cd /tmp/iida-phase2a-39fc5fb
npm ci
test "$(git rev-parse HEAD)" = "39fc5fbaf5b5e59be94e39bdf0e2c30e8113a4e6"
git status --short
```

`git status --short`が空でなければ停止する。Vercel CLIはチームで承認したversionへ固定し、以下では`npx vercel@<PINNED_VERSION>`と表記する。

### 2. local gate

指定順で実行する。

```bash
npm run lint
npm run build
npx tsc --noEmit
npm run verify:filters
npm run test:phase2a
```

1つでも失敗した場合はfresh rehearsalへ進まない。

### 3. secret準備

安全な対話TTYでProduction用verifierを作成し、出力だけをpassword managerとVercel sensitive envへ保存する。平文passwordを引数、`.env`、チャット、rolloutログへ書かない。

```bash
npm run admin:password-verifier
```

別々の32 byte以上のランダム値を`ADMIN_SESSION_SECRET`と`ADMIN_RATE_LIMIT_SECRET`へ用意する。`ADMIN_PASSWORD_HASH`は次の固定形式であることだけを確認し、値は記録しない。

```text
scrypt$v=1$N=131072$r=8,p=1$<salt>$<derived-key>
```

Production envとして次の6 keyを用意する。

| key | 最初の値 | 最終値 |
| --- | --- | --- |
| `ADMIN_UI_ENABLED` | `false` | `true` |
| `ADMIN_WRITE_ENABLED` | `false` | `false` |
| `APP_ORIGIN` | Productionのexact HTTPS origin | 同じ値 |
| `ADMIN_PASSWORD_HASH` | Production専用scrypt verifier | 同じ値 |
| `ADMIN_SESSION_SECRET` | Production専用secret | 同じ値 |
| `ADMIN_RATE_LIMIT_SECRET` | Production専用secret | 同じ値 |

env変更は既存deploymentへ遡及しない前提で、変更後は必ず新しいdeploymentを作る。

## fresh rehearsal

### R1. Production baselineを記録

Production `main`へread-onlyで接続し、次を記録する。

```sql
select
  (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
  (select max(created_at)::bigint from drizzle.__drizzle_migrations) as latest_migration_at,
  (select count(*)::int from appearances) as appearances,
  (select count(*)::int from appearance_series) as series,
  (select count(*)::int from appearance_revisions) as appearance_revisions,
  (select count(*)::int from appearance_proposals) as proposals,
  (select content_mode from content_management_state where id = 'singleton') as content_mode,
  (select admin_activated_at from content_management_state where id = 'singleton') as admin_activated_at,
  (select legacy_import_locked_at from content_management_state where id = 'singleton') as legacy_import_locked_at;
```

開始期待値:

- migrations = 7 (`0000`から`0006`)
- latest migration = `1788331209018`
- appearances = 120
- series = 31
- appearance revisions = 120
- content mode = `bootstrap`
- activation / legacy lock = NULL

proposal件数は値を記録する。依頼時の検証branchでは0件だったが、Production実値が異なる場合は自動的に削除せず、正当な変化か確認する。

続けてProduction-safe verifyを行う。`0007`適用前のこのbaseline検証は、DB schema `0006`と対応するPhase 1Cの`82b3bd9` checkoutから行う。`39fc5fb`のimport plannerは`0007`で追加される`appearance_series.version`を読むため、`0007`適用前のDB検証に使用してはならない。

```bash
git worktree add --detach /tmp/iida-phase1c-82b3bd9 82b3bd9
cd /tmp/iida-phase1c-82b3bd9
npm ci
test "$(git rev-parse HEAD)" = "82b3bd9"
DATABASE_URL="$(neon connection-string main --project-id long-silence-57673276 --pooled)" npx tsx scripts/verify-appearances.ts
DATABASE_URL="$(neon connection-string main --project-id long-silence-57673276 --pooled)" npx tsx scripts/import-appearances.ts
```

期待値は120 appearances / 97 cards / 31 series、importは0 insert / 0 update / 120 unchangedである。`--apply`を付けない。

### R2. fresh Neon branchを作る

baseline取得直後のProduction `main`から、read-write compute付き・48時間程度のTTLで作る。

```bash
neon branches create \
  --project-id long-silence-57673276 \
  --parent main \
  --name rehearsal-phase2a-<UTC_TIMESTAMP> \
  --expires-at <ISO8601> \
  --no-secrets \
  --output json
```

branch ID、parent ID、parent LSN、parent timestamp、expiryをrolloutログへ保存する。connection stringは保存しない。

### R3. branchへ`0007`を適用する

`39fc5fb` checkoutからdirect URLで実行する。

```bash
DATABASE_URL_UNPOOLED="$(neon connection-string <REHEARSAL_BRANCH> --project-id long-silence-57673276)" npx drizzle-kit migrate
```

hostnameに`-pooler`がないことを、値をログへ出さない方法で確認する。適用後、同じcommandを再実行し、未適用migrationが残っていないことを確認する。

### R4. branch test gate

書き込みテストはrehearsal branchだけで実行する。

`39fc5fb`を使うDB検証は、R3で`0007`の適用と再実行確認が成功した後だけに実行する。

```bash
DATABASE_URL="$(neon connection-string <REHEARSAL_BRANCH> --project-id long-silence-57673276 --pooled)" PHASE_1C_TEST_DATABASE=1 npm run verify:phase1c
DATABASE_URL="$(neon connection-string <REHEARSAL_BRANCH> --project-id long-silence-57673276 --pooled)" PHASE_2A_TEST_DATABASE=1 npm run verify:phase2a
DATABASE_URL="$(neon connection-string <REHEARSAL_BRANCH> --project-id long-silence-57673276 --pooled)" npx tsx scripts/verify-appearances.ts
DATABASE_URL="$(neon connection-string <REHEARSAL_BRANCH> --project-id long-silence-57673276 --pooled)" npx tsx scripts/import-appearances.ts
```

期待値:

- 120 appearances / 97 cards / 31 series
- appearance revisions = 120
- series revisions = 31
- series versionは全件1
- importは120 unchanged
- rate-limit test rowはテスト終了時に0件
- content mode = `bootstrap`
- activation / legacy lock = NULL

### R5. Vercel rehearsalを両flag無効でdeployする

Productionと分離された一時Git branchを`39fc5fb`に作る。これはrehearsal用pushであり、`main`を更新しない。

```bash
git branch rehearsal/phase2a-<UTC_TIMESTAMP> 39fc5fb
git push origin rehearsal/phase2a-<UTC_TIMESTAMP>
```

Vercel Preview environmentをこのGit branchだけにscopeし、次を設定する。

- `DATABASE_URL`: fresh Neon rehearsal branchのpooled URL
- `ADMIN_UI_ENABLED=false`
- `ADMIN_WRITE_ENABLED=false`
- Admin secretはProductionと別のrehearsal専用値

最初のPreview deploymentを待ち、READYであることとstableなGit branch aliasを記録する。この時点では`APP_ORIGIN`が未設定でもよい。UI=falseならAdmin configを読まない。

確認項目:

- `/`が200で通常表示される
- 120 appearances / 97 cards相当の表示が変わらない
- `/admin`、`/admin/login`、`/admin/appearances`が404
- public routeに新しい認証要求や5xxがない
- Vercel runtime logに新規errorがない
- `ADMIN_WRITE_ENABLED=false`
- `contentMode=bootstrap`

ここで公開サイトに差異があれば停止する。UIを有効化しない。

### R6. rehearsalのUIだけを有効化する

stableなGit branch aliasを、schemeとhostだけのexact HTTPS originとして`APP_ORIGIN`へ設定する。unique deployment URL、Production origin、別Preview originを追加しない。

```text
APP_ORIGIN=https://<STABLE_REHEARSAL_BRANCH_ALIAS>
ADMIN_UI_ENABLED=true
ADMIN_WRITE_ENABLED=false
```

env変更後、同じ`39fc5fb`を再deployする。別commitを混ぜない。

確認項目:

1. `/admin/login`が200で、意味のあるlogin formが表示される。
2. 未認証のprotected routeが`/admin/login`へredirectされる。
3. rehearsal用passwordでloginできる。
4. 誤ったpasswordはgeneric errorとなり、secretや内部例外を表示しない。
5. Cookieは`HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=43200`である。
6. proposal / appearance / source / series / revision / runsをread-onlyで閲覧できる。
7. appearanceは120件、seriesは31件、appearance detailにrevision、series detailに初期revisionがある。
8. add / edit / approve / reject / hide / restore / activateの操作が存在しない。
9. 画面表示はREAD-ONLYで、`ADMIN_WRITE_ENABLED=false`である。
10. public `/`とDB verifyは120 appearances / 97 cards / 31 seriesのままである。
11. `contentMode=bootstrap`、activation / legacy lockがNULLのままである。

Admin GET（HTML）とRSC responseでは、次を確認する。いずれも`private`と`no-store`を必須とする。

```text
Cache-Control: private, no-store, max-age=0, must-revalidate
CDN-Cache-Control: no-store
Vercel-CDN-Cache-Control: no-store
Pragma: no-cache
Expires: 0
```

Vercelは`Vercel-CDN-Cache-Control`を外部responseから消費する場合があるため、client-visibleな`Cache-Control`と`CDN-Cache-Control`のno-storeを判定の正本とする。`Vercel-CDN-Cache-Control`がechoされないことだけでは停止しない。

login / logout / Server Action POSTは、`Cache-Control`に`no-store`があることを必須とする。Next.jsのServer Action redirect responseでは`private`が欠落し得るため、POSTの`private`欠落だけでは停止しない。

GET/RSCとPOSTの区別なく、`public`、`s-maxage`、正数または不正な`max-age`、`immutable`、`stale-*`など共有または再利用可能なcache directiveが付く場合は停止する。login、protected一覧、detail、redirect、error responseを対象にし、Vercel Cache headerがHITになっていないことも確認する。

origin検証は次で確認する。

- stable rehearsal aliasからのloginは成功する。
- unique deployment URLまたは別Preview originからのlogin submitは拒否される。
- `APP_ORIGIN`に複数値、wildcard、自動生成originを設定していない。
- `npm run test:phase2a`のorigin / host mismatch testが成功している。

scrypt検証は次で確認する。

- `ADMIN_PASSWORD_HASH`だけを設定し、平文`ADMIN_PASSWORD`を設定していない。
- verifierは`N=131072, r=8, p=1`の固定形式である。
- security testの正しいpassword / 誤ったpassword / 低cost verifier拒否が成功している。
- 実loginが成功する。

fresh rehearsalの全項目が成功するまでProduction rolloutを開始しない。

## Production rollout

### P0. 排他とVercel環境変数

rollout windowを宣言し、次を停止する。

- 別のVercel Production deploy
- `db:import --apply`
- backfill
- 手動DB更新
- CollectorまたはAdmin相当のwriter

Vercel Production scopeへ6 keyを設定し、値を表示せずkeyとscopeだけを確認する。最初は必ず次の状態にする。

```text
ADMIN_UI_ENABLED=false
ADMIN_WRITE_ENABLED=false
APP_ORIGIN=https://<PRODUCTION_HOST>
```

Admin secretは有効なProduction専用値を設定してよいが、UI=falseの間はアプリがそれらを要求しない。Preview / Development scopeへProduction secretやProduction DB URLを複製しない。

### P1. 両flag無効のstaged Production deployment

Production domainへ割り当てないstaged deploymentを、exact `39fc5fb` checkoutから作る。

```bash
test "$(git rev-parse HEAD)" = "39fc5fbaf5b5e59be94e39bdf0e2c30e8113a4e6"
npx vercel@<PINNED_VERSION> deploy --prod --skip-domain --yes
```

このdeploymentはProduction env / Production DBを使うため、UI=falseを再確認してからアクセスする。`0007`適用前でもAdminは404となり、新tableを読む処理へ到達しない。

staged URLで確認する。

- deploymentがREADY、source SHAが`39fc5fb`
- `/`が200で公開表示が正常
- `/admin`と`/admin/login`が404
- Admin secret不足を示すerrorがpublic logにない
- public response、Analytics、Speed Insightsに回帰がない
- runtime error / 5xxがない

ここで失敗した場合、Production DBへ`0007`を適用せず停止する。

### P2. Production退避branch

`0007`適用直前のProduction `main`から、TTLなし・computeなしで作る。

```bash
neon branches create \
  --project-id long-silence-57673276 \
  --parent main \
  --name backup-pre-phase2a-<UTC_TIMESTAMP> \
  --no-compute \
  --no-secrets \
  --output json
```

planが対応していれば`--protected`も付ける。branch ID、parent ID、parent LSN、parent timestampを保存し、Phase 2A安定確認まで削除しない。

退避branchはrecovery pointであり、自動rollbackではない。restoreはsnapshot以降のProduction writeを失う可能性があるため、別incidentとして影響とRPOを確認し、明示承認後だけ行う。

### P3. rollout当日のbaselineを再確認

R1のSQLとProduction-safe verifyをもう一度実行する。さらに次を確認する。

- Vercel Current SHAが依頼時の期待値と一致
- `origin/main`が`a1f398f`
- local `39fc5fb`が`origin/main`の直系fast-forward
- migration latestが`0006`
- staged disabled deploymentがREADY
- Production flagsが両方false
- content modeが`bootstrap`

Git確認:

```bash
git fetch origin
test "$(git rev-parse origin/main)" = "a1f398fffbf2cbedb1e70a336b40457f78d2337c"
git merge-base --is-ancestor origin/main 39fc5fb
```

1つでも不一致なら停止し、backup作成後でも`0007`へ進まない。

### P4. Productionへ`0007`だけを適用

`39fc5fb` checkoutからdirect URLで実行する。

```bash
DATABASE_URL_UNPOOLED="$(neon connection-string main --project-id long-silence-57673276)" npx drizzle-kit migrate
```

適用中もVercel Currentは既存Phase 1C deploymentのまま、全content writerを停止したままにする。

migrationが失敗した場合:

1. 再実行や手動修復の前に停止する。
2. `drizzle.__drizzle_migrations`と新table / column / indexの有無をread-onlyで確認する。
3. Vercel Currentを変更しない。
4. content writerを解除しない。
5. down migrationやbackup restoreを自動実行しない。

### P5. `0007` post-check

```sql
select
  (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
  (select max(created_at)::bigint from drizzle.__drizzle_migrations) as latest_migration_at,
  (select count(*)::int from appearances) as appearances,
  (select count(*)::int from appearance_series) as series,
  (select count(*)::int from appearance_revisions) as appearance_revisions,
  (select count(*)::int from appearance_series_revisions) as series_revisions,
  (select count(*)::int from appearance_series where version <> 1) as non_v1_series,
  (select count(*)::int from admin_auth_attempts) as auth_attempts,
  (select count(*)::int from proposal_source_links where is_primary is null) as null_proposal_primary,
  (select content_mode from content_management_state where id = 'singleton') as content_mode,
  (select admin_activated_at from content_management_state where id = 'singleton') as admin_activated_at,
  (select legacy_import_locked_at from content_management_state where id = 'singleton') as legacy_import_locked_at;
```

期待値:

- migrations = 8 (`0000`から`0007`)
- latest migration = `1788353150633`
- appearances = 120
- series = 31
- appearance revisions = 120
- series revisions = 31
- non-v1 series = 0
- auth attempts = 0（まだProduction loginしていない）
- null proposal primary = 0
- content mode = `bootstrap`
- activation / legacy lock = NULL

Production-safe verifyを再実行し、120 appearances / 97 cards / 31 seriesと120 unchangedを確認する。現行Production domainの`/`とVercel logも正常であることを確認する。

### P6. disabled `39fc5fb`をProduction Currentへ切り替える

P1で作成し検証済みのstaged deploymentをpromoteする。

```bash
npx vercel@<PINNED_VERSION> promote <DISABLED_STAGED_DEPLOYMENT_URL> --yes
```

確認項目:

- Current source SHA = `39fc5fb`
- `ADMIN_UI_ENABLED=false`
- `ADMIN_WRITE_ENABLED=false`
- `/`が200
- 120 appearances / 97 cards / 31 series
- `/admin`、`/admin/login`、protected routeが404
- public runtime error / 5xxなし
- `contentMode=bootstrap`

最低限の観測時間を置き、error rateと公開表示が安定してからmain pushへ進む。

### P7. main pushのタイミング

main pushは次の全条件が揃った後だけ行う。

- fresh rehearsal完了
- Production退避branch作成済み
- Production `0007`成功・post-check済み
- disabled `39fc5fb`がProduction Currentで正常
- public siteに回帰なし
- `origin/main`がまだ`a1f398f`
- pushがfast-forwardである

```bash
git fetch origin
test "$(git rev-parse origin/main)" = "a1f398fffbf2cbedb1e70a336b40457f78d2337c"
git merge-base --is-ancestor origin/main 39fc5fb
git push origin 39fc5fb:refs/heads/main
```

push後、Git integrationが作るProduction deploymentもsource SHA=`39fc5fb`かつ両flag=falseであることを確認する。P6のdeploymentと異なるbuild結果、別SHA、5xxがあればUIを有効化しない。

### P8. Admin UIだけを有効にしたstaged deployment

Production scopeで次だけを変更する。

```text
ADMIN_UI_ENABLED=true
ADMIN_WRITE_ENABLED=false
```

APP_ORIGINと3つのAdmin secretは変更しない。env変更後、exact `39fc5fb`から新しいstaged Production deploymentを作る。

```bash
test "$(git rev-parse HEAD)" = "39fc5fbaf5b5e59be94e39bdf0e2c30e8113a4e6"
npx vercel@<PINNED_VERSION> deploy --prod --skip-domain --yes
```

staged unique URLではAPP_ORIGINがProduction originと一致しない。次だけ確認し、staged URLからlogin成功を期待しない。

- READY、source SHA=`39fc5fb`
- `/admin/login` GETが表示可能
- login GETは`private`と`no-store`を含む
- login submit（Server Action POST）は`no-store`を含む。`private`欠落だけでは停止しない
- GET/RSC/POSTのいずれにも`public`、`s-maxage`、cacheableな`max-age`等がない
- unique URLからのlogin submitがorigin mismatchとして拒否される
- build / runtime errorなし

rehearsalでloginと全read-only routeが完了済みであることを再確認してから、UI-enabled deploymentをpromoteする。

```bash
npx vercel@<PINNED_VERSION> promote <UI_ENABLED_STAGED_DEPLOYMENT_URL> --yes
```

前段のdisabled Production deployment URL / IDを即時rollback先として記録しておく。

### P9. Production UI post-check

必ずProduction custom originから確認する。

- `/admin/login`が200
- 正しいProduction passwordでlogin成功
- Cookieが`HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=43200`
- unauthenticated protected routeはloginへredirect
- proposal / appearance / source / series / revision / runsがread-only表示
- appearance 120、series 31、appearance revisions 120、series revisions 31
- add / edit / approve / reject / hide / restore / activate操作がない
- `ADMIN_WRITE_ENABLED=false`
- Admin GET/RSC responseが`private`と`no-store`を含む
- login / logout / Server Action POSTが`no-store`を含む（POSTの`private`欠落だけでは停止しない）
- GET/RSC/POSTのいずれにも`public`、`s-maxage`、cacheableな`max-age`等がない
- Vercel shared cacheへ認証済みHTMLやAdmin dataが載っていない
- unique deployment URLまたは別originからのlogin submitが拒否される
- public `/`、DB verify、import dry-runが120 / 97 / 31、120 unchanged
- `contentMode=bootstrap`
- activation / legacy lockがNULL
- Production runtime logに新規error / 5xxがない

Productionでrate-limitの上限試験を繰り返さない。永続rate-limitの5回許可・6回目遮断・cleanupはfresh rehearsalの`verify:phase2a`を証跡とし、Productionでは通常の誤password 1回以内と正しいloginだけに留める。

安定確認後もwrite flagを変更せず、activationを行わない。これでPhase 2A read-only rolloutを完了とする。

## 停止条件

次のいずれかを検出した時点で後続手順を停止する。

- Vercel Current、`origin/main`、対象SHAが期待値と不一致
- fresh rehearsalがfresh Production cloneではない
- rehearsalのmigration / test / UI確認が1件でも失敗
- Production退避branchのID / LSN / timestampを記録できない
- migrationが`0007`以外も適用しようとする
- migration失敗または適用状態が不明
- appearances 120、cards 97、series 31、revisionsの期待値が崩れる
- import dry-runがinsert / updateを示す
- `contentMode <> bootstrap`
- activation / legacy lockが非NULL
- `ADMIN_WRITE_ENABLED <> false`
- APP_ORIGINが本番exact origin以外、または複数originを許可
- Admin secretの不足・不正
- Admin GET/RSC responseに`private`または`no-store`がない
- login / logout / Server Action POSTに`no-store`がない
- Admin responseに`public`、`s-maxage`、cacheableな`max-age`、`immutable`、`stale-*`がある
- 認証済みAdmin dataにcache HITの兆候がある
- scrypt verifierが固定parameter形式ではない
- login session Cookieのsecurity属性不足
- public routeの5xx、表示差分、runtime error増加
- main pushがfast-forwardでない

停止時は「失敗したgate」「Vercel deployment ID」「Neon branch ID」「DB migration状態」「contentMode」「公開サイト状態」を記録する。secretとconnection stringは記録しない。

## rollback境界

| 到達点 | 安全な停止先 | 対応 |
| --- | --- | --- |
| rehearsal中 | Production未変更 | Productionへ進まない。rehearsal UIをfalseへ戻し、Neon branchはTTL失効させる |
| disabled staged deploy失敗、`0007`前 | 既存Production Current | staged deploymentをpromoteしない。Production DBを変更しない |
| `0007`成功、39 deploy前 | 既存`82b3bd9` Production | `0007`を残す。旧コードはadditive schemaと互換。down migrationしない |
| disabled `39fc5fb` Current | 検証済みdisabled deploymentまたは`82b3bd9` | public不具合ならVercel rollback。`0007`は残す。UI/writeはfalseを維持 |
| main push後、UI有効化前 | disabled `39fc5fb` | mainをrewriteしない。Vercelだけ最後の正常deploymentへrollback可能 |
| UI-enabled staged deploy失敗 | disabled `39fc5fb` Current | promoteしない。Production envのUIをfalseへ戻し、新しいdisabled deployを作る |
| UI-enabled CurrentでAdmin不具合 | 記録済みdisabled `39fc5fb` deployment | 最優先でdisabled deploymentへrollbackする。必要ならUI=falseで再deploy。writeは常にfalse |
| UI-enabled Currentでpublic不具合 | 最後の正常なdisabled `39fc5fb`またはPhase 1C deployment | Vercel rollback。`0007`は残す。content stateを変更しない |

rollbackはVercel deploymentの切替とfeature flag停止を基本とする。`0007`はforward-onlyで残す。Production退避branchからのrestoreは通常rollbackではなく、Production data破損が確認された場合の別incident対応とする。

## 完了記録

次をsecretなしで残す。

- operatorと開始・終了時刻
- exact SHA `39fc5fbaf5b5e59be94e39bdf0e2c30e8113a4e6`
- fresh rehearsal branch ID / parent LSN / expiry
- Production backup branch ID / parent LSN / timestamp
- migration前後のcountとjournal値
- disabled staged / disabled Current / UI-enabled staged / UI-enabled Currentのdeployment ID
- main push時のold / new SHA
- lint / build / typecheck / existing verify / Phase 2A test結果
- public、Admin（GET/RSCとPOSTを区別したcache判定）、origin、Cookie、no-store、runtime logの確認結果
- 最終`ADMIN_UI_ENABLED=true`
- 最終`ADMIN_WRITE_ENABLED=false`
- 最終`contentMode=bootstrap`
- Production DBへactivation / content mutationを実行していないこと
