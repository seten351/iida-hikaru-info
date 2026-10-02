<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Rules

## Command Execution
- 本プロジェクトで使用するコマンド（テスト、ビルド、スクリプト実行、DB操作・反映など）は、ユーザーへの事前確認を行わずにすべて自動で即座に実行する。
- 文字列やファイル・コードベースの検索には、grepでしか行えない処理を除き、基本的に `rg`（ripgrep）コマンドを使用する。

## Series Filter Display Order (シリーズ選択の表示順)

- 公開ページの「出演情報を探す」では、**飯田ヒカルさんの活動における代表性・関わりの深さと、ファンが探す際の優先度**を基準に並べる。世間一般の作品人気・知名度・ブランド規模による順位にはしない。
- 上位は **学園アイドルマスター（学マス / `gakuen-idolmaster`）→ 飯田ヒカルのヒカROOM！（`hikaroom`）→ 軌跡シリーズ（`kiseki-series`）** とする。本人の冠番組・継続出演番組・本人名義のイベントを上位に置き、知名度の高い作品という理由だけでそれらより上にしない。
- 表示順は `src/lib/appearance-series-display-order.ts` の `appearanceSeriesDisplayOrder` にシリーズIDで一元管理し、本サイトの編集上の優先順として維持する。
- `src/lib/appearance-filters.ts` の `getAppearanceFilterOptions()` は、この優先順で選択肢を作る。全体を五十音順・アルファベット順・登録順・出演件数順に戻さない。
- 新しいシリーズを登録・追加するときは、確認できる出演形態（冠番組・レギュラー・担当役・歌唱・ゲスト等）や継続性をもとに、飯田ヒカルさん自身にとっての優先順を確認・更新する。出演形態が不明な場合は重要度を断定しない。未指定のシリーズは指定済みの後ろに表示名順で並べ、出演情報のあるシリーズだけを選択肢に出す。
- 先頭の「すべて」と末尾の「シリーズなし」は固定する。検索条件を変えてもシリーズ同士の相対的な順序を変えない。
- Codex、Antigravity、Gemini、Claudeなど、すべてのAIエージェントはこの方針を引き継ぐ。順序を変更する際は上記の定義を更新し、検索・絞り込みの動作も確認する。

## Information Sources & Publication Date/Time Rules
- **公開発表日時（`published_at`）を安易に「日時不明」としないこと**:
  - 公式X（旧Twitter）等の告知・投稿日時を確認し、正確な発表日時を設定する。
  - XのポストID（Snowflake ID）から正確な投稿日時を復元・確認し、ISO 8601形式（`precision: "exact"`）で登録する。
- **情報元URL（`source_url` / Primary Source Link）の個別化・具体化**:
  - 公式サイトのトップページやプラットフォームのトップURL（`https://...` トップ等）など、個別発表内容や日時が判別できない汎用URLは情報元として使用しない。
  - 個別の告知記事・ニュースページが存在しない、または判別できない場合は、公式X（旧Twitter）の告知ポストURL（`https://x.com/.../status/...`）を情報元リンクとして登録すること。
  - **『カンナヒカル（仮）』各回情報元URL**: 音泉の番組トップページ（`https://www.onsen.ag/program/umauma`）ではなく、**音泉公式X（`@onsenradio`）による各回の配信告知ポストURL（`https://x.com/onsenradio/status/...`）** を情報元URLとすること。発表日時はそのSnowflake IDから算出した正確な日時（`precision: "exact"`）とし、`sourceName` は `"x:onsenradio"`、`sourceItemId` はポストIDとする。

## Duplicate Prevention Rules (出演情報の二重登録防止)
- **DB既存レコードとの事前照合（重複防止）の徹底**:
  - 新規出演情報を追加する前に、必ずDB内の既存登録情報（`appearances`, `appearance_source_links`）との重複がないか確認する。
  - 重複確認コマンド: `npm run check:duplicate "<タイトル/キーワード/情報元URL/ID>"`
  - 情報元URL（XポストURLやDLsiteのRJコード等）、作品タイトル（記号や表記揺れを正規化した比較）、および同一日付・同カテゴリでの既存登録がないかを必ず事前に照合すること。
  - すでに同作品・同イベントのレコードがDB上に存在する場合（別IDや役名付きIDで先行登録されている場合など）は、**新規レコードを作成（二重登録）せず、既存レコードに対して `source_links` の追加や開演日時・詳細情報の更新（UPDATE）** を行うこと。
  - `admin-import-appearances.ts`（`npm run db:admin-import`）にも情報元URLおよび正規化タイトル＋日付の二重検知ガードが備わっているが、登録前の事前調査と照合を怠らないこと。

