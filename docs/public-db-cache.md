# 公開DB取得キャッシュ

## 実装と境界

Next.js 16.3.4のCache Componentsを有効化し、`getPublicPageData()`内の公開取得関数だけに`use cache: remote`を指定する。`/`・`/news`・`/deadlines`は同じ取得関数・DBスコープ・タグを共有する。公開用に整形済みの出演、締切、シリーズ名、情報元、最終DB更新日時をキャッシュする。公開取得のミス1回は従来どおり6 SELECT。キャッシュ生成時だけ`[public-cache] fill complete`と公開件数を記録し、クエリ・URL・認証情報・個別データはログへ出さない。

`getAppearancePageData()`と`readDeadlineRecords()`自体は非キャッシュのまま維持する。管理画面、更新前Preview、CLIの照合・検証、更新処理はこれらの経路を使う。非公開締切や管理用レコードは公開キャッシュの戻り値へ含めない。

ページのHTML・表示判定にキャッシュ指定はない。`connection()`後の現在時刻を用いる予定／履歴、締切状態、7日前判定、JSTの日付境界、検索・ページ送りは毎リクエストで計算する。既存のDeadlineClockProviderも維持する。Cache Componentsに伴う静的シェルは読み込み表示を含み、公開内容とAdmin認証・DB取得はSuspense内のリクエスト処理として実行する。Adminのno-storeヘッダー・Proxy・認証は維持する。

キャッシュ期間は`stale: 30`、`revalidate: 600`、`expire: 900`（秒）。`stale`はクライアント再利用の指定で、サーバーTTLではない。Next.jsのクライアントキャッシュは最低30秒を適用するため、ナビゲーション／prefetchによる30秒以内の再利用があり得る。DB更新通知はサーバーキャッシュを失効させ、開いている全ブラウザへ自動配信はしない。期限経過後のDB障害時に表示成功を保証する設計ではない。

ローカルの`next start`はNext標準のプロセス内remote handlerを使う。本番Vercelではプラットフォーム提供の共有remote handlerを使う。ローカル検証はAPI・SQL削減・期限・失効を確認するもので、Vercelの複数インスタンス／リージョン間の持続性の証明ではない。

## 設定と導入手順

2026-10-01にキャッシュOFFで本番回帰確認後、Productionで有効化した。[本番反映記録](public-db-cache-production-rollout-2026-10-01.md)を参照。設定欠落時は無効。新しい実行環境へ導入する場合は以下を確認する。

1. 本番DBに対応する接続設定で`npm run cache:scope`を実行し、出力したSHA-256を控える。このコマンドはDBへ接続せず、接続文字列や認証情報を出力しない。プール／直接接続のNeonホストは同じスコープになる。
2. 公開アプリのProduction環境に`PUBLIC_CACHE_DB_SCOPE`と、32文字以上の専用`PUBLIC_CACHE_INVALIDATION_SECRET`を設定する。`PUBLIC_DB_CACHE_ENABLED=1`で有効化する。`VERCEL_ENV=production`かつDBスコープ一致が必要で、不一致・設定欠落・Preview・Developmentは非キャッシュ取得へ迂回する。
3. Antigravity／既存CLIの実行環境にも、更新先DATABASE_URLに一致する`PUBLIC_CACHE_DB_SCOPE`、同じ専用secret、`PUBLIC_CACHE_INVALIDATION_URL=https://<公開アプリ>/api/internal/public-cache/invalidate`を設定する。URLはHTTPS・固定パスで、リダイレクトを許可しない。ローカルCLIはVERCEL_ENV未設定でも明示設定された通知先へ通知できる。VERCEL_ENVがpreview/developmentなら通知しない。
4. Vercel Runtime Cacheの利用可否、料金、リージョン、利用量を確認する。既存のVercel Previewはキャッシュを迂回する。共有キャッシュ検証は、隔離DBと専用secretを使った別の検証用プロジェクトのProduction環境で行う。本番DB・本番通知先をその環境へ渡さない。
5. その環境で、公開3ページの温まった後の追加SELECTが0件、更新確定後の再取得、失効通知、管理画面のno-store／認証、JST境界の表示を確認する。キャッシュ有効化前に稼働中の全CLIの通知設定を確認する。
6. 後日、本番反映の依頼を受けた際に既存のデプロイ手順で反映し、取得回数・取得時間・Runtime Cache利用量と失効失敗ログを比較する。

