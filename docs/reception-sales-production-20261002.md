# 受付・販売情報の本番反映記録（2026-10-02 JST）

0014 / 0015、本番互換アプリ、Admin / CLIの安全な更新、共有キャッシュ失効を確認し、Antigravityの既存巡回を切り替えた。最後に公式告知に基づく物販1件を登録した。

## 対象と隔離検証

- 作業開始時のmain / origin/mainは `6ad965edeedfd0a0c3617ae35c91bcf09243c1cd`。既存のゲスト・公開日時・締切・キャッシュ変更を保持し、0000〜0013は変更していない。
- 本番Neonは `long-silence-57673276` のmain。直接接続のホスト、DB名、migration 14件のhashとjournal時刻、最新データを再照合してから適用した。
- 既存restore branchは削除していない。既存プロジェクトのbranch上限を避け、非共有・本番アプリ未接続の無料一時プロジェクト `reception-migration-20261002` を使用した。
- ユーザーの明示承認後、本番をREAD ONLYで取得。認証試行データ・認証情報を除外し、必要な17テーブルと監査履歴だけを復元・比較した。Git外の一時ファイルはアクセスを制限した。
- 初回restoreは初期publicスキーマとの重複で停止し、単一transactionがrollbackした。隔離側だけのclean / if-exists付きrestoreに修正し、全17テーブルのコピー一致から検証を再開した。
- Drizzleで0014、0015を別々に順次適用。既存全列、監査JSONの配列順序、小数秒を含む日時、主情報元、関連リンク、fingerprint、versionが移行前後で一致した。追加列は中立的defaultのまま。
- 隔離検証後、一時Neon `twilight-bonus-86779814` / Vercel resource `store_w7VmlNbL92pOBwFZ` を削除した。Neonプロジェクト一覧でも削除を確認した。

| 比較対象 | 移行前 | 隔離0014後・0015後・本番移行後 |
| --- | ---: | ---: |
| 出演 | 170 | 170 |
| 既存締切 | 7 | 7 |
| 出演revision | 445 | 445 |
| シリーズrevision | 40 | 40 |
| 締切revision | 8 | 8 |
| 締切関連出演リンク | 17 | 17 |
| 締切情報元リンク | 8 | 8 |
| 情報元 / identity | 249 / 372 | 249 / 372 |

本番再照合でもコピー後の変更はなかった。本番へ0014→0015を順次適用し、各段階で比較を実行した。migration履歴は14→15→16件。既存データの根拠のない分類・日時補完や、監査履歴の作り替えは行っていない。

## アプリ・Git

- 実装commit: `2a12e922900c7ff79bcac6169ec5137fad32b6ec`「申し込み締切を受付・販売情報へ拡張する」。既存origin/mainへ通常push済み。
- 公式画像でアプリ経由の会場物販を確認し、既存 `online_sale` の表示を「通常通販・オンライン物販」と補足。配送・受注生産を断定しない説明を追加した。enum、入力hash、IDは変更していない。
- 表記commit: `ed0ced7df56bbc91786dd489e08b7039fa75568b`「オンライン物販を含む販売種別の表記を明確にする」。mainへ通常push済み。
- 初回はenv・認証情報・DBデータ・ログを含まない明示allowlistのソースをProduction / skip-domain候補へデプロイし、表示確認後にcanonicalへpromoteした。
- 初回互換候補: `dpl_BgE65ytZ3aU3w43y3CP9H5SDVbBr`。実装commitのGitデプロイ: `dpl_Fy6jmzacvqTPDkdZEauuhtJCJebi`。表記補足を含む確認時の本番: `dpl_72f6QhLNELuWxmsrBcgHvgkmyLHE`。いずれもReady。
- 本番URL: https://iida-hikaru-info.vercel.app 。既存の `/deadlines`、Admin、CLI名、キャッシュscope・失効URL・secret設定を維持した。
- 復旧は拡張データを読める互換候補へのrollbackまたはキャッシュOFFで行う。逆migrationでデータ・監査履歴を削除しない。

## 本番の更新フロー検証

既存 `pikanono-vol1-general-ticket` を最新readerで照合し、全業務項目・主情報元・関連出演が同じno-op JSONを用いた。

