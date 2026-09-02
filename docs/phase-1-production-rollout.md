# Phase 1A / 1B / 1C Production rollout runbook

## 目的と適用範囲

このrunbookは、次の3 commitをProductionへ段階適用するための手順である。

| Phase | Commit | Migration | Productionでの役割 |
| --- | --- | --- | --- |
| 1A | `892eba9` | `0004_stormy_corsair.sql` | nullable expand schemaとdual-write |
| 1B | `1554be3` | `0005_clean_frightful_four.sql` | checkpointと競合安全なbackfill |
| 1C | `82b3bd9` | `0006_dusty_magik.sql` | strong constraints、DB mirror、source正本cutover |

Phase 2 Adminは対象外とする。migrationはforward-onlyとし、Productionでdown migrationやbackfillデータ削除を行わない。

## 2026-09-02時点の実状態

- local `main`: `82b3bd9`、`origin/main`より3 commit先行
- `origin/main`: `af34cc2`
- 3 commitは `af34cc2 -> 892eba9 -> 1554be3 -> 82b3bd9` の直線的なfast-forward系列
- GitHub `main`にbranch protectionなし
- Vercel project: `iida-hikaru-info` (`prj_8JpSJUf6supvOrWMncRxnO2IoYSg`)
- Vercelは`main`へのpushからProduction deploymentを自動作成している
- 現在のVercel Production deploymentはREADY、commitは`af34cc2`
- Neon project: `long-silence-57673276`、Production branchは`main`
- Production DBはmigration 4件、最新は`0003_worried_hawkeye` (`created_at=1788307700024`)
- 2026-09-02のread-only実測値: migration 4件、latest `1788307700024`
- 2026-09-02のデータ実測値: appearances 120件、series 31件、`source_items`未作成

> rollout当日も後述のbaseline queryを再実行し、対象checkoutの`drizzle/meta/_journal.json`と照合する。値がずれていれば停止する。

## 絶対ルール

1. 3 commitを一度に`main`へpushしない。Vercelが`82b3bd9`を先にProductionへ出すため危険である。
2. migrationは必ず対象commitの独立checkoutから実行する。`82b3bd9`のcheckoutでPhase 1A migrationを開始すると、未適用の0004〜0006がまとめて対象になる。
3. migrationにはdirect URL (`DATABASE_URL_UNPOOLED`、hostnameに`-pooler`なし)を使う。アプリ、verify、backfillにはpooled URLを使う。
4. `verify:phase1a`、`verify:phase1b`、`verify:phase1c`は書き込みテストである。Production branchへ向けて実行しない。
5. Productionのデータ確認にはread-only SQL、`scripts/verify-appearances.ts`、`scripts/import-appearances.ts`のdry-runだけを使う。独立worktreeでは`.env.local`に依存するnpm DB scriptを使わない。
6. `db:import --apply`、backfill、他のDB writerをPhase 1Cのmigration/deploy窓で停止する。
7. 各gateの期待値を満たさなければ、次commitをpushしない。force-pushしない。

各段階のProduction-safe application checkは、対応するexact checkoutから次を実行する。1つ目はDB verify、2つ目はimport planだけを表示するdry-runであり、`--apply`を付けない。

```bash
DATABASE_URL="$(neon connection-string main --project-id long-silence-57673276 --pooled)" npx tsx scripts/verify-appearances.ts
DATABASE_URL="$(neon connection-string main --project-id long-silence-57673276 --pooled)" npx tsx scripts/import-appearances.ts
npm run verify:filters
```

## 実差分から確認した互換性境界

| 稼働コード | DB schema | 判定 | 根拠と制限 |
| --- | --- | --- | --- |
| `af34cc2` | 0004適用後 | 安全 | 0004は新tableとnullable列だけを追加し、旧reader/writerを壊さない |
| `892eba9` | 0003以前 | 禁止 | dual-writeが0004の新tableを必要とする |
| `892eba9` | 0004 / 0005 | 安全 | 旧appearanceをread正本にしつつ、importを新旧両構造へ同一transactionで書く。0005はcheckpoint追加のみ |
| `1554be3` | 0004のみ | 公開表示は可能、運用対象外 | web readは動くがbackfill checkpointがないためPhase 1Bを開始できない |
| `1554be3` | 0005 | Phase 1Bの正規状態 | dual-writeを維持し、checkpoint付きbackfillと初期revision作成が可能 |
| `82b3bd9` | 0005 | Production writerとして禁止 | repository readはbackfill後なら動くが、writerはlegacy mirrorを直接更新しない。0006のDB triggerがない間に書くとmirror不一致になり得る |
| `1554be3` | 0006 | 短いread-only bridgeのみ | legacy repositoryはDB mirrorにより読める。ただし旧writerのprimary切替は同一source内のevidenceKey変更に強くないため、書き込み凍結を維持する |
| `82b3bd9` | 0006 | Phase 1Cの正規状態 | repository/importの正本、primary切替、DB constraints/mirrorが一致する |

