# 既知DB不整合の読み取り調査・隔離検証（2026-10-03）

本番は変更していない。最新main `eeafb8170dcc74d810cddf1f31d9921de64585c6` とorigin/mainの一致、作業開始時の変更なし、本番接続先、migration 0000〜0015の16件のhash一致を確認した。設定済み本番DBをREAD ONLY / Repeatable Readで取得し、既存170出演・受付販売8件、ゲスト、公開・visibility日時、source links、version、proposal/revisionを含む17テーブルの生値指紋を比較した。

## canonical identity不足12 source

12件すべてidentity行0・canonical行0。公開出演linkと受付販売linkは0で、Google News RSSの発見候補を保存する非primaryのproposal linkだけがある。候補のURLとsourceのcanonical URLは一致し、proposal linkの`source_identity_id`はNULL。保存された`candidate.key`は`news:/rss/articles/...`だが、`sourceName`・`externalItemId`は保存されていない。

原因は`scripts/patrol/store.ts`の`enqueue`がsourceとproposal linkを作成し、identityを作成しないこと。source全件にcanonical identityを要求する既存検証と、未検証候補の保存仕様が一致していない。公開データのprimary対応が破損している状態ではない。

| source ID | 巡回proposal link数 | identity / canonical | 公開出演 / 受付販売link |
|---|---:|---:|---:|
| `src_00116e531e6f5da440b4cfc520318550` | 1 | 0 / 0 | 0 / 0 |
| `src_09efbcb8dafeaf689346b1b8aebef532` | 1 | 0 / 0 | 0 / 0 |
| `src_3c89e520433e02153f4a08245f5a08ae` | 2 | 0 / 0 | 0 / 0 |
| `src_6af267e4acc201c07126176969f83f9e` | 2 | 0 / 0 | 0 / 0 |
| `src_80d0ab87d7eec6263482ab76665332c5` | 1 | 0 / 0 | 0 / 0 |
| `src_9bccd6aca353c535d0775099f3673299` | 3 | 0 / 0 | 0 / 0 |
| `src_a574834f4990febc86ae185d7ced452a` | 1 | 0 / 0 | 0 / 0 |
| `src_a815ea54e8d7beaa8f33413eb5d9921c` | 1 | 0 / 0 | 0 / 0 |
| `src_adbc94fd9a30aeabff3841cb9895aa1c` | 1 | 0 / 0 | 0 / 0 |
| `src_b1ae84d3342b823be2e4867060be9d80` | 1 | 0 / 0 | 0 / 0 |
| `src_d4f4b74b7bca11b358b35c43891cf58c` | 2 | 0 / 0 | 0 / 0 |
| `src_fa6b7562c12a0d4a937caf2f27121c42` | 1 | 0 / 0 | 0 / 0 |

期待する整合状態は、各canonical URLに一意なcanonical identityを持ち、既存source ID・URL・sourceName / externalItemIdの組・各linkの対応を維持すること。ただし現データからsourceNameの規約を一意に復元できない。`candidate.key`を外部IDへ転用したり、RSSの転送先を推測してURLを置換・統合したりしていない。

既存Adminのsource操作は出演を対象にappend / replace / primary / unlinkを行う経路で、未登録候補sourceだけの補完経路ではない。公開出演を新規作成・更新して補完する方法は対象外の変更を生む。12件は据え置き。候補sourceのidentity規約・検証対象の扱いを設計し、巡回保存と検証を合わせる別対応が必要。今回、巡回基盤・検証基準・source linksは変更していない。

## revision chain不整合3件

