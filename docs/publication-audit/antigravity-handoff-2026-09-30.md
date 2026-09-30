# 公開日時不明の残存3件：Antigravity調査・反映手順

2026-09-30にDB全170件を確認。開始時のunknown 94件を91件改善（exact 84件、date 7件）し、残りは以下3件。音声作品のunknownは0件。通常のログイン済みChromeでXを検索・個別投稿を確認済み。検索で見つからないことだけを投稿削除の証拠にはしていない。

DB更新は既存Admin write経由で103件のapproved履歴を生成。更新対象98レコード以外の72件、更新対象のタイトル・開始日時・シリーズ・公開状態等は不変。全件の調査・情報元・before/version・反映後の履歴は `2026-09-30.json` を参照。接続情報・認証情報はこのファイルに含めない。

## 1. grand-blue-season-2（version 1）

- 対象：TVアニメ『ぐらんぶる』Season 2（声の出演）。現在precision unknown。
- 既存primary： https://www.raccoon-dog.co.jp/talent/r18-iida.html
- 既存identity：`official:raccoon-dog` / `profile:tv:grand-blue-season-2`。
- 調査：所属事務所プロフィール、アニメ公式、本人公式X。Chromeで `from:Iida_Hikaru_828 ぐらんぶる` / `#ぐらんぶる` / `ぐらん` / `from:raccoon_dog ぐらんぶる` / `飯田ヒカル ぐらんぶる` を確認。出演を示す第三者の視聴投稿はあるが採用しない。
- 確認したい内容：本人・事務所・番組公式によるSeason 2（女性店員等）の出演告知の個別URL、投稿者、本文、status ID、公開日時または公開日。
- Codexで確定できなかった理由：事務所プロフィールには掲載日がない。出演と個別発表の公開日を両方確認できる一次情報を発見できなかった。放送日・エンドロールの放送時刻・プロフィールのクロール日を公開発表日に代用しない。
- 次の探索候補：`@gb_anime`、本人の表記揺れ・2025年9月の告知、事務所の公式ニュース。公式本編・エンドロールを使う場合も、動画自体の公開メタデータと該当出演を両方確認する。

## 2. kaii-shojo-hanako（version 2）

- 対象：怪異少女：二つの顔（ハナコ）。現在precision unknown。
- 既存active情報元：
  - https://apps.apple.com/jp/app/%E6%80%AA%E7%95%B0%E5%B0%91%E5%A5%B3-%E4%BA%8C%E3%81%A4%E3%81%AE%E9%A1%94/id6504546717
  - https://www.raccoon-dog.co.jp/talent/r18-iida.html
- 調査：事務所プロフィールでリン・ハナコの担当を確認。国内収録担当の実績ページ https://logicalbeat.co.jp/work-info/21456/ を確認。Chromeで公式 `@SoulIdleJapan` の「飯田」「飯田ヒカル」「ハナコ」を検索。キャラクター登場・ハロウィン衣装の投稿は発見したが、該当ボイス担当の発表として確定できない。
- 確認したい内容：日本語版ハナコ役／リン役の飯田ヒカル出演を示す公式個別告知と、その公開日時・公開日。キャラクター画像や動画にCV表記がある場合は実際に確認する。
- Codexで確定できなかった理由：プロフィール・実績ページは日付を示さず、公式投稿で役名と飯田ヒカルの対応を示す公開日付き告知を特定できなかった。App Storeの初回配信日・更新日、キャラ実装日を公開日時に代用しない。
- 次の探索候補：日本運営・販売元Pole Position Games、公式動画・キャスト公開、収録会社の投稿日付き告知。
- 反映上の注意：既存active情報元2件を保存するため、新しい確認済み情報元をappendし、そのリンクを別操作でprimaryにする。

## 3. kanteishi-dungeon-tisse（version 1）

