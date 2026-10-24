# 依存関係の脆弱性対応（2026-10-24）

## 範囲と根拠

既存main `ea4da98e25122e3d2e03623573ba1dcc1e8792c4` から専用worktreeで対応する。元worktreeの未コミットUI変更12ファイルは含めない。アプリ・UI・DBスキーマ・公開キャッシュ設定・管理画面・巡回の実装は変更しない。本番DBのDDL/DML・マイグレーション・データ修復は禁止し、書き込み検証はPGliteまたは別の隔離Neonだけで行う。

公式根拠:

- [Next.js 2026-10-14 security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026): Cache Componentsのtyped arrayを使うRCE、SVG画像最適化のRCE、Server ActionsのDoS。Next.js 16.4.1以降を使用する。
- [Next.js 16.4.3 release](https://github.com/vercel/next.js/releases/tag/v16.4.3): 安定版の修正を取り込む。新機能への移行やcanaryの導入はしない。
- [React RSC RCE](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3)、[Server Functions DoS](https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453): 19.2系の修正版は19.2.9。Nextに同梱されるRSCは独立したlockfile項目にならないため、直接Reactの更新だけで解決とせず、Nextの公式修正版を使用する。
- [sharp / librsvg](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w): sharp 0.35.5以降、librsvg 2.63.2以降。glibc Linux上の条件付きRCEを含むため、Macだけで到達性を判断しない。
- 推移依存の監査根拠: [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)、[brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)、[undici](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)、[zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)。

| パッケージ | 更新前 | 更新後 |
| --- | --- | --- |
| next / eslint-config-next | 16.3.4 | 16.4.3 |
| react / react-dom | 19.2.8 | 19.2.9 |
| sharp | 0.35.4 | 0.35.5 |
| source-map-js | 1.2.1 | 1.2.2 |
| undici | 7.29.1 | 7.30.1 |
| zod | 4.5.4 | 4.6.7 |
| brace-expansion | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 |

NextのSWC・env・ESLint plugin、およびsharpの各OS向けバイナリ/libvipsも対応する版へ更新する。推移依存は親が許容する範囲だけを更新し、overrideやnpm audit fix --forceは使用しない。sharp実体はlibrsvg 2.63.2、libvips 8.18.7を含む。

## 残存リスクの判断

更新前のnpm auditはCritical 1 / High 5 / Moderate 4の10パッケージ、本番依存だけではCritical 1 / High 2の3パッケージ。更新後の本番依存は0件。全体ではModerate 4パッケージが残り、次の同じ1件の問題の依存経路に対応する。

`drizzle-kit@0.31.10 → @esbuild-kit/esm-loader@2.6.5 → @esbuild-kit/core-utils@3.3.2 → esbuild@0.18.20`

[GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) はesbuild開発HTTPサーバーのCORSが原因で、悪意あるWebページがローカルserveのソース等を読み取れる問題。esbuild自体は0.25.0以降で修正済みだが、親依存の最新安定版drizzle-kit 0.31.11にも古いloader経路が残る。監査が提案するdrizzle-kit 0.18.1へのダウングレードはDBツールの互換性・再現性を損ねるため採用しない。未検証のesbuild override、DrizzleのRC/メジャー移行もこの対応に含めない。

このesbuildはdev依存で、Nextアプリのruntime経路では使用しない。確認したcore-utilsはtransformを使用しserve呼び出しは0件。プロジェクトのdev/startはNext、DBコマンドはgenerate/migrateでありesbuild serve/Drizzle Studioは起動しない。tsxが使う別のesbuildは修正版。したがって確認した使用形態での本番リスクは低いが、将来serve経路を起動した場合の開発機上のリスクは残る。

暫定判断: 期限付きで残存を記録する。2026-11-07までに上流安定版のloader解消を再確認する。esbuild serve/Studioを導入する場合は事前に再評価する。ローカルhostへのbindだけでは本件CORS問題の対策にならない。全体auditの終了コード1はこの経路に限り説明付きで受け入れ、それ以外の新規検出や本番依存の検出はリリースを停止する。

## 検証とリリース

検証結果・隔離環境・本番デプロイ・復旧先は、実施後に以下へ記録する。機密情報や操作JSON、DBコピー、ログ、一時スクリーンショットはGitへ含めず終了時に削除する。

### ローカル・隔離DBの検証結果

Node.js 24.20.0 / npm 11.19.0を絶対PATHで固定して確認した。インストール後のルート型はnext typegenで生成する。各テストファイルはtest-concurrency=1、ビルドはメモリ上限3072MBで順次実行した。

- lockfileからのnpm ci、lint、生成型とtsc --noEmit --incremental false: 成功。
- tests/*.test.tsxとAdmin表示: 51件成功。
- サーバー側の単体・PGlite DB統合・認証・ゲスト・日時精度・公開日時・受付販売・巡回・キャッシュ: 179件成功。
- Webpack production buildと、ビルド後の実Nextキャッシュruntime: 4件成功。初回6 SELECT、公開3ページの共有、タグ失効、時計の進行とTTL、Preview/kill switch迂回、Adminのno-storeを確認。
- シリーズ優先順・検索フィルターとナビゲーション: 既存verify-appearance-filtersが成功。
- sharpのSVG→PNG変換が成功。lockfileではLinux向けsharp 0.35.5 / libvips package 1.3.4も固定。
- 全体auditは記録済みesbuild経路のModerate 4件だけで、本番依存auditは0件。未知の検出がないことをプログラムでも照合した。
- 巡回ストアの実DB統合は本番とは別の一時Neon cold-bonus-97732164 / br-lively-dream-b7phhtmlで成功。合成データだけを使用し、永続化・通知再試行・冪等性・activation・排他ロック・公開内容不変性を確認。

既存本番Neonのブランチ上限に達していたため、既存バックアップを削除せず、無料の独立プロジェクトと期限付き子ブランチを作成した。全量の本番DBコピーは実行していない。Git内スキーマと合成データのみを検証先へ登録した。初回のDB未設定ガードによる停止は、隔離先を明示した再実行で解消した。

### 隔離Vercelでの結果とリリース停止

検証用プロジェクト prj_ovO4xkX2YQLTxZKLAUiDOesXa9zu / iida-security-check-20261024のProductionを使用した。本番サイトのVercelプロジェクトとは別で、DB・認証・キャッシュscope・失効secretも検証専用。検証対象はd45c4bf、deploymentはdpl_7dXNENLQmYFe9VPv2mBUjQcxLD5z。

- VercelのLinuxビルド成功。実体はNode 24.22.1 / Next 16.4.3 / sharp 0.35.5 / librsvg 2.63.2 / libvips 8.18.7。
- 公開3ページ、シリーズ優先順、検索、カレンダー、375pxでの横はみ出し防止、Admin未認証リダイレクト/no-store、ログインServer Action、Preview→確定、確定内容の公開反映、失効APIの認証・scope拒否・正しい入力の成功をブラウザで確認。console/page errorは0件。
- 最初のブラウザ検証はラベルに選択肢文字列も含まれるためセレクタが一致せず停止した。DOMを読み取り確認し、検証側だけを修正して上記を再確認した。アプリの変更はしていない。
- 上記の公開反映だけでは、キャッシュの保持とタグ失効の成立を証明できないため、通知なし更新時の保持と実時間TTLを別途検証した。

**必須検証の失敗により、mainへのマージと本番反映を停止した。**

2026-10-24 10:58 JST、認証付き失効APIの200応答後に公開/newsを温め、合成シリーズを既存Admin writeで更新した。検証用CLIからの失効通知は明示的に省略した。次の/newsで既に更新後の値を取得し、「TTL前は更新前のキャッシュを保持する」assertionが失敗した。deploymentログにも01:58:46.605Zと01:58:50.126Zの2回のfill completeが記録されている。600秒経過後の検証には進んでいない。

原因は未確定。新規検証用Vercelプロジェクトの共有remote handler/設定差、失効と再生成の挙動、依存更新の回帰を切り分ける必要がある。ローカルの実Next runtimeテスト4件は成功しているが、この隔離Vercel上の失敗を成功扱いにはしない。次回は同じ条件で旧Next版との比較、Vercel側共有キャッシュの設定・handler・失効伝播を調査し、保持・失効・TTLがすべて確認できるまでリリースしない。

Next 16.4.3のVercelビルドにはpartialPrefetching未指定の移行警告も出た。設定は変更しておらず、これが上記失敗の原因とは断定していない。

本番はea4da98 / dpl_9jiXpSam3ey2txLd7cgnFMZjXinQのまま。本番DBにDDL/DML・スキーマ適用・データ修復は行っていない。PRはDraftとして保持する。復旧候補はこの現行本番で、今回は本番切り替え前に停止したためロールバックは不要。

終了時に今回作成した一時Vercelプロジェクトと無料Neonリソース（合成データの検証ブランチを含む）を削除した。秘密値・操作スクリプト・スクリーンショット・一時ログはGit外から削除する。専用worktreeとDraft PRは調査再開用に保持する。元worktreeのUI差分SHA-256は開始時と同じ61e846a1c722474a4b88bc09add74c6b422e72b62a2ee2d4f899bb8d20f0bb5c。

## キャッシュ失敗の継続調査（2026-10-24）

### 確認できた原因と未確定部分

前回のassertionは「失効APIの200応答後、1回読んだ値が600秒まで保持される」という前提だった。しかし、この順序では明示失効に続くremote cacheの追加missが起こる。通知なし更新による新たな失効とは区別が必要だった。失効を挟まない安定したhitの後に同じ通知なし更新を行うと、旧値を保持し、対象公開SELECTのcallsも増えなかった。

今回、API失効→1回のwarm→通知なし更新→再読の順序で4/4回再現した。別タグでのmanifest観測では1/2回、remote HTTP観測では2/2回再現し、その後はhitへ戻った。追加miss時にはVercel提供remote handlerのGETがmissを返し、さらに配下の`/v1/suspense-cache/…`へのGET自体が404だった。直前の保存POSTは200、再生成後の保存POSTも200で、その後のGETは200となった。アプリの追加失効や、Next wrapperがremote hitを破棄したことによる再読ではない。

代表的な時系列（UTC、同じ関数インスタンス・実行region iad1、キー・URL・認証ヘッダーは記録しない）:

| 時刻 | remote APIの観測 |
| --- | --- |
| 06:54:49.856 | 明示失効のPOSTが200 |
| 06:54:50.036 | 読み取りGETが404 |
| 06:54:50.160 | 再生成した値の保存POSTが200 |
| 06:54:54.318 | 通知なし更新後のGETが再び404 |
| 06:54:54.384 | 再生成した値の保存POSTが200 |
| 06:54:54.787以降 | GETが200、対象公開SELECTのcallsは増えない |

ここまでで特定したのは「明示失効直後のVercel remote側missを、通知なし更新が失効させたと誤分類していた検証条件」である。Vercelサービス内部の伝播・退避・保存後可視性のどれが追加missを発生させたかまでは確定していない。観測したhandlerのローカルmanifestは空で、ローカルrefreshTagsのexpired更新を原因とする根拠はなかった。期限前missはキャッシュの最低保持保証違反とは扱わず、Next.js 16.4.3の回帰とも断定しない。脆弱な旧版との比較は今回は行わず、旧版を公開することもなかった。

`x-vercel-cache: HIT`でもデータ用remote GETが404になる例を確認した。CDNとデータキャッシュのhitは同義ではない。アクセス側ログのkix1/sfo1に対して関数内VERCEL_REGIONはiad1、AWS_REGIONはus-east-1だった。別インスタンスでも同じ生成時刻の値を取得できたが、複数の関数実行リージョン間の検証ではない。

### 失効経路の独立検証

- 通知なし: 実Neonの既存`confirmAdminWrite`へ明示したコールバックを渡し、approved、skipped、callback 1回、HTTP通知0回を照合。安定したhitの後では旧値を保持し、対象公開SELECTのcallsは1のまま。CLIはAdmin Server Actionモジュールを実行せず、コード全体の検索でも別のNext失効API呼び出し経路は見つからなかった。無失効の動的証拠は通知カウンター、タグAPIログの不在、DBトリガーのない新規スキーマ、hitとSQL回数を合わせて判断した。
- 通常CLI通知: DB引数・カスタムinvalidatorを渡さない標準経路でapproved、invalidated、HTTP POST 1回を確認。確定後の新値取得と、その後のhitを確認。保護された隔離デプロイへの通知には検証用の期限付きCookieを通信層で付加し、通知関数自体は変更していない。
- Admin: 実デプロイからAction IDを取得し、専用Adminセッションで実際のPreview→確定Server Actionを実行。最新版のDB versionを入力し、確定approvedと新値反映、updateTag 1回・revalidatePath 2回を観測。その後の追加SELECTなしを確認。途中のversion競合は別試験との重なりによるもので、最新版を使って直列に再実行した。
- Adminのapproved処理はinvalidatorの外でルートlayoutとAdmin layoutを再検証する。したがって、Adminでcallbackがskippedというだけでは「すべての失効なし」を意味しない。一方、直接サービスを呼ぶCLIのskipped callbackは標準HTTP通知を置き換える。

### 修正範囲

アプリ・UI・管理画面・DBスキーマ・失効処理・TTL・依存バージョンには今回の追加変更を行わなかった。明示失効の削除、固定sleepでの隠蔽、TTL延長、未検証のパッチや旧版へのダウングレードは採用しない。

- PGlite回帰テストに、注入DBの標準skippedと、明示skipped callbackの1回実行・commit後の新値・HTTP通知0回を追加。
- 実Nextローカルruntimeテストに、失効なしの上流更新後も旧値と6 SELECTを維持する確認を追加。ローカルfallbackとVercel remoteを区別する説明へ修正。
- 公開キャッシュ資料にAdminのrevalidatePath、独立ケース、保存／hitの確認、SSO画面を除外する判定、SWR／無アクセスexpire、TTL前missの分類を追記。

### 隔離環境と観測方法

本番とは別のVercel `prj_ttX4yNoy1JyEvr2tK7gb1TuQx9F0`、無料Neon `late-base-52719813` / resource `store_S0Cum3tcBqrCXWOE`を新規作成し、Gitの全16 migrationと合成シリーズ・出演1件だけを登録。本番DBの接続情報・データコピーは使用しなかった。Vercelは保護を有効にし、有効期限30～60分の共有アクセスを使用した。無期限の自動化バイパス発行は自動レビューで拒否され、実行していない。

- 独立経路検証: dpl_4XNzK1AeTPVPhRokZdJpuxRxBt4p。
- 実時間TTL: dpl_oFrLnyRcTdeRNNBboSQtsVNfMcYs。同じ公開取得関数に900秒用の別引数・別タグを与える一時診断routeを設け、600秒の公開ページ試験とは分離した。
- 追加miss観測: dpl_4sS6UQn8nH4TXPVsPCTAAWvYJomC、remote HTTP観測: dpl_DR3ycqjLwXS5PZY1p2gzjvXLrqGp。TTL用とは異なる診断タグを用い、TTL保持中のタグは失効させなかった。

一時観測コードはGit HEADから作ったGit外の配布用コピーだけに追加した。handlerのget/set/updateTags、生成時刻、インスタンス、VERCEL_REGION、remote APIステータスと、隔離DBのpg_stat_statements（公開取得の主SELECT 1種のcalls）を対応付けた。公開3ページの6 SELECT共有自体はローカル試験と隔離ページ横断で確認した。診断routeと観測コードはPRへ含めない。

共有アクセス更新後にSSOへ遷移した要求は、HTTP 200でも成功扱いせず除外した。最終URLと合成データのマーカーを必須にした。保護設定を無効化していない。

### 再検証

Node 24.20.0で重い処理を直列実行。

- lint・next typegen・tsc --noEmit --incremental false・Webpack build・git diff --check: 成功。
- 公開UI57件、Admin表示6件、サーバー単体／PGlite／認証／CLI／巡回180件、実Next runtime4件が成功（実行グループ別の件数で、一部共通テストの重複実行を含む。public-cache単独7件はサーバー180件に含む）。
- 広いファイルglobにAdmin表示テストを含めてreact-server条件で起動した際はcreateContextエラーになった。UI用条件へ分けて6件を再実行し成功。アプリ修正による解消ではない。
- npm audit --omit=devは0件。全体は既に評価済みのesbuild経路のModerate 4パッケージだけで、新規検出なし。暫定例外・再確認期限2026-11-07を維持。

実時間TTL結果と終了状態は以下へ追記する。

| 実時間ケース | 観測結果 |
| --- | --- |
| 公開キー生成 06:45:18.726 UTC | 生成時刻をhandlerから記録。別インスタンスで同じ生成時刻のhitを確認 |
| 生成後146.8秒・530.8秒 | DBは通知なしで更新済みだが旧値。追加の公開SELECTなし |
| 生成後646.7秒の最初の読取 | 旧値を返し、handlerはrevalidate=-1。背景の公開SELECTが24→25へ増加 |
| 生成後681.1秒・699.0秒 | 新値を取得し、callsは25のまま。新しい生成時刻1792824965288.8477のhitを確認。反映を確認した時刻であり、所要時間を31秒と断定しない |
| 別キー生成 06:45:57.049 UTC | 直後のhit確認後、このキーは900秒経過まで読み取らない |
| 別キー生成後915.7秒の最初の読取 | handlerは旧生成時刻のentry（expire=900）を返したが、Nextが期限を判定して同期再生成し、応答には新値だけが含まれた。calls 25→26 |
| 次の読取917.1秒時点 | 新値、calls 26のまま |

以上の隔離・単一関数実行regionの試験範囲では、保持・通知・Admin失効・600秒SWR・900秒expireの期待動作を確認した。前回の失敗をそのまま「通知なし更新が失効を起こした」「600秒保持の回帰」と扱う根拠はなく、検証条件・判定を修正した。Vercel内部の失効直後の追加miss要因と複数関数実行regionでの挙動は未確定のまま残す。

本番反映の判断は保留し、ユーザー指定どおりDraft PRを維持する。mainマージ・本番デプロイ・本番環境変数変更・本番DB書き込みは実施しない。既存本番の復旧先も変更しない。追加missの内部原因まで確認が必要な場合は、上記deployment・request時刻を用いたVercel側調査、またはアクセス制限した旧版との対照試験が次の切り分けになる。

終了処理: 今回作成した隔離VercelプロジェクトとNeon resourceの削除成功を確認した。旧CLIの削除オプション解釈エラーは対応するCLIで解消した。既存Neon integrationは削除していない。一時観測用の配布コピー、Cookie、接続情報、ログ、HTTP本文、取得したパッケージ、一時スクリプト、ビルド生成物を終了時に削除する。検証結果はこの文書へ機密情報を除いて残し、専用worktreeとDraft PRは継続する。