Phase 1C migrationの直前は`1554be3`をProductionで稼働させる。0006適用中から`82b3bd9`切替完了までは全writerを凍結する。0006成功後に`82b3bd9`を直ちにProductionへpromoteし、その後に同じSHAを`main`へpushする。

## 事前準備

### 1. rollout担当と排他

- operatorを1名に固定する。
- Vercelの別deployment、`db:import --apply`、手動SQL、Admin/Collector相当のwriterがないことを確認する。
- rolloutログへ開始時刻、各SHA、Neon branch ID、Vercel deployment ID、各query結果を保存する。connection stringは保存しない。
- Vercel CLIは現在global installされていない。利用する場合は事前に承認済みversionを固定し、以降 `npx vercel@<PINNED_VERSION>` を使う。

### 2. SHAごとの独立checkout

例として次の3 worktreeを作り、それぞれで`npm ci`、`npm run lint`、`npm run build`、`npx tsc --noEmit`、`npm run verify:filters`を通す。

> Next.jsの`build`は`.next/types`にApp Routerの生成型を出力する。このため、fresh checkoutでは`npx tsc --noEmit`を単独で先に実行せず、必ず`npm run build`を先に成功させてからtypecheckする。リハーサルではこの順序でlint・build・typecheck・filter verifyが成功した。

```bash
git worktree add --detach /tmp/iida-phase1a-892eba9 892eba9
git worktree add --detach /tmp/iida-phase1b-1554be3 1554be3
git worktree add --detach /tmp/iida-phase1c-82b3bd9 82b3bd9
```

以降、migrationとscriptは必ず対応するworktree内で実行する。

### 3. rollout当日のProduction baseline

次をread-onlyで再確認する。

```sql
select
  (select count(*)::int from drizzle.__drizzle_migrations) as migration_count,
  (select max(created_at)::bigint from drizzle.__drizzle_migrations) as latest_migration_at,
  (select count(*)::int from appearances) as appearances,
  (select count(*)::int from appearance_series) as series,
  to_regclass('public.source_items')::text as source_items_table;
```

開始期待値はmigration 4件、latestは対象checkoutの`0003` journal値、appearances 120件、series 31件、`source_items_table is null`。Vercel Currentが`af34cc2`でない、`origin/main`が`af34cc2`でない、またはデータが期待値と異なる場合は停止して差分を再検証する。

## Neon退避branchとfresh rehearsal

### 1. Production退避branch

0004適用直前にProduction `main`から、TTLなし・computeなしの退避branchを作る。

```bash
neon branches create --project-id long-silence-57673276 --parent main --name backup-pre-phase1-<UTC_TIMESTAMP> --no-compute --no-secrets --output json
```

planが対応していれば`--protected`も付ける。branch ID、parent ID、parent LSN、parent timestampを記録し、rollout安定確認まで削除しない。これは同一Neon project内のcopy-on-write recovery pointであり、Productionを自動的に巻き戻すものではない。

### 2. fresh rehearsal branch

同じProduction時点からread-write compute付きの検証branchを作り、48時間程度のTTLを設定する。

```bash
neon branches create --project-id long-silence-57673276 --parent main --name verify-phase1-rollout-<UTC_TIMESTAMP> --expires-at <ISO8601> --no-secrets --output json
```

検証branchでは次を順番どおり実行する。