- CLI Previewでbefore / afterが完全一致し、primary維持、version1を確認。
- reviewed inputHash: `edc0e7981072e2ee4c417ee719f7e3a42c52346d5a1655291959609d38966915`。
- applyはapproved。proposal `dlp_ae692d68b6c9899af60f5d7123a155f4`、対象version2、締切revision合計8→9。業務項目・fingerprint・source・関連リンク・他テーブルは不変。
- 同一JSON / hashの再試行はreplayed:true、version2・revision合計9を維持。初回と再試行ともキャッシュ失効はinvalidated。
- Adminで新旧revisionとversion2、関連出演2件、primary、開始unknown / 終了exactを確認。変更なしの署名付きPreviewも成功した。
- Admin Previewの「変更を破棄」は既存仕様によりrejected監査proposal `dlp_fc3174d136996fa5f930335e959609ea` を1件残した。対象version2・業務項目/source不変・破棄理由・revisionなしを確認した。最終比較条件にこの監査記録を含めた。
- 失効直後のトップで最終DB更新日時が変わり、共有キャッシュの再fillを確認。公開状態計算と既存締切の17:00 / 23:59表示も維持した。

## Antigravity

アプリ・DB・CLI確認とmain pushの後、同じ会話 `4aaad3da-bb83-4fef-abf6-247896ab5255` の既存巡回指示を更新した。モデルはGemini 3.8 Flash High、プロジェクトと実行環境、出演更新経路を維持した。

- 旧 `task-2548` は2026-10-02 09:43:16 JSTに停止。
- 新 `task-2750` は稼働中1件のみ。9:00 / 15:00 / 22:00 JSTの1日3回を維持。設定直後の次回は2026-10-02 15:00 JST。
- 実タスクの出力でschedule成功・次回時刻・プロンプト全文、旧タスク出力でcancelledを確認。別のScheduled Tasks基盤は追加していない。
- 種別、開始・終了の独立精度、開始のみ／終了のみ／両方不明、終了不明、完売・中止・再販・延長、同一ID更新、一次情報根拠、primary・公開日時・ゲスト保持、重複照合、全fieldsとexpectedVersion、Preview→inputHash→apply、競合時の再照合、通信／失効障害時の冪等再試行を反映した。
- 設定変更中に追加巡回・DB更新・migration・デプロイ・環境変数変更を実行しないよう指示した。

## 実データ1件と公開確認

[ボイスラウンジ公式の個別X告知](https://x.com/voice_lounge/status/2105616212688314766)の本文と添付画像を確認。Event Orderアプリで購入する会場物販の事前販売として登録した。製造方式・配送方法・終了時刻は補完していない。

- ID: `pikanono-vol1-goods-presale`、受付名「グッズ事前販売」。
- 開始: **2026-10-01 21:00 JST / exact**。終了: **unknown、日時・日付ともnull**。告知日時はSnowflakeから `2026-10-01T11:10:00.219Z` を復元。
- 主情報元: `x:voice_lounge` / ポストID `2105616212688314766` / evidence key `goods-presale`。
- 種別 `online_sale`、状態scheduled / 自動判定、初回。既存の昼・夜公演2件へ関連付け。新しい出演レコードは作成していない。
- 重複照合・Preview後、hash `baf724e412ded71985082cc079817acf1736f9337b7f5abc0bac48fd170b9142` で確定。approved、version1、proposal `dlp_703034365c7263137231e8d70439ffba`、キャッシュ失効invalidated。
- トップの販売枠・一覧の終了日時未確認グループ・フリーワード＋種別＋2026年検索に「販売中」「21:00」「終了日時未確認」を表示。終了不明の年検索は開始年を使用。
- 10月1日のカレンダーには「販売開始」1件だけを表示し、架空の終了日を作っていない。関連する10月11日の出演にも既存チケットと物販への導線を確認。
- Adminで開始exact / 終了unknown、primary、関連出演、version1・revisionを確認。
- 最終DB比較: 出演170、受付・販売8、出演revision445、締切revision10、締切関連出演19、締切情報元9、情報元250、identity373、締切proposal11。追加物販、検証no-opとAdmin破棄監査以外の既存値は不変。
- 現行本番ログで共有キャッシュfill `appearanceCount:170, deadlineCount:8` を確認。確認期間のerrorログはなし。

## テストと残事項

実装検証で締切57、締切DB17、共有キャッシュ6、キャッシュruntime4、新着UI13、巡回37、Admin25、ゲストUI8＋DB23、公開日時14テストが成功。lint・型チェック・buildも成功。表記補足後、締切57とlint・型チェック・buildを再実行して成功した。

一時Neonは削除済み。比較用dump・スナップショット・接続ファイル・操作JSON・実行ログ・一時デプロイソースは削除済み。秘密情報やruntimeデータをGitへ含めていない。

販売終了日時・期間延長・完売等は今後の個別一次情報を巡回で確認し、同じIDで更新する。終了不明は無期限販売の保証ではない。0014/0015適用済みの本番は旧14 migration専用の `verify:reception-migration` の対象外であり、この検証コマンドは停止する設計である。