問題時はProductionの`PUBLIC_DB_CACHE_ENABLED=0`へ変更し、Vercelで環境変数変更を反映する再デプロイを行う。スコープ／DB接続先が変わる場合も新スコープを設定して再デプロイする。DBスキーマ変更や巡回基盤の切り替えは不要。

## 更新後の失効・再試行

`confirmAdminWrite()`はDBトランザクションの成功後、`status=approved`の場合だけ通知する。出演・締切・シリーズ・情報元・非公開化／復元のいずれも同じスコープの`public-data:v1:<scope>`タグを失効させる。

Admin Server Actionでは`updateTag()`を使用する。CLIでは認証付きPOSTを行い、受け側がDBスコープを照合して`revalidateTag(tag, { expire: 0 })`を呼ぶ。通知は任意タグやパスを受け付けず、DBを読み書きしない。Preview、dry-run、競合、拒否、トランザクション失敗では失効しない。隔離DBを引数で注入したwriteは、失効コールバックを明示しない限り通知しない。

通知失敗でもDBの`approved`を維持し、`publicCacheInvalidation.status=failed`と固定文言の警告を返す。CLIは3秒タイムアウト・最大3回の通知試行を行う。通知先未設定は`skipped`となる。DB確定済みの場合は同じJSON・reviewed hash・冪等キーで確定操作を再実行し、既存確定結果を再取得して通知だけを再試行する。異なるキーで再登録しない。Adminも同じ確定操作の再実行で通知を再試行する。

更新をDBへ直接書き込む保守スクリプト・bootstrap専用importは今回の通知経路の対象外。公開運用の更新は既存Admin writeへ統一する。補助巡回の候補保存やDiscord通知では公開データを失効させない。通知できなかった場合の復旧経路は短いTTLと冪等な再試行であり、通知用outboxや新規cronは追加していない。

## 検証

- `npm run test:public-cache`: DBスコープ、Production限定・迂回、認証・入力上限、失効順序、通知失敗、冪等再試行を検証。実トランザクションは隔離したPGliteへ全migrationを適用して確認する。
- `npm run build`後に`npm run test:public-cache-runtime`: 実際のProductionビルドをローカル起動し、fake DATABASE_URLとlocalhostのNeon HTTP代替だけを使用する。`.env.local`を実行環境へ読み込まず、本番DBを使わない。時計前進は一時preload内だけで行い、アプリのTTLを変更しない。一時ディレクトリと子プロセスは終了時に整理する。
- 既存のゲスト日時精度修正、締切、公開日時、Admin write、巡回、公開UI、検索・フィルターの回帰テスト、lint、型チェック、Webpack buildを確認する。

本番Vercelでの公開3ページ共有・失効・実時間TTLは本番反映記録に整理する。複数リージョン間の伝播と継続的な利用量・費用の確認は別途必要。クエリ数は1つのキャッシュ領域での定常ヒットを基準とし、同時初回アクセスやリージョンごとの取得を含めて全世界で6件だけとは見積もらない。

### 本番反映前の実装検証結果

- 既存回帰テスト178件、新規policy／実transactionテスト6件、実Nextサーバーテスト4件、計188件が通過。
- 実サーバーでは初回6 SELECT→公開3ページの追加取得0件。検索パラメータを含む予定表示でも共有し、失効後6件を再取得して更新タイトルを反映した。
- サーバー時計を90秒前進させると、同じキャッシュ済み出演が予定から履歴へ移動し、追加SELECTは0件。
- テスト用時計で601秒前進後に再取得し、その生成時からさらに901秒経過後にも再取得した。ローカル標準handlerは600秒のrevalidateでエントリを落とすため、Vercel remote handler固有のSWR／900秒expireの挙動は別環境で確認する。
- PreviewとProductionの迂回フラグでは、各リクエスト6 SELECT。Previewの失効POSTは503で拒否し、追加DBアクセスは0件。無効化されたAdmin入口は404かつno-storeで公開DB取得を実行しない。
- lint、TypeScript型チェック、Webpack production build、フィルター検証、`git diff --check`が通過。フィルター検証はtsx CLIのsandbox IPC制限を避け、`node --import tsx scripts/verify-appearance-filters.ts`で同一スクリプトを実行した。
- 既存のREADME／package.jsonのゲスト日時精度修正、修復スクリプト・監査資料・修正テストを保持した。Gitへのcommit／push、本番DB変更、Vercelデプロイ、稼働中Antigravityの設定変更は行っていない。
