# ゲスト情報0013 本番反映結果

2026-09-30、本番DBへ0013を適用し、ゲスト機能を含むアプリを本番へ昇格した。本番ゲストデータの補完は実施していない。

## 隔離検証とDB適用

本番Neonの元の10ブランチは、本番・復旧用途のまま保持した。削除・リセット・設定変更はしていない。Neon CLIによる別プロジェクト作成はVercel管理組織の制約で拒否されたため、既存Vercel Marketplace連携から無料の一時Neonを作成した。`--no-connect --no-env-pull` により、本番アプリへの接続と環境変数の変更を行わなかった。

Postgres 18の直接接続で本番を読み取り専用のpg_dumpで取得し、一時DBへ復元した。接続文字列・パスワードはログ、引数、Git、デプロイ内容、完了記録へ出力せず、権限制限したGit外の一時ファイルと子プロセス環境で受け渡した。

| 確認項目 | 本番コピー前 | 隔離コピー後 | 隔離0013後 | 本番0013後・スモーク後 |
|---|---:|---:|---:|---:|
| 既存出演 / public出演 | 170 / 170 | 170 / 170 | 170 / 170 | 170 / 170 |
| migration履歴 | 13 | 13 | 14 | 14 |
| canonical identity欠落 | 12 | 12 | 12 | 12 |
| revision不整合 | 3 | 3 | 3 | 3 |
| guest_info未確認 | 列なし | 列なし | 170 | 170 |

コピーした19テーブルの件数・内容の指紋は本番と完全一致した。0000〜0012の履歴hash・日時はリポジトリと一致し、未適用は0013のみだった。Drizzleのマイグレーターで隔離側に0013だけを適用し、出演・提案へのguest_info追加と履歴の1件追加を除き、全テーブルの内容が一致した。本番適用直前にも同じ基準を再照合し、適用後の状態が検証済み隔離DBと一致することを確認した。

既存170出演の内容の指紋（guest_infoを除外）は適用前後とも `fe9f360373a4b0b50b6b6608694edbe1`。出演データ、公開日時、情報元、version、公開状態、新着順に関係する既存値は変更していない。全170件は `isHikaruGuest: null, guestNames: []`、既存提案のguest_infoはNULLのまま。

## 機能検証

隔離Neonにだけ新規の確認用3件を作り、10回のAdmin確定操作で以下を検証した。既存170件と関連情報元・identity・source linksは操作前後で一致した。

- 本人ゲスト＋複数の他ゲスト、確認済み通常出演＋他ゲスト、未確認を別々に保持。
- 根拠なしのゲスト更新は書き込まず拒否。Preview前後で全publicテーブルが一致。
- secondaryの根拠追加・既存primary根拠の再利用で、primary情報元・公開日時・収集日時を維持。
- 冪等な再実行、古いversionの競合拒否、guestInfo省略時の保持。
- グループ更新・非公開化・復元で公演ごとのゲスト情報を維持。
- 実際の公開readerによるゲスト情報取得とゲスト名検索。

検証用Node起動ではNext.jsのclient navigation contextがreact-server条件で初期化できなかったため、検証起動時だけNext.js自身のserver redirect/notFoundを参照するアダプターを使用した。アプリは変更せず、DB・Admin write・公開readerは実際の実装を実行した。HTTP/ブラウザー確認は通常のNext.jsアプリで実施した。

ゲスト回帰テスト25件、lint、TypeScript型チェック、ローカルbuildが通過した。Vercel上のbuildも成功した。

## デプロイ・スモークテスト

- 本番: https://iida-hikaru-info.vercel.app/
- デプロイ: https://iida-hikaru-info-id6x7c1t5-seten351.vercel.app/
- deployment: `dpl_7CXUuLeo6UDfThdxdinRm2iFmFZE`、READY、CLIから反映。
- 旧本番: `dpl_9SfQCJbEtN6Q8QiXwvGxtwDMW3At`。アプリの復旧先として保持。
- デプロイ元のSHA-256 manifest指紋: `c411687115d7d5ee4e042268eb0cc817e1bd6be6b5c82807ec5dcaa58f8e4095`。