| appearance ID | 現version | 既存revision | approved proposalのexpectedVersion | 現在primary / 公開日時（UTC） |
|---|---:|---|---|---|
| `bang-dream-our-notes` | 3 | 1, 2 | NULL, 1 | [本人X](https://x.com/Iida_Hikaru_828/status/2103119925682557035) / `2026-09-24T13:50:39.018+00:00` |
| `seifuku-kanojo-3` | 4 | 1, 2, 4 | NULL, 1, 3 | [公式X](https://x.com/seifukubu_love/status/2047239180934398110) / `2026-04-23T09:00:31.256+00:00` |
| `sugar-lies-game` | 6 | 1, 2, 4, 5, 6 | NULL, 1, 3, 4, 5 | [公式X](https://x.com/DEAR_MF_PR/status/2092899927751836101) / `2026-08-27T09:00:01.633+00:00` |

3件ともrevision 3とexpectedVersion 2のapproved proposalが存在しない。旧revision 2の題名は「ゲーム『…』」、現値と後続revisionでは「『…』」。9月28日の題名整理commit `2cec871f73c4a7a149b24e19517348989c9ff9ba` は、この3IDの接頭辞除去を記録している。監査を伴わない題名・version更新が原因と考えられるが、Gitの静的データ差分だけでは本番で実行されたSQL・操作時刻・全変更列は確定できない。既存proposalとrevisionだけで欠落操作を承認済みとして復元しない。

revision 2に対応する既存approved proposalは、それぞれ `prp_1f27d5538764e9e58fe6cffcb34d976f`、`prp_2759b640606e3bdcb185460204e6ee79`、`prp_413ed1e6818de76a6017f0fea78c22ed`。制服カノジョとSugar Liesには、さらに過去の重複統合由来とみられるsource linkがあり、後続のsource置換・補助根拠追加も保存されている。現リンク集合をそのまま過去version 3の集合として扱うことはできない。

| ID | first_visible_at / visibility_changed_at（両者は同値、UTC） | created_at（UTC） | updated_at（UTC） |
|---|---|---|---|
| `bang-dream-our-notes` | `2026-09-25T06:03:51.225+00:00` | `2026-09-25T06:03:50.547799+00:00` | `2026-09-26T04:34:39.52+00:00` |
| `seifuku-kanojo-3` | `2026-09-22T13:45:14.676+00:00` | `2026-09-22T13:45:14.101099+00:00` | `2026-09-30T08:10:57.338+00:00` |
| `sugar-lies-game` | `2026-09-22T13:54:55.288+00:00` | `2026-09-22T13:54:54.623168+00:00` | `2026-09-30T08:13:37.914+00:00` |

3件ともゲスト情報は`isHikaruGuest: null, guestNames: []`、visibilityはpublic。出演精度は順にdate（2026-09-24）、date（2026-09-10）、unknown。primaryミラー、公開日時、リンクのsource / identity対応は正常。primaryを含むactive / inactive全リンク、proposal、全revision snapshotを読み取り、日時をJavaScript Dateで書き戻していない。

期待するchainはversion 1〜現versionの連続と、現versionを表すrevisionの存在。ただし、次の二つは区別する。

- `bang-dream-our-notes`は現在もversion 3。現在の生DB値を、過去操作の復元ではなく「後日観測した現在versionの記録」と明示して追加する候補を隔離検証した。
- `seifuku-kanojo-3`と`sugar-lies-game`のversion 3は過去状態。完全な当時のsnapshot・操作時刻・承認根拠が不足するため、欠番補完を拒否した。既存approved proposal/revisionの削除・番号変更・上書き、現versionの巻き戻しは行っていない。完全な当時のDBコピー・操作記録が必要。

## 隔離検証と本番停止点

検証コード・テスト・実行コマンドのcommitは `a7cd2fb102d9791862f60a5e2abf87a87f2c202b`（既知DB不整合の読み取り専用調査と隔離検証を追加する）。再実行は `npm run test:known-integrity-isolated` と `npm run verify:known-integrity-isolated`。後者は設定済みDBを読み取り、隔離側でのみ候補を追加・検証する。

新規`scripts/verify-known-integrity-isolated.ts`は、本番からREAD ONLYで必要なデータを取得し、migration hashを確認してメモリ内PGliteへ復元する。本番のwriter・apply引数・migration追加はない。観測候補の追加関数も実行時にPGlite以外を拒否する。

コピー範囲は出演3、シリーズ3、source22、identity11、appearance link11、proposal27、proposal link27、revision10。過去snapshotのJSON配列順序と日時小数秒を維持し、復元指紋は `8d3f4ebf4f0ca3302b6f4f8cbfe5deefb68f3c0095ca243c776d1a639e2c29a4` で一致した。このCLIのコピーはメモリだけで扱い、ファイルに保存しない。初回の読み取り調査で取得した対象値は権限制限したGit外の一時ファイルに置き、作業終了時に削除した。

観測候補はrevision 3を1件だけINSERTする。既存appearanceのversion・updated_at・ゲスト・各日時、source / identity / links、proposal、revision 1〜2は変更しない。snapshot schema 4で各日時を生DB文字列のまま保存する。actorは`integrity-repair-observation`、proposalはNULL、`repairMetadata`に後日観測であること・reviewedHash・過去操作時刻とproposalを復元していないことを記録する。新revisionのcreated_atは新しい観測記録の作成時刻であり、元の操作時刻とは称しない。

Preview hashはappearance・全linkとsource / identity・series・既存proposal/revisionを含む。今回検証したhashは `4ce2f8efdbc4a21fbc5e16214f981b9a8f18b6fe627cd49e245c414add349dea`。本番適用の承認hashではなく、現在状態から候補を生成した隔離検証用hash。

トランザクション内のhash再照合、異なるhashの拒否、値・リンク・過去履歴・version変化の拒否、履歴INSERT失敗時の全体rollback、既存履歴の完全保持、再実行時の追加なし、過去欠番の拒否が通過した。隔離追加後にbang-dreamのversionとrevision数は3で一致し、他2件の欠番は保持した。

既存のAdmin更新は新しいversionとrevisionを作るため、過去欠番を埋める用途には使えない。観測候補も新しい記録方式なので本番未適用で停止した。採用する場合は後日観測の意味を確認し、本番用の専用Preview / hash / apply、対象・依存行の競合ロック、監査の表示・再実行の扱いを実装して再検証する必要がある。過去の履歴が復元されたと誤認させないことが採用条件。

## 検証と不変確認

- 関連回帰テスト: public UI 57、guest 31、publication 14、deadlines 60、deadlines DB 17、patrol 37、Admin 25、隔離観測3。計244件成功（同じテストを含むコマンド間の重複実行を含む）、失敗・skipなし。
- lint、`tsc --noEmit`、build成功。
- 本番の全17テーブル指紋は開始前後で同一。出演170、受付販売8、source251、identity374、appearance link342、appearance proposal420、appearance revision446、deadline revision17を保持。既知canonical不足12・chain不整合3のID集合も同一。
- 出演primary・ミラー・source/identity対応・日時精度・event group、シリーズchain、受付販売primary・identity対応・chainの検証は違反0。既存の全体検証が要求するcanonical全件・appearance chain全件の完全正常化は未達。新しい検証でも既知の件数・ID以外の異常は拒否する。
- 操作JSON・DB取得コピー・検証ログなどの一時ファイルは作業終了時に削除。追加した検証コード・テスト・監査文書だけを成果物として保持する。

## 結果

**修正済み**: 受付販売UI文書、READMEの170件監査に関する時点表記、旧ゲスト記録の後続結果参照、既存データ差異3件の[最新結果追記](guest-audit/2026-10-01.md)。第106回の日時修正は前回作業で確定済みで、今回は再更新していない。

**据え置き**: source12件、revision chain3件、`small-childhood-friend-night`（作品名対応未確定）、`yuri-relation-game-27`（最新DB・revisionは公式日付と一致）。本番の書き込み・直接SQL修復は0件。

**要別対応**: 巡回候補identityの規約と検証仕様、bang-dreamの後日観測方式の採否と本番専用経路、制服カノジョ3 / Sugar Liesの当時の完全な履歴根拠、音声作品の名称対応。新規migration・アプリデプロイ・Git pushは行っていない。
