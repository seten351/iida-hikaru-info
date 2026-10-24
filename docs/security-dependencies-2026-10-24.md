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