デプロイ入力はsrc/public、ビルド設定、packageファイルに限定し、接続情報、DBコピー、検証スクリプト、調査資料、データ投入スクリプトを除外した。データimportは実行していない。`--prod --skip-domain` で候補を作成し、canonicalな本番ドメインが旧deploymentを指していることを確認した。

候補のトップ、新着一覧、予定、履歴2ページ目、既存キーワード検索、未登録ゲスト名検索、カレンダー、Admin入口の8経路でHTTP 200と正常表示を確認してからpromoteした。昇格後、本番ドメインが新deploymentを指すことを確認した。

本番ブラウザーでは、トップの新着の全文・順序・公開日時・情報元リンクと履歴の全文が切り替え前と一致した。検索操作（カンナヒカル17件）、未登録ゲスト名0件、新着一覧、予定、履歴2ページ目、カレンダーの9月29日選択による2件の詳細表示を確認した。未確認データにゲストラベルが追加されていない。ブラウザーconsole errorは0件。

デプロイ後とpromote後に、既存Admin importの `--input` dry-runで `kannahikaru-episode-16` のゲスト更新をPreviewした。既存primary根拠を引き継ぎ、before/afterの公開日時・情報元が一致した。意図的なreviewed hash不一致はDBの確定操作に到達する前に拒否された。全テーブルの件数・内容の指紋が一致し、本番へのゲスト更新・提案作成は行っていない。

新deploymentに限定したスモーク期間のVercel errorログは0件。最終DB検証でも170件すべて未確認、migration14件、既存不整合12件・3件、全既存テーブルの不変を確認した。

## 既存問題と残作業

canonical identity欠落12件、revision不整合3件は0013以前から存在し、同じID集合のまま。今回の修正対象には含めていない。revision不整合は `bang-dream-our-notes`、`seifuku-kanojo-3`、`sugar-lies-game`。公開日時監査の資料・修正は別作業として保持し、このゲスト機能のコミットには含めない。

本番ゲスト情報の調査・投入、170件の一括補完は未実施。確認した情報だけを既存Admin writeのdry-run→reviewed hashで後続作業として更新する。表記が見つからないだけでfalseにしない。

本番反映時点ではCLIのみを使用し、Gitへのcommit/pushは行っていなかった。その後のGit確定作業では、ゲスト機能・0013・更新フロー・テスト・運用説明・この反映記録だけを対象とする。音声作品データ・公開日時監査CLI・情報元レジストリ拡張はコミット対象から除外し、元の作業ツリーに保持する。

Git確定前に、本番deploymentが上記のREADYなCLI反映であることと、当時のデプロイ元107ファイルのmanifestが現在の作業ツリーと一致することを確認した。ゲスト機能のコードは変更せず、混在していた情報元レジストリ拡張とpackageの監査CLI設定を除いたゲスト専用のステージ内容を一時ディレクトリへ取り出して検証した。ゲスト25件・Admin25件・新着UI11件のテスト、lint、型チェック、buildが成功した。Adminテストはsandboxがtsx CLIのIPCを拒否したため、同じテストファイルを `node --conditions=react-server --import tsx --test` で実行した。これらの除外差分はゲストUI・検索・Admin writeには関与せず、本番データの補完や公開日時更新は行っていない。本番DBの0013のhash・履歴日時、170件の未確認状態、既存出演内容の指紋も再確認した。

## 後片付けとローカル環境

一時NeonはMarketplaceのresource removeで削除し、Neon一覧から消えたことと、元の10ブランチ（ready 2、archived 8）の保持を確認した。既存連携のアンインストールや本番のdisconnectはしていない。CLIが自動更新したNeonスキル・skills-lock.jsonは作成前へ戻した。

一時ディレクトリ内の接続情報、dump、HTML、検証用スクリプト、デプロイ用コピーを削除し、検証用ブラウザータブを閉じた。接続情報はGitに追加していない。

Postgres18のdump/restore対応のため、ローカルHomebrew libpqを17.2→18.6へ更新した。Homebrewの自動依存更新によりkrb5、PHP（8.4.1_1→8.5.10）と依存パッケージも更新された。これはアプリ・本番DBとは別のローカル環境変更で、サービスの起動・再起動コマンドは実行していない。
