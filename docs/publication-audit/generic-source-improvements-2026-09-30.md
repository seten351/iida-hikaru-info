# 情報元リンク改善（2026-09-30）

170件と全320 source linksを確認し、15 appearanceを既存Admin writeで更新。11件の主な情報元を個別記事・公式告知に改善し、4作品の汎用補助リンクを整理。20件のapproved履歴。対象外155件と開催日時・タイトル・シリーズ・公開状態は不変。

## 個別化した主な情報元

| 対象 | 確認済み情報元 | 公開精度 |
|---|---|---|
| さえすずイベント | [x:onsenradio](https://x.com/onsenradio/status/2074840747455766865) | exact |
| カンナヒカル（仮）イベント | [x:onsenradio](https://x.com/onsenradio/status/2059212952524460108) | exact |
| 長月あおいのONE AND ONLY イベント | [x:onsenradio](https://x.com/onsenradio/status/2059212952524460108) | exact |
| 『制服カノジョ3』（八尋実咲 役） | [x:seifukubu_love](https://x.com/seifukubu_love/status/2047239180934398110) | exact |
| 『Sugar Lies』（雪平明星 役・主題歌歌唱） | [x:dear-mf-pr](https://x.com/DEAR_MF_PR/status/2092899927751836101) | exact |
| 学園アイドルマスター The 2nd Period Hatsuboshi IDOL FESTIVAL DAY1 | [official:idolmaster](https://idolmaster-official.jp/news/01_17315) | date |
| 学園アイドルマスター The 2nd Period Hatsuboshi IDOL FESTIVAL DAY2 | [official:idolmaster](https://idolmaster-official.jp/news/01_17315) | date |
| 学園アイドルマスター 初星音楽祭 DAY1 | [official:idolmaster](https://idolmaster-official.jp/news/01_16742) | date |
| 学園アイドルマスター 初星音楽祭 DAY2 | [official:idolmaster](https://idolmaster-official.jp/news/01_16742) | date |
| 学園アイドルマスター クラス対抗初星大運動会 DAY1 | [official:idolmaster](https://idolmaster-official.jp/news/01_15744) | date |
| 学園アイドルマスター クラス対抗初星大運動会 DAY2 | [official:idolmaster](https://idolmaster-official.jp/news/01_15744) | date |

Sugar Liesは個別CAST告知をprimaryとし、個別キャラクター紹介と主題歌告知も保持。既存キャラ紹介の誤日時を2026-08-30T03:00:00.344Zへ修正。Le Mirage、東京ワルキューレ、空の軌跡the 2nd、東方LostWordの汎用補助URLをinactiveとし、他の個別根拠を保持。

## 個別発表へ置き換えられなかった根拠

- **TVアニメ『ぐらんぶる』Season 2（声の出演）**：出演を確認できる一次情報は事務所プロフィール。前回と今回の公式告知検索で対応する個別発表を特定できず、唯一の出演根拠を削除しない。公開日時unknownを維持。 [現行の根拠](https://www.raccoon-dog.co.jp/talent/r18-iida.html)
- **怪異少女：二つの顔（ハナコ）**：primaryは作品を特定するApp Store詳細。補助の事務所プロフィールに役名リン／ハナコの出演実績があり、個別キャスト告知を特定できない。録音会社の個別実績ページlogicalbeat.co.jp/work-info/21456/には飯田ヒカルの記載なしのため代替しない。公開日時unknownを維持。 [現行の根拠](https://www.raccoon-dog.co.jp/talent/r18-iida.html)
- **最強の職業は勇者でも賢者でもなく鑑定士（仮）らしいですよ？～地下迷宮と謎の少女～（ティセ）**：公式作品ページにティセCV飯田ヒカルの出演根拠はあるが、独立した個別キャスト記事／対応する公式告知投稿を特定できない。日付のない作品ページを根拠として維持し、公開日時unknownを維持。 [現行の根拠](https://sunsoft.games/kanteishikari-game/top)

上記3件は既存の [Antigravity引き継ぎ](antigravity-handoff-2026-09-30.md) に対象・調査・反映手順を記載済み。最新versionは今回変更なし。架空のリンクや日時で置き換えない。

## 検証

- DB：primaryミラー・source identity・version増分・20 revision/proposalを確認。非対象155件のレコードとsource linksは全項目不変。
- 公開サイト：新着一覧6ページで15 appearanceに対応する12カードを確認。activeリンクと公開日時がDBに一致し、旧inactiveリンクは表示なし。
- 静的インポート153件を検証し、補正データも同期。通常テスト64件、Adminテスト25件、フィルタ検証・lint・型チェック・build成功。
- 全体DB検証は以前からのsource identity欠落12件とrevision3欠落3件で失敗。今回作成した20履歴は正常。欠けた過去履歴を捏造・追加していない。

詳細のbefore/after・情報元・レビュー済みhash・approved履歴は [JSON調査記録](generic-source-improvements-2026-09-30.json) を参照。