1. `892eba9` checkoutから0004だけをmigration。
2. `PHASE_1A_TEST_DATABASE=1 npm run verify:phase1a`。
3. `1554be3` checkoutから0005だけをmigration。
4. `PHASE_1B_TEST_DATABASE=1 npm run verify:phase1b`。Production write先行、backfill先行、checkpoint再開、冪等再実行を含む。
5. `82b3bd9` checkoutの`verify:phase1c --inject-preflight-violation`で違反を1件作る。
6. 0006 migrationがSQLSTATE `23514`で停止し、Phase 1C index/trigger/NOT NULLが部分適用されていないことを確認する。
7. `verify:phase1c --repair-preflight-violation`で修復する。
8. 0006 migrationを再実行して成功させる。
9. `PHASE_1C_TEST_DATABASE=1 npm run verify:phase1c`と既存DB verifyを実行する。

接続は値を表示・保存せず、migrationにはdirect、テストにはpooledを使う。

```bash
DATABASE_URL_UNPOOLED="$(neon connection-string <VERIFY_BRANCH> --project-id long-silence-57673276)" npx drizzle-kit migrate
DATABASE_URL="$(neon connection-string <VERIFY_BRANCH> --project-id long-silence-57673276 --pooled)" PHASE_1A_TEST_DATABASE=1 npm run verify:phase1a
```

fresh rehearsalが1つでも失敗した場合はProduction rolloutを開始しない。

## Phase 1A: expand migration -> dual-write deployment

### A1. 0004を先に適用

Production退避branch作成後、`892eba9` checkoutからdirect connectionでmigrationする。

```bash
DATABASE_URL_UNPOOLED="$(neon connection-string main --project-id long-silence-57673276)" npx drizzle-kit migrate
```

このcheckoutのjournalは0004で終わるため、適用対象は0004だけである。適用後、Vercelはまだ`af34cc2`のままにする。

期待値:

- migration 5件、latestが0004のjournal値
- appearances 120件、series 31件
- 既存120件の`visibility_status is null`
- `source_items`、`source_identities`、`appearance_source_links`が存在
- 正常運用で新writerがまだ動いていなければsource/link/revisionは0件
- 既存DB verifyが120 appearances / 97 cards / 31 series

停止条件:

- migration失敗または予期しないmigrationが適用された
- 既存件数・公開表示が変化した
- 0004適用だけでVercelに5xxが発生した

停止時は`af34cc2`を稼働継続する。0004はadditiveなのでdown migrationしない。

### A2. `892eba9`を`main`へfast-forward push

0004のpost-check成功後だけ実行する。

```bash
git fetch origin
git push origin 892eba9:refs/heads/main
```

Vercelで次を確認する。

- Production deploymentがREADYかつcommit SHA=`892eba9`
- Current domainの`/`が200で、120 appearances / 97 cards相当の表示を維持
- Production runtime error/5xxがない
- exact `892eba9` checkoutから`db:import` dry-runが0 insert / 0 update / 120 unchanged
- 必要なら`db:import --apply`のno-opを実行してもよいが、テストfixtureをProductionへ作らない

最低でも通常アクセスとログを確認する観測時間を置き、`892eba9`がProduction Currentであることをrollout記録に残す。この確認前にPhase 1Bを開始しない。

## Phase 1B: checkpoint deployment -> backfill

### B1. 0005を適用

`892eba9`がProductionで安定稼働した後、`1554be3` checkoutから0005だけを適用する。0005はcheckpoint tableの追加だけなので、`892eba9`と互換である。

```bash
DATABASE_URL_UNPOOLED="$(neon connection-string main --project-id long-silence-57673276)" npx drizzle-kit migrate
```

期待値はmigration 6件、checkpoint `phase-1b`が未開始、Vercel Currentはまだ`892eba9`。

### B2. `1554be3`を`main`へfast-forward push

```bash
git fetch origin
git push origin 1554be3:refs/heads/main
```

Vercel ProductionがREADY、Current SHA=`1554be3`、公開表示と既存verifyが正常であることを確認する。このcommitもPhase 1A dual-writeを維持している。

### B3. Production backfill

最初にdry-runでcheckpointと対象件数を確認する。

```bash
DATABASE_URL="$(neon connection-string main --project-id long-silence-57673276 --pooled)" npx tsx scripts/backfill-appearances.ts
```

開始期待値はappearances 120、visibility pending 120、missing links 120、initial revisions 0、checkpoint未開始。Phase 1A稼働後に正規importがあった場合はlink/revisionの一部が先行していてよいが、内容を確認してから進む。

5件canaryを実行する。

```bash
DATABASE_URL="$(neon connection-string main --project-id long-silence-57673276 --pooled)" npx tsx scripts/backfill-appearances.ts --apply --confirm=phase-1a-dual-write --limit=5
```

