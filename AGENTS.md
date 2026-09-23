<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Rules

## Command Execution
- 本プロジェクトで使用するコマンド（テスト、ビルド、スクリプト実行、DB操作・反映など）は、ユーザーへの事前確認を行わずにすべて自動で即座に実行する。

## Information Sources & Publication Date/Time Rules
- **公開発表日時（`published_at`）を安易に「日時不明」としないこと**:
  - 公式X（旧Twitter）等の告知・投稿日時を確認し、正確な発表日時を設定する。
  - XのポストID（Snowflake ID）から正確な投稿日時を復元・確認し、ISO 8601形式（`precision: "exact"`）で登録する。
- **情報元URL（`source_url` / Primary Source Link）の個別化・具体化**:
  - 公式サイトのトップページやプラットフォームのトップURL（`https://...` トップ等）など、個別発表内容や日時が判別できない汎用URLは情報元として使用しない。
  - 個別の告知記事・ニュースページが存在しない、または判別できない場合は、公式X（旧Twitter）の告知ポストURL（`https://x.com/.../status/...`）を情報元リンクとして登録すること。
