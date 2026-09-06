# Phase 2 Admin activation rollout runbook

このrunbookは、Phase 2Bがmigration `0008`までread-only導入済みで、`contentMode=bootstrap`、`ADMIN_WRITE_ENABLED=false`のProductionを不可逆にAdmin modeへ切り替える手順です。activation自体にschema migrationはありません。

## 不可逆境界

- 正式な`/admin/activation`フロー以外で`contentMode`を更新しない。
- transactionはsingleton stateを`FOR UPDATE`し、事前checkpointと全invariantを通過した場合だけ、同じ`transaction_timestamp()`で`contentMode=admin`、`adminActivatedAt`、`legacyImportLockedAt`を更新する。
- 正しいactivated状態への再送だけをidempotent成功とする。partial state、timestamp不一致、`admin`から`bootstrap`への遷移はfail closedとする。
- activation後のDB rollbackは通常のruntime rollbackではない。pre-activation backupは災害復旧境界として保持し、安易にProductionへ差し替えない。
- passwordのscrypt検証はtransaction開始前に行い、5分間のsession-bound reauth proofだけをtransactionへ渡す。

## 1. 候補とProduction baseline

1. 候補exact SHA、clean worktree、`origin/main`からのfast-forward可能性を確認する。
2. Production Currentのexact SHAと環境を確認する。`ADMIN_UI_ENABLED=true`、`ADMIN_WRITE_ENABLED=false`、Production `APP_ORIGIN`のみを許可する。
3. direct接続をread-only確認にだけ使い、migration `0008`、120 appearances、97 cards、31 series、proposal 0、`bootstrap`、activation timestampなし、legacy lockなしを確認する。
4. Phase 1C / 2A / 2B verify、import dry-run 120/31 unchangedを実行する。ここで差異があれば停止する。
5. Production main直系からTTLなしのpre-activation Neon backup branchを作成する。既存backup branchは削除しない。

## 2. Fresh rehearsal

1. Production main直系のfresh TTL付きNeon branchを作成し、候補exact SHAからPreviewを作る。
2. `ADMIN_UI_ENABLED=true`、`ADMIN_WRITE_ENABLED=false`で公開サイト、login/session/logout、read-only Admin、write route 404、cache policy、origin、runtime errorを回帰確認する。
3. Previewだけ`ADMIN_WRITE_ENABLED=true`へ変更する。`contentMode=bootstrap`は直接変更しない。
4. activation直前のcontent fingerprint、checkpoint、invariant、import dry-runを記録する。
5. `/admin/activation`でpasswordを再入力し、続いてexact文字列`ACTIVATE ADMIN`を入力する。このUI以外からstateを更新しない。
6. modeが`admin`、両timestampがnon-nullかつ完全一致、legacy import apply拒否、dry-run継続、再送idempotentを確認する。
7. Phase 2Bの成功mutation、成功confirm再送、stale競合、transaction rollback、public revalidationをbrowser E2Eで確認する。
8. 120 appearances、97 cards、31 seriesと全invariantを再確認する。fixtureはProductionデータと区別できるIDを使い、rehearsal branch内でのみ後始末する。

## 3. Runtime先行導入

1. exact候補を`ADMIN_UI_ENABLED=true`、`ADMIN_WRITE_ENABLED=false`でstaged deploymentにする。staged固有URLではProduction `APP_ORIGIN`を変更せず、ActionのHost/Origin mismatch拒否を期待する。
2. GET可能な公開／Admin read-only境界、write route 404、no-store、予期しないruntime errorがないことを確認する。
3. Production DB fingerprintが不変であることを確認してからProductionへpromoteする。
4. Production originでlogin/session/logout、全read-only画面、write-disabled Actionのfail-closed契約を確認する。

## 4. Production activation

1. Production DBのbaselineとpre-activation backup branchを再確認する。
2. `ADMIN_WRITE_ENABLED=true`のexact候補deploymentを準備する。staged URLのActionはProduction `APP_ORIGIN`との不一致で拒否されるため、正常reauthはpromote後にだけ確認する。
3. exact SHAと環境を確認してpromoteする。`bootstrap`中は通常のPhase 2B confirmがfail closedであることをDB fingerprint付きで確認する。
4. Production originの`/admin/activation`から、管理者本人がpasswordを再入力し、exact文字列`ACTIVATE ADMIN`を入力して1回だけ確定する。
5. 即座に`admin`、両timestamp一致、legacy import apply拒否、proposal/content/revisionにactivation以外の変更なしを確認する。
6. Admin writeを継続運用する方針なら`ADMIN_WRITE_ENABLED=true`を維持する。緊急停止時はflagをfalseへ戻せるが、DBのactivationとlegacy lockは戻さない。
7. Production検証成功後にだけ`origin/main`をexact SHAまで通常fast-forward pushする。push起因deploymentのSHA、flag、Current状態を確認する。

## 停止条件

- exact SHA、環境、branch lineage、migration、120/97/31、proposal 0、dry-run unchangedのいずれかが不一致。
- reauth失敗時にproofが発行される、proofが期限切れ・改ざん・別sessionで通る、activation rate limitがloginと分離されていない。
- activation前に通常mutationが成功する、またはactivation失敗時にstate/content/proposal/revisionが変化する。
- stateがpartial、timestamp不一致、legacy import applyがactivation後も成功する。
- Admin GET/RSCがprivate + no-storeでない、Action POSTがno-storeでない、禁止cache directiveがある。
- secret、password、session、proof、raw IP、内部invariant名がresponseやlogへ出る。
- 既知のstaged origin mismatch以外のruntime error／5xxがある。

## Rollback境界

- promote前: staged deploymentを破棄し、DBは変更しない。
- activation前: 直前の検証済みruntimeへrollbackし、`ADMIN_WRITE_ENABLED=false`へ戻せる。
- activation後: runtimeはrollback可能だが、`contentMode=admin`とlegacy lockは不可逆として維持する。旧bootstrap runtimeやlegacy importerをProductionへ戻してはならない。