canaryで件数、legacy mirror、dual-write済みlink非上書きをread-only queryで確認後、残りを再開する。

```bash
DATABASE_URL="$(neon connection-string main --project-id long-silence-57673276 --pooled)" npx tsx scripts/backfill-appearances.ts --apply --confirm=phase-1a-dual-write
```

完了後に同じcommandを再実行し、増殖せずno-opで完了することを確認する。Productionでは通常`--restart`を使わない。

Phase 1B完了gate:

- checkpoint: `processed_count=120`、`completed_at is not null`、`dual_write_confirmed_at is not null`
- appearances 120、cards 97、series 31
- visibility pending 0
- active primary exactly-one候補 120、missing link 0
- evidence key NULL/空文字 0
- identity重複 0、sourceごとのcanonical identity複数 0
- legacy mirror mismatch 0
- version 1 / `snapshot_schema_version=1`の初期revision欠損 0
- backfill再実行によるsource/identity/link/revision増殖 0
- Vercel Currentは`1554be3`、runtime error/5xxなし

途中失敗時は次回同じcommandでcheckpointから再開する。`892eba9`または`1554be3`を稼働継続でき、0006と`82b3bd9`には進まない。

## Phase 1C: preflight -> strong constraints -> cutover

### C1. 退避branchとstaged Production build

Phase 1B完了gate直後のProduction `main`から、TTLなし・computeなしの`backup-pre-phase1c-<UTC_TIMESTAMP>`を作り、ID/LSN/timestampを記録する。

Vercelにlink済みのproject rootで、`git rev-parse HEAD`が`82b3bd9`、`.vercel/project.json`のproject IDが`prj_8JpSJUf6supvOrWMncRxnO2IoYSg`であることを確認する。そのrootからProduction environmentでbuildし、custom Production domainへ割り当てないstaged deploymentを作る。

```bash
npx vercel@<PINNED_VERSION> deploy --prod --skip-domain --yes
```

staged deploymentがREADY、source SHA=`82b3bd9`、build log正常であることを確認する。GET smoke testは可能だが、staged deploymentから書き込みを行わない。

### C2. writer freezeとpreflight

ここから`82b3bd9`のProduction切替完了まで、`db:import --apply`、backfill、手動更新、他deployを停止する。Vercel Currentは`1554be3`のままにする。

0006先頭のpreflightと同じ内容をread-onlyで確認する。

```sql
select
  (select count(*)::int from appearance_backfill_checkpoints
    where id = 'phase-1b' and completed_at is not null and dual_write_confirmed_at is not null) as ready_checkpoint,
  (select count(*)::int from appearances
    where source_name is null or source_item_id is null or visibility_status is null
      or first_visible_at is null or visibility_changed_at is null or version is null) as appearance_required_violations,
  (select count(*)::int from appearance_source_links
    where source_identity_id is null or published_at_precision is null or collected_at is null) as link_required_violations,
  (select count(*)::int from appearances a where
    (select count(*) from appearance_source_links l
      where l.appearance_id = a.id and l.active and l.is_primary) <> 1) as primary_violations,
  (select count(*)::int from appearance_source_links l
    left join source_identities i on i.id = l.source_identity_id
    where i.id is null or i.source_id is distinct from l.source_id) as ownership_violations,
  (select count(*)::int from proposal_source_links l
    left join source_identities i on i.id = l.source_identity_id
    where l.source_identity_id is not null
      and (i.id is null or i.source_id is distinct from l.source_id)) as proposal_ownership_violations,
  (select count(*)::int from appearances a
    join appearance_source_links l on l.appearance_id = a.id and l.active and l.is_primary
    join source_items s on s.id = l.source_id
    join source_identities i on i.id = l.source_identity_id
    where a.source_name is distinct from i.source_name
      or a.source_item_id is distinct from i.external_item_id
      or a.source_url is distinct from s.canonical_url
      or a.published_at is distinct from l.published_at
      or a.published_on is distinct from l.published_on
      or a.published_at_precision is distinct from l.published_at_precision) as mirror_violations,
  (select count(*)::int from appearances a where not exists (
    select 1 from appearance_revisions r
    where r.appearance_id = a.id and r.version = 1 and r.snapshot_schema_version = 1
  )) as initial_revision_violations;
```