## Guest Information Updates (ゲスト情報)
- `guestInfo.isHikaruGuest` は本人の区分（`true`: ゲスト出演、`false`: 通常出演と確認済み、`null`: 未確認）、`guestInfo.guestNames` は本人以外のゲスト名の配列とする。ゲスト表記が見つからないだけで `false` にしない。通常更新で未確認へ戻したり、既存ゲスト名を消したりしない。
- Antigravityの既存巡回で個別の公式根拠を確認したら、新規登録せず照合した既存IDを更新する。最新版の全fieldsと `expectedVersion` を引き継ぎ、変更する `guestInfo` と `evidenceSources` を1件のJSONに入れ、既存 `npm run db:admin-import -- --input <JSONファイル>` を使用する。複数公演は公演ごとに更新する。読み取り例・JSON形式はREADME「ゲスト情報の確認・更新」を参照。
- dry-runでbefore/afterと根拠を確認し、出力の `inputHash` を `--apply --reviewed-hash <inputHash>` に渡して確定する。競合は最新版を再照合し、通信障害時は同一JSON・hashで冪等に再試行する。ゲスト変更だけで既存の公開日時・新着順・primary情報元を変更しない。直接SQLで通常更新しない。
- 既存全件の調査・補完、稼働中巡回の切り替え、本番スキーマ適用はゲスト機能の実装とは別作業とする。操作JSONはGit外に置き、終了後に削除する。

## Deadline Updates (受付・販売情報／旧申し込み締切)
- 受付・販売の新しい登録・更新はREADME「受付・販売情報」と `docs/reception-sales.md` に従い、既存 `db:admin-import-deadlines` へ `schemaVersion: 2` の1件JSONを渡す。開始・終了はそれぞれ `exact / date / unknown` とし、日付のみから時刻を作らない。既存の種別・開始日時を根拠なく補完しない。旧形式のJSON・CLI・hashは互換用途として維持する。
- `informationType` でチケット申込・イベント受付・配信販売・受注物販・通常通販等を区別する。`state` の完売は `sold_out`、再販は `saleMode: "resale"` として期間状態と分離する。延長・完売・同じ販売枠の再販は同一IDで更新し、受付名を「再販」へ変更して重複を作らない。以前の期間はAdmin revisionで確認する。
- v2では全追加fieldsと現在のprimary `source` を引き継ぎ、状態・種別・期間・再販を確認した個別一次情報を `evidenceSources` に追加する。primary維持でこれらを変更する場合は追加根拠が必須。primaryとその公開日時・新着順を安易に変更しない。primary変更はPreviewで明示して確認する。旧形式の情報元差し替え動作は維持する。
- 既存のAntigravity自動巡回で確認した個別告知に締切情報がある場合、その運用内で登録・更新する。巡回基盤・出演情報の更新経路は変更しない。人間のadmin画面は確認・監査・緊急時の修正を中心とし、手動操作は最終手段とする。
- 登録前に `npm run check:deadline-duplicate -- "<企画名・受付名・告知URL・ID>"` で照合する。同じ企画・受付の延長は既存IDを更新し、別の受付段階には異なる受付名・evidence keyを使う。ファン企画は `projectType: "fan"` とする。告知日時・個別情報元URLは上記の情報元規則に従い、確認できない締切時刻を推測しない。
- 通常操作は既存の `npm run db:admin-import-deadlines` に `--input <JSONファイル>` を渡す。JSONは `AdminDeadlineMutationInput` 1件で、登録は `create`、更新・延長・受付終了・中止は `update`（全fieldsとsourceを指定、`state` は `scheduled` / `closed` / `cancelled`）、非公開化は `hide`、復元は `restore`。更新・非公開化・復元には照合時の `expectedVersion` を固定して指定する。最新レコードの読み取り例・JSON形式はREADME「締切情報」を参照。
- まず `npm run db:admin-import-deadlines -- --input <JSONファイル>` で読み取り専用dry-runを実行し、エージェント自身が対象ID・version・before/after・情報元・関連出演を確認する。その出力の `inputHash` を `--apply --reviewed-hash <inputHash>` に指定して確定する。人間承認は必須ではない。入力変更後は再度dry-run・確認する。手動UIと共通のAdmin write検証・競合検知・冪等性・変更履歴を利用し、直接SQLで通常更新しない。
- `superseded` / `rejected` は未反映として扱い、最新レコードと告知を再照合して入力を修正し、dry-runからやり直す。接続障害で結果が不明な場合は同じJSON・同じハッシュで確定を再試行する（承認済みなら冪等に結果を再取得）。確定は1件ずつで、完了分は残る。
- 巡回から見つからなくなっただけで非公開化しない。非公開化・復元は根拠を確認した明示操作に限定し、非公開レコードを自動復元しない。操作JSONはGit外の一時ファイルに置き、終了後に削除する。接続先を確認し、稼働中巡回の切り替えや本番スキーマ適用は通常の締切更新とは別作業として扱う。