- 対象：最強の職業は勇者でも賢者でもなく鑑定士（仮）らしいですよ？～地下迷宮と謎の少女～（ティセ）。現在precision unknown。
- 既存primary： https://sunsoft.games/kanteishikari-game/top
- 既存identity：`official:sunsoft` / `game:kanteishikari-game:character:tisse`。
- 調査：SUNSOFT公式ゲームページのキャラクター欄で「ティセ CV：飯田 ヒカル」を確認。Chromeで `from:sunsoftgames ティセ` / `鑑定士` / `飯田ヒカル`、本人の「鑑定士」を検索。セール・他キャストのゲーム紹介投稿は、ティセの出演発表日時の根拠として採用しない。
- 確認したい内容：ティセ役飯田ヒカルを記載する公式個別ニュース・キャスト紹介・PV等と、その公開日時・公開日。アニメ側の別キャストとゲーム専用役を混同しない。
- Codexで確定できなかった理由：公式ゲームページは担当役を確認できるが、ページ公開日が掲載されていない。日時のある対応告知を特定できなかった。発売日・検索エンジンの相対クロール表示を公開日に代用しない。

## 調査結果の受け渡し形式

1件ずつ以下の情報をJSONまたはMarkdownに記載する。URL・投稿IDを推測しない。日時がなく日付まで確認できた場合はdateとする。Xの編集済み投稿は編集履歴の初回投稿IDを確認し、編集日時と区別する。

```json
{
  "appearanceId": "対象ID",
  "checkedVersion": 1,
  "canonicalUrl": "確認した個別一次情報URL",
  "sourceName": "公式情報元名",
  "externalItemId": "実際のstatus ID／記事ID／動画ID",
  "precision": "exact",
  "publishedAt": "実際に確認したISO 8601日時",
  "publishedOn": null,
  "author": "確認した投稿者・発行者",
  "evidence": ["本文の対象・出演者・公演／役の対応", "日時の確認方法", "確認した日時"],
  "unresolvedReason": null
}
```

日付のみの場合は `precision: "date"`, `publishedAt: null`, `publishedOn: "YYYY-MM-DD"`。開催日・発売日・配信開始時刻は代用しない。Snowflakeの日時だけが取れても、本文・投稿者・対象対応を確認できなければ反映しない。

## 既存フローへの反映

1. DBの最新レコード・active source links・versionを再読取する。本書のversionは調査時点の値なので、競合があれば最新状態と根拠を再照合する。新しいappearanceを作らない。
2. Git外の一時JSONへ `kind: "source"`, `operation: "replace"` または `"append"`, `targets: [{ appearanceId, expectedVersion }]`, `source: { canonicalUrl, sourceName, externalItemId, evidenceKey, precision, publishedAt, publishedOn }` を記載。replaceは既存activeリンクを全て無効にするため、複数リンクがある場合はappendを使用する。
3. `npm run db:admin-publication -- --input /tmp/publication-operation.json` で読み取り専用dry-run。対象ID・version・before/after・情報元・公開精度・他field不変をエージェント自身がレビューする。
4. 出力の `inputHash` を固定して `npm run db:admin-publication -- --input /tmp/publication-operation.json --apply --reviewed-hash "<inputHash>"` で確定する。入力を変更したらdry-runからやり直す。
5. appendした場合は、dry-runのafterに出る新しいsourceId/evidenceKeyで `operation: "primary"` の別JSONを作成。expectedVersionはappend反映後の値に更新する。primaryにもdry-run→レビュー→同じhashでapplyを行う。通常のSQL UPDATEは使用しない。
6. `approved`のみ反映済み扱い。`superseded` / `rejected` は再照合する。通信障害で結果不明の場合は同じ入力・hashで再試行し、Admin writeの冪等性で結果を取得する。
7. primaryとappearanceミラーのURL・公開精度・日時・source identity、version増分、approved proposal／revision、旧リンクactive状態、他appearanceと非公開状態の不変を再確認する。公開サイトの「今後」／履歴で情報元と公開日時を検証する。
8. 静的インポートに対象IDがある場合は `scripts/appearance-import-data/publication-corrections.ts` の公開情報6項目を同期し、公式source registryとの一致を検証する。公開日時不明件数を再集計し、残る対象と理由を記録する。test・lint・型チェック・build後、一時JSONを削除する。

## 今回の検証上の既存不整合

全体の `verify:production-readonly` は作業開始時から、無関係なGoogle News候補12件のcanonical identity欠落、および `bang-dream-our-notes` / `seifuku-kanojo-3` / `sugar-lies-game` のversion 3に対応するrevision欠落で失敗する。今回これらは変更していない。今回の103履歴・98更新レコードについては、primary・version・approved履歴・対象外72件と非公開／開始日時等の不変を別途検証した。