期待値は`ready_checkpoint=1`、その他すべて0。1件でも違反があれば停止し、`1554be3`を稼働・writer freeze解除前の状態に戻して原因を修復する。`82b3bd9`をpromote/pushしない。

### C3. 0006を適用

全preflightが成功した場合だけ、`82b3bd9` checkoutからdirect connectionでmigrationする。

```bash
DATABASE_URL_UNPOOLED="$(neon connection-string main --project-id long-silence-57673276)" npx drizzle-kit migrate
```

0006自身も最初に同等のpreflightを実行し、違反時はSQLSTATE `23514`で停止する。失敗時はPhase 1C index/trigger/NOT NULLが部分適用されていないことを確認し、`1554be3`とwriter freezeを維持する。

成功直後は0006 + `1554be3`の短いbridge状態である。公開readはlegacy mirrorにより維持できるが、importを書き込んではならない。

### C4. staged `82b3bd9`をpromoteし、その後mainを更新

```bash
npx vercel@<PINNED_VERSION> promote <STAGED_DEPLOYMENT_URL> --yes
```

Production Currentがcommit/source=`82b3bd9`、`/`が200であることを確認する。続けてGitの正本を同じSHAへfast-forwardする。

```bash
git fetch origin
git push origin 82b3bd9:refs/heads/main
```

pushによる自動Production deploymentも同じSHAであることを確認する。異なるSHAや新しいremote commitが見つかった場合はpushせず停止する。

Phase 1C post-check:

- migration 7件、latestが0006
- active primary部分unique index 1件
- old `appearances_source_item_unique` 0件
- identity/source composite FK 2件
- 必須NOT NULL 9カラム
- mirror/exactly-one関連trigger 7件、deferred constraint trigger 2件
- active primary違反、ownership違反、legacy mirror mismatch、初期revision欠損がすべて0
- Production read-only DB verifyが120 appearances / 97 cards / 31 series / sample 0
- import dry-runが0 insert / 0 update / 120 unchanged
- Current domain、Vercel runtime logs、5xxが正常

すべて成功した後だけwriter freezeを解除する。

## 停止・rollback方針

| 到達点 | 安全な停止先 | 対応 |
| --- | --- | --- |
| 0004成功、892 deploy前 | `af34cc2` | 0004を残す。DB down不要 |
| `892eba9`稼働後 | `892eba9`または`af34cc2` | 0004は両方と互換。backfill未開始 |
| 0005 / backfill中 | `1554be3`または`892eba9` | backfill停止。checkpointから再開。新構造は削除しない |
| backfill完了、0006前 | `1554be3` | preflight違反を修復。82を出さない |
| 0006成功、82切替前 | `1554be3` read-only bridge | writer freeze継続。staged 82をpromoteまたは修復して再deploy |
| `82b3bd9`切替後 | 最後に成功したPhase 1C互換82 deployment | DB downしない。155へのVercel rollbackは緊急read-only用途に限定し、importを停止したままにする |

Neon退避branchからのrestore/PITRは、snapshot以降のProduction書き込みを失う可能性がある別のincident対応である。自動rollbackとして実行せず、影響・RPOを確認して明示承認後に行う。

## main merge/pushの確定タイミング

現在の3 commitはすでにlocal `main`上で直線的に並び、GitHub `main`はunprotectedなのでmerge commitは不要である。次の3回だけ、各gate後にexact SHAをnormal fast-forward pushする。

1. 0004成功後: `892eba9 -> origin/main`。VercelでPhase 1A dual-writeをCurrentにする。
2. Phase 1A稼働確認 + 0005成功後: `1554be3 -> origin/main`。その後にだけbackfillする。
3. Phase 1B完了 + 0006成功 + staged 82 promote後: `82b3bd9 -> origin/main`。

もしrollout前または途中で`origin/main`が別commitへ進んだ場合、rebase、merge、force-pushをその場で行わない。新しいbaseからfresh Neon rehearsalをやり直し、互換性境界を再評価する。

## 公式運用資料

- Neon branching: https://neon.com/docs/guides/branching-intro
- Neon direct/pooled connection: https://neon.com/docs/connect/connection-pooling
- Vercel Git deployment: https://vercel.com/docs/git
- Vercel staged Production build: https://vercel.com/docs/cli/deploying-from-cli
- Vercel promotion: https://vercel.com/docs/deployments/promote-preview-to-production
