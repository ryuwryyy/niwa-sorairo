# 参照画像ソース調査 — Pinterest / Adobe Stock / 広告賞アーカイブ / 自前アップロード

- 調査日: 2026-09-18
- 対象: アプリ内埋め込み検索 UI（検索窓 → 結果グリッド → 「ムードボードに追加」）を、自前の Vercel Serverless プロキシ経由で実装するための技術・法務調査
- 方針: API キーは必ずサーバー側（`process.env`）。`VITE_` 接頭辞は絶対に付けない（既存 `api/claude.js` と同じ運用）

---

## 0. 調査環境の制約（重要・先に読むこと）

本調査は egress proxy 配下で実施しており、以下の公式ドメインへ**直接 HTTP アクセスできなかった**（組織ポリシーによる 403）:

`developers.pinterest.com` / `developer.pinterest.com` / `www.pinterest.com` / `i.pinimg.com` /
`developers.google.com` / `developer.adobe.com` / `stock.adobe.io` / `lovethework.com` / `canneslions.com` /
`en.wikipedia.org` / `cheatsheetseries.owasp.org`

そこで、**一次情報として同等の権威を持つ以下の到達可能なソース**で API 形状を検証した:

| 検証に使った実取得ソース | 何の一次情報か |
| --- | --- |
| `https://www.googleapis.com/discovery/v1/apis/customsearch/v1/rest` | Google Custom Search JSON API の **公式 Discovery Document**（`revision: 20260916`）。パラメータ・enum・レスポンススキーマの機械可読な正本 |
| `https://raw.githubusercontent.com/pinterest/pinterest-python-generated-api-client/main/docs/*.md` | Pinterest 公式 org が OpenAPI 仕様から自動生成している公式クライアントのドキュメント |
| `https://raw.githubusercontent.com/pinterest/api-quickstart/main/README.md` | Pinterest 公式 org の OAuth クイックスタート |
| `https://raw.githubusercontent.com/WordPress/WordPress/master/wp-includes/class-wp-oembed.php` | WordPress core が登録している Pinterest oEmbed エンドポイント（実装による裏取り） |
| `https://raw.githubusercontent.com/pajenterprise/stock-api-docs/master/docs/**` | Adobe 公式ドキュメントリポジトリ `AdobeDocs/stock-api-docs` のミラー（fork）。本家 master は新サイト構成へ移行済みで該当 md が消えているため fork を参照 |
| `https://raw.githubusercontent.com/OWASP/CheatSheetSeries/refs/heads/master/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.md` | OWASP SSRF 防御チートシートの原本 Markdown |

上記で裏が取れなかった項目（レート制限の実数、実 HTTP ヘッダの挙動、CDN の CORS 設定など）は本文中に **（未確認）** を付けた。付録 X に一覧がある。

---

## 1. 結論サマリ（TL;DR）

1. **Pinterest の「全 Pinterest 横断検索」は、一般の開発者アプリでは実質不可能。**
   `GET /v5/search/pins` は *認証ユーザー自身の Pin* しか検索しない。全体検索に相当する `GET /v5/search/partner/pins` は「現在ベータで全アプリには提供されていない」と公式ドキュメントに明記されている。
2. **Pinterest の公式 oEmbed エンドポイントは存在する**（`https://www.pinterest.com/oembed.json`）。タスク時点の想定（「無いのでは」）は誤りで、URL 貼り付けインポートはここを使うのが最も筋が良い。
3. **Pinterest 検索ウィジェットは存在しない。** 公式アドオンは Save / Follow / Pin / Board / Profile の 5 種のみ。
4. **Google Custom Search JSON API は 2027-01-01 に終了予定、かつ新規顧客受付を停止している。** さらに新規作成の Programmable Search Engine は「ウェブ全体を検索」が選べず最大 50 ドメインに制限。**新規プロジェクトでは採用不可の前提で設計すべき。**
5. **Adobe Stock Search API は API キーのみ（ユーザートークン不要）で検索できる。** ここは一番素直に動く。ただし **Adobe Stock Developer Terms 第 9 条が「Adobe Stock Works およびそのメタデータを機械学習・AI 目的で使うこと」を明確に禁止**しており、本アプリの「AI 画像生成の参照」という用途と正面から衝突する。用途の切り分けが必須。
6. **Pinterest の Developer/API ToS も、API データの保存（キャッシュ）と AI 学習利用を禁止**している（2026-08-18 改定で AI 学習禁止が明文化）。
7. **Cannes Lions には公開 API が無い。** 公式アーカイブ `lovethework.com` は LIONS Membership 課金の会員制。→ **画像を再ホストせず、キュレーションしたメタデータ + 外部リンク**で提示する設計が唯一安全。
8. 以上より、**確実に動くのは (C) Adobe Stock と (D) 自前アップロードの 2 本**。Pinterest は「URL 貼り付けインポート（oEmbed）」に縮退させ、広告賞は「メタデータ + 外部リンク」に縮退させるのが現実解。

---

## A. Pinterest

### A-1. Pinterest API v5 — 公開 Pin 検索は存在するか

#### A-1-1. 結論

**一般の開発者アプリが使える「Pinterest 全体の Pin 検索」は存在しない。**

Pinterest 公式が OpenAPI から自動生成しているクライアントの `SearchApi` は、v5 に検索系が 3 本しかないことを示している:

| メソッド | HTTP | 説明（公式原文） |
| --- | --- | --- |
| `search_partner_pins` | `GET /search/partner/pins` | Search pins by a given search term |
| `search_user_boards_get` | `GET /search/boards` | Search user's boards |
| `search_user_pins_list` | `GET /search/pins` | Search user's Pins |

出典: <https://raw.githubusercontent.com/pinterest/pinterest-python-generated-api-client/main/docs/SearchApi.md>
（正本ページ: <https://developers.pinterest.com/docs/api/v5/search_user_pins-list/> / <https://developers.pinterest.com/docs/api/v5/search_partner_pins/>）

ベース URL は `https://api.pinterest.com/v5`。

#### A-1-2. `GET /v5/search/pins` — 何を検索するのか

公式の説明文（原文）:

> Search for pins for the "operation user_account". - By default, the "operation user_account" is the token user_account. If using Business Access: Specify an `ad_account_id` to use the owner of that ad_account as the "operation user_account".

つまり **アクセストークンの持ち主（または指定した ad_account のオーナー）が保存している Pin の中だけ**を検索する。Pinterest 全体は検索しない。ドキュメントページのタイトルも "Search user's Pins"。

リクエストパラメータ:

| 名前 | 必須 | 型 | 説明（公式原文） |
| --- | --- | --- | --- |
| `query` | 必須 | string | Search query. Can contain pin description keywords or comma-separated pin IDs. |
| `ad_account_id` | 任意 | string | Unique identifier of an ad account. |
| `bookmark` | 任意 | string | Cursor used to fetch the next page of items |

- 認可: `pinterest_oauth2`（ユーザー OAuth トークン）
- レスポンス: `200 Success` / `404 User not found`
- 返却モデル: `Pin` の `Paginated`（`{ items: [...], bookmark: string|null }`）

#### A-1-3. `GET /v5/search/partner/pins` — パートナー限定か

公式の説明文（原文）:

> **This endpoint is currently in beta and not available to all apps.** Get the top 10 Pins by a given search term.

→ **実質パートナー/ベータ限定。**一般申請で通る保証はない（申請導線は "beta and advanced access" ドキュメント）。

| 名前 | 必須 | 型 | 説明 |
| --- | --- | --- | --- |
| `term` | 必須 | string | Search term to look up pins. |
| `country_code` | 必須 | string | Two letter country code (ISO 3166-1 alpha-2) |
| `bookmark` | 任意 | string | Cursor used to fetch the next page of items |
| `locale` | 任意 | string | Search locale. |
| `limit` | 任意 | int | Max search result size（省略時サーバー既定値 `10`） |

- 認可: `pinterest_oauth2`
- 返却モデル: `SummaryPin` の `Paginated`
- レスポンス: `200 Success` / `400 Invalid pins`

#### A-1-4. 必要な OAuth スコープ

公式生成クライアントの `pinterest_oauth2` セキュリティ定義に列挙されているスコープ（原文の説明つき）:

```
ads:read/write  billing:read/write  biz_access:read/write
boards:read（公開ボード・参加中のグループボード）  boards:read_secret  boards:write  boards:write_secret
catalogs:read/write
pins:read（公開 Pin）  pins:read_secret  pins:write  pins:write_secret
user_accounts:read（ユーザーアカウントとフォロワー）  user_accounts:write
```

出典: <https://raw.githubusercontent.com/pinterest/pinterest-python-generated-api-client/main/README.md>（`## pinterest_oauth2` 節）

本アプリの参照画像検索に必要なのは **`pins:read`**（+ ボード一覧も出すなら `boards:read`、ユーザー表示に `user_accounts:read`）。
Pinterest の quickstart も既定スコープを `user_accounts:read` / `pins:read` / `boards:read` としている（<https://raw.githubusercontent.com/pinterest/api-quickstart/main/python/README.md>）。

#### A-1-5. アクセストークンの取得（OAuth 2.0 認可コードフロー）

- **認可 URL**: `https://www.pinterest.com/oauth/`（Flow: `accessCode`）
- **トークン URL**: `POST https://api.pinterest.com/v5/oauth/token`
  - `Content-Type: application/x-www-form-urlencoded`
  - 認証: **HTTP Basic**（`app_id:app_secret` を Base64）
  - 公式注記（原文）: "IMPORTANT: You need to start the OAuth flow via www.pinterest.com/oauth before calling this endpoint (or have an existing refresh token)." / "Grant type `client_credentials` and its corresponding response type are **not fully available**. You will likely get a default error if you attempt to use this grant_type."

リクエストボディ（`OauthAccessTokenRequestCode` / `OauthAccessTokenRequestRefresh`）:

| grant_type | フィールド |
| --- | --- |
| `authorization_code` | `grant_type`, `code`, `redirect_uri` |
| `refresh_token` | `grant_type`, `refresh_token`, `scope`(任意), `refresh_on`(任意 bool) |

`refresh_on: true` を付けると、レスポンスに新しい `refresh_token` と `refresh_token_expires_in` / `refresh_token_expires_at` が含まれる（`response_type: "everlasting_refresh"`）。公式注記では「継続リフレッシュは今後デフォルト挙動になる」とされている。

レスポンス（`OauthAccessTokenResponseCode`）:

```json
{
  "access_token": "...",
  "expires_in": 0,
  "scope": "pins:read boards:read",
  "refresh_token": "...",
  "refresh_token_expires_in": 0,
  "token_type": "bearer",
  "response_type": "..."
}
```

出典: <https://raw.githubusercontent.com/pinterest/pinterest-python-generated-api-client/main/docs/OauthApi.md>, `.../docs/OauthAccessTokenResponseCode.md`, `.../docs/OauthAccessTokenRequestRefresh.md`

**トークン寿命**: 検索経由で得た公式記述では、continuous refresh token は **60 日・無制限に更新可能**、旧来の legacy refresh token（365 日・ハードリミット）は**サポート終了**（2025-09-25 より前に作成したアプリは continuous へ移行が必要）。アクセストークン自体の秒数は `expires_in` で返るため、**実測値をサーバー側で保持して更新する実装**にすること。数値そのものは原文ページ未取得のため **（未確認）**。
参考: <https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/>

#### A-1-6. アクセスティア（trial / standard）とアプリレビュー

検索経由で得た公式記述（原文ページ未取得のため数値は **（未確認）**）:

- **Trial access**: API 機能の探索向け。**1,000 requests/day**（カテゴリ別に上限、`ads_write` は 300/day）。
  **Trial で作成した Pin / Board は Sandbox エンティティとなり、作成者本人にしか見えない。**
- **Standard access**: **100 requests/sec / user / app**。カテゴリ別に `org_read`・`ads_read` は 1,000 req/min、`org_write` は 100 req/min、`trends_read` は 60 req/min。
- **審査**: Standard は Trial 承認済みであることが前提。Developer Guidelines 準拠に加え、**API を使ってアプリが動作する様子の録画動画**の提出が必要。審査は数週間かかり、初回却下も珍しくない。

出典（一次）: <https://developers.pinterest.com/docs/getting-started/access-tiers/>, <https://developers.pinterest.com/docs/key-concepts/access-tiers/>, <https://developers.pinterest.com/docs/reference/rate-limits/>
アプリ登録導線: <https://developers.pinterest.com/apps/>（"Connect app" → trial access 申請）

> **設計上の含意**: Trial のままでは「本番のデザイナー複数名が使う検索 UI」は成立しない（1,000 req/day、sandbox 化）。Standard 審査が要る。そしてその審査を通しても、A-1-2 のとおり**検索できるのは本人の Pin だけ**。

#### A-1-7. レスポンスの形（画像 URL のフィールド名）

`Pin` モデルのプロパティ（公式生成ドキュメント `Pin.md`）:

```
id, created_at, link, title, description, dominant_color, alt_text, creative_type,
board_id, board_section_id, board_owner, is_owner, media, media_source,
parent_pin_id, is_standard, has_been_promoted, note, pin_metrics
```

`media` は画像 Pin の場合 `PinMediaWithImage` 相当で、`images` が `ImageMetadataImages` になる:

| キー（JSON 上の実キー） | 型 |
| --- | --- |
| `"150x150"` | `ImageDetails` |
| `"400x300"` | `ImageDetails` |
| `"600x"` | `ImageDetails` |
| `"1200x"` | `ImageDetails` |

`ImageDetails` は `{ width: int, height: int|null, url: string }`。

→ **`media.images["600x"].url` は正しい**（Python 生成クライアント上は識別子先頭に数字が来られないため `_600x` と表記されるが、JSON のキーは `"600x"`）。

出典: `.../docs/Pin.md`, `.../docs/PinMediaWithImage.md`, `.../docs/ImageMetadataImages.md`, `.../docs/ImageDetails.md`

`SummaryPin`（`/search/partner/pins` の戻り）はより薄く、`media`, `alt_text`, `link`, `title`, `description` のみ。**`id` が無い**点に注意（出典: `.../docs/SummaryPin.md`）。

ページング（`Paginated`）: `{ items: [...], bookmark: string|null }`。次ページは `bookmark` をそのまま渡す。

正規化マッピング（`ReferenceItem` への対応）は **F-2** の表に集約した。

#### A-1-8. 利用規約上の制約（設計を決定づける）

- **スクレイピング禁止**: Pinterest ToS は「robot, spider, crawler, scraper 等、当社が提供しないインターフェースによる Services へのアクセス／データ抽出」を禁止。Developer Guidelines でもデータ抽出は Unacceptable Use。
- **API データの保存禁止**: 「自分のアカウント（または明示的に許可されたアカウント）のキャンペーン分析情報を除き、API を含む Pinterest Materials 経由で取得した情報を保存してはならない。必要な都度 API を呼ぶこと。」
- **AI 学習の禁止（2026-08-18 改定で明文化）**: 「Pinterest Materials を AI / ML モデルの学習・ファインチューニング・改良・開発に使用すること」を、Pinterest の明示的な事前書面同意なしに禁止。

出典: <https://developers.pinterest.com/terms/>, <https://policy.pinterest.com/en/developer-guidelines>, <https://policy.pinterest.com/en/terms-of-service>

> **含意**: 「Pinterest の画像をムードボードに取り込み、それを AI 画像生成の参照に投げる」という主用途は、**Pinterest 経由の素材については規約上グレー〜黒**。Pinterest は「リンク＋サムネイル表示（キャッシュしない）」に留め、AI 生成の参照に渡すのは自前アップロード素材と、ライセンス上許容される素材に限定するのが安全。

---

### A-2. 埋め込みウィジェット（pinit.js）

#### A-2-1. 提供されているウィジェットの種類

公式のアドオンは **5 種類のみ**:

1. Save button（保存ボタン）
2. Follow button（フォローボタン）
3. Pin widget（`data-pin-do="embedPin"`）
4. Board widget（`data-pin-do="embedBoard"`）
5. Profile widget（`data-pin-do="embedUser"`）

**検索ウィジェットは存在しない。**（想定どおり。5 種の列挙に検索が含まれない。）

出典: <https://developers.pinterest.com/docs/web-features/widgets/>, <https://help.pinterest.com/en/business/article/build-a-website-widget>, <https://developers.pinterest.com/docs/add-ons/save-button/>

#### A-2-2. マークアップ

ローダは 1 ページ 1 回だけ:

```html
<script async defer src="//assets.pinterest.com/js/pinit.js"></script>
```

```html
<a data-pin-do="embedPin"   href="https://www.pinterest.com/pin/<pin id>/"></a>

<a data-pin-do="embedBoard" href="https://www.pinterest.com/<user>/<board>/"
   data-pin-board-width="400" data-pin-scale-width="80" data-pin-scale-height="240"></a>

<a data-pin-do="embedUser"  href="https://www.pinterest.com/<user>/"
   data-pin-board-width="400" data-pin-scale-width="80" data-pin-scale-height="240"></a>
```

サイズ属性の意味:

| 属性 | 意味 |
| --- | --- |
| `data-pin-board-width` | ウィジェット全体の幅(px) |
| `data-pin-scale-width` | 各 Pin サムネイルの幅(px) |
| `data-pin-scale-height` | ウィジェットの高さ(px) |

公式注記: 「ボード幅が親要素に収まらない場合、収まるまで Pin のカラムが削られる」。

属性値の正確な既定値・上限は原文ページ未取得のため **（未確認）**。実装前に <https://developers.pinterest.com/docs/web-features/widgets/> を確認すること。

#### A-2-3. pinterest.com を iframe できるか

**できない、と考えて設計すべき。** ただし本環境から `www.pinterest.com` へ直接アクセスできず、`X-Frame-Options` / `Content-Security-Policy: frame-ancestors` の実ヘッダを取得できなかったため **（未確認）**。

確認コマンド（ネットワーク到達可能な環境で実行すること）:

```bash
curl -sI https://www.pinterest.com/ | grep -iE 'x-frame-options|content-security-policy'
```

一般に主要 SNS は clickjacking 対策で `X-Frame-Options: DENY`/`SAMEORIGIN` を返し、その場合ブラウザは埋め込みを拒否する（"refused to connect"）。Pinterest が公式ウィジェット（pinit.js）を提供していること自体が、素の iframe を想定していない傍証。

> **設計判断**: 「Pinterest をそのまま iframe して中で検索させる」は**不可**の前提で進める。

---

### A-3. Pin URL からのインポート

#### A-3-1. oEmbed エンドポイントは存在する

**存在する。** WordPress core が信頼済み oEmbed プロバイダとして登録している定義（実装による裏取り）:

```php
// wp-includes/class-wp-oembed.php
'#https?://([a-z]{2}|www)\.pinterest\.com(\.(au|mx))?/.*#i'
    => array( 'https://www.pinterest.com/oembed.json', true ),
```

同ファイルのプロバイダ表に `| Pinterest | pinterest.com | 5.9.0 |` とあり、**WordPress 5.9 で追加**されたことがわかる。第 2 引数 `true` は「URL パターンが正規表現である」フラグ。

出典: <https://raw.githubusercontent.com/WordPress/WordPress/master/wp-includes/class-wp-oembed.php>（L110 / L189）
関連: WP Trac #53448 "Add Pinterest as a whitelisted oEmbed provider" <https://core.trac.wordpress.org/ticket/53448>、<https://wordpress.org/documentation/article/pinterest-embed/>

使い方（oEmbed 仕様どおり）:

```
GET https://www.pinterest.com/oembed.json?url=<URL-encoded pin/board/profile URL>
```

- Pin / Board / Profile の**いずれの URL も 1 本のエンドポイントで扱える**
- **公開**の Pin / Board / Profile のみ。secret board / secret pin は不可
- Pinterest アカウント不要

**レスポンスの正確なフィールド（`type`, `html`, `thumbnail_url`, `width`, `height`, `author_name`, `provider_name` 等）は、当該ホストへ到達できず実取得できなかったため （未確認）。** 実装時に一度叩いてスキーマを固定すること。oEmbed 1.0 仕様上は `type` / `version` が必須、`rich` 型なら `html` / `width` / `height` が必須、`thumbnail_url` は任意。

#### A-3-2. oEmbed が使えない／不足する場合の Pin ページからの読み取り

サーバー側 fetch で Pin ページの HTML から取れるもの:

- `<meta property="og:image" content="https://i.pinimg.com/...">` — OGP。最も安定
- `<meta property="og:title">` / `og:description` / `og:url`
- JSON-LD（`<script type="application/ld+json">`）
- ページ内の埋め込み JSON（`imageSpec_*` などのキーを持つ初期状態 JSON）

ただし **A-1-8 のとおり Pinterest ToS はスクレイピング（当社提供以外のインターフェースによるデータ抽出）を禁止**している。OGP の読み取りが「スクレイピング」に当たるかはグレーだが、
- **ユーザーが自分で貼った 1 件の URL を、その場で 1 回だけ解決する**（クローリングでない、蓄積しない）
- **oEmbed が返せるならそちらを優先する**
という運用に留めるのが現実的な線。**一括クロール・巡回・結果の永続保存は行わない。**

#### A-3-3. `pinimg.com` の URL パターン

観測されている画像 CDN のパス構造:

```
https://i.pinimg.com/<SIZE>/<aa>/<bb>/<cc>/<hash>.jpg
```

`<SIZE>` セグメントとして広く知られている値:

| セグメント | 概ねの用途 |
| --- | --- |
| `236x` | グリッドのカード表示 |
| `474x` | 中間 |
| `564x` | 中解像度 |
| `736x` | Pin 拡大表示 |
| `1200x` | 高解像度 |
| `originals` | オリジナル（元のサイズ・拡張子） |

セグメントを差し替えると別解像度が取れる（`/564x/` → `/originals/`）ことが広く報告されているが、**これは Pinterest の公式ドキュメントに記載された契約ではない**。予告なく変わりうるため、**アプリのロジックで URL を書き換えて `originals` を取りに行く実装はしない**こと。API が返した `media.images[*].url` / oEmbed が返した `thumbnail_url` をそのまま使う。

出典（非公式・コミュニティ）: <https://gist.github.com/jpsirois/7001965>
**公式仕様としては （未確認）。**

#### A-3-4. サムネイルのホットリンクは許容されるか

**（未確認）。** `i.pinimg.com` へ到達できず、`Referer` 有無による挙動・`Access-Control-Allow-Origin` の有無・`Cross-Origin-Resource-Policy` を実測できなかった。

確認コマンド:

```bash
curl -sI "https://i.pinimg.com/236x/xx/yy/zz/hash.jpg" \
  -H 'Referer: https://example.com/' | grep -iE 'access-control|cross-origin|cache-control|content-type'
```

一般論として、ホットリンク防御は (a) `Referer` チェック、(b) `Cross-Origin-Resource-Policy: same-site` の 2 方式が主流で、通常の `<img>` 読み込みは CORS リクエストではないため (b) を使わない限り `<img src>` 自体は通ることが多い。ただし **canvas に描いて `toDataURL()` する／`fetch()` でバイト列を取る場合は CORS が必要**になり、`Access-Control-Allow-Origin` が無ければ失敗する。
参考: <https://andrewlock.net/understanding-security-headers-part-2-cross-origin-resource-policy-preventing-hotlinking/>

> **設計判断**: ムードボードで画像を加工・合成・書き出しする（= canvas / fetch する）のであれば、**外部 CDN を直接指さず、必ず自前の `/api/studio/image` プロキシ経由**にする（E 章）。単に `<img>` で見せるだけなら直リンクでも動く可能性が高いが、Pinterest ToS のキャッシュ禁止条項とあわせて「プロキシは通すがディスクに残さない」構成が無難。

---

### A-4. 「サイト内に埋め込む Pinterest 検索」の選択肢ランキング

| # | 方式 | 実現できること | 合法性 | 必要な env | 評価 |
| --- | --- | --- | --- | --- | --- |
| **1** | **URL 貼り付けインポート（oEmbed 優先 / OGP フォールバック）** | ユーザーが Pin / Board URL を貼る → サムネ + タイトル + 元リンクを取得してボードに追加 | ○ 公式 oEmbed は正規の提供物。単発解決に限れば ToS 適合的 | なし（キー不要） | **最有力。今すぐ作れて、審査も課金もゼロ。** 「検索」ではないが、デザイナーの実際の動線（Pinterest で見つけて URL をコピー）とは合致する |
| **2** | **チーム共有アカウントの Pin を `/v5/search/pins` で検索** | 「チームが日頃ためている Pin」をアプリ内検索 | ○ 完全に正規 | `PINTEREST_ACCESS_TOKEN`（サーバー保管の単一トークン） | **A-4-1 参照。現行 `.env.example` の設計と一致し、実は一番筋が良い。** |
| **3** | ボード埋め込みウィジェット（`embedBoard`） | 自分/チームのボードをアプリ内に表示 | ○ 公式提供 | なし | 「参照の置き場」としては有効。**検索はできない**。pinit.js が生成する iframe の中身は触れないので「ムードボードに追加」ボタンは付けられない |
| **4** | 公式 API v5 + ユーザーごとの OAuth | ログインしたデザイナー本人の Pin を検索 | ○ 完全に正規 | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`（+ トークン保管先） | 2 の多人数版。OAuth 実装 + Standard access 審査（動画提出・数週間）のコストがかかる。優先度は低 |
| **5** | Google Programmable Search を pinterest.com に限定 | 見かけ上は「Pinterest 横断画像検索」 | △〜× CSE 自体は合法だが、結果として Pinterest の画像を第三者サービス経由で面的に引くことになり、Pinterest ToS のデータ抽出禁止の趣旨と緊張関係。加えて **B 章のとおり新規顧客は利用不可** | `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX` | **新規採用不可**（2027-01-01 終了 + 新規停止）。既存契約があるなら暫定手段 |
| **6** | 非公式スクレイピング / 3rd party scraper API | 何でもできる | **×** ToS 明確違反 | — | **採用しない** |

**推奨**: **1 と 2 を本命、3 を補助。** 4 は将来拡張、5 は既存契約がある場合のみ暫定。

#### A-4-1. `PINTEREST_ACCESS_TOKEN`（単一トークン）運用の再評価

現行 `.env.example` は `PINTEREST_ACCESS_TOKEN` を 1 本だけ持つ設計になっている。A-1-2 のとおり `/v5/search/pins` は**トークン所有者の Pin だけ**を検索するので、この設計は自動的に次の意味になる:

> **「チーム用 Pinterest アカウントを 1 つ作り、そこにみんなで参照を保存しておく。アプリはそのアカウントの中を検索する。」**

これは制約を逆手に取った、**むしろ望ましいプロダクト設計**だと評価できる:

- 検索対象が「チームがキュレーション済みの参照」に絞られるので、ノイズが少なく質が高い
- OAuth のユーザーごとフローが不要（トークン 1 本をサーバーに置くだけ）
- Pinterest 側で普段どおり Pin を集める作業がそのまま資産になる

ただし以下を UI に明記すること:
- 検索窓のプレースホルダを「**チームの Pinterest から探す**」にする（「Pinterest 全体から探す」ではない）
- 結果 0 件のとき「チームアカウントにまだ該当する Pin がありません。Pinterest で保存してから再検索してください」と案内する
- トークンは A-1-5 のとおり有効期限があるので、**サーバー側でリフレッシュする仕組みが必要**（`refresh_token` も一緒に保管する）。単一の静的トークンだけでは必ずいつか失効する

---

## B. Google Programmable Search Engine（Custom Search JSON API）

### B-0. 最重要 — ライフサイクル状況（2026-09 時点）

- **Custom Search JSON API は 2027-01-01 に提供終了予定。かつ新規顧客には提供されない。**
  既存顧客は 2027-01-01 までに移行する必要がある。
- **新規に作成する Programmable Search Engine は「ウェブ全体を検索（Search the entire web）」を選べない。**
  2026-01-20 以降、新規エンジンは「Sites to search」による**最大 50 ドメイン**構成が必須。
  既に "Search the entire web" が有効な**既存エンジンは 2027-01-01 まで継続利用可**。
- Google が案内する移行先は Vertex AI Search / Gemini の grounding 系で、**レスポンススキーマも課金体系も別物**。ドロップイン置換は存在しない。

出典: <https://developers.google.com/custom-search/v1/overview>, <https://developers.google.com/custom-search/custom-search-api-list>, <https://support.google.com/programmable-search/answer/12397162>, <https://support.google.com/programmable-search/thread/419409923>, <https://docs.cloud.google.com/generative-ai-app-builder/docs/migrate-from-cse>

> **判断**: 本プロジェクトが既に CSE の利用実績（課金アカウント）を持っていないなら、**B は採用しない**。持っているなら「2027-01-01 までの暫定」と明記した上で使う。いずれにせよ **fallback chain の最上位に置いてはいけない。**
> なお 50 ドメイン制限自体は、我々の用途（pinterest.com / stock.adobe.com / lovethework.com などに限定）では実害がない。効くのは「新規顧客お断り」の方。

### B-1. エンドポイント

| | |
| --- | --- |
| 従来形 | `https://www.googleapis.com/customsearch/v1` |
| Discovery 上の baseUrl + path | `https://customsearch.googleapis.com/` + `customsearch/v1` |
| サイト制限版 | `https://www.googleapis.com/customsearch/v1/siterestrict` |

HTTP メソッドは `GET`。

出典: Discovery Document `https://www.googleapis.com/discovery/v1/apis/customsearch/v1/rest`（`revision: 20260916`, `baseUrl`, `resources.cse.methods.list.path`）、<https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list>, <https://developers.google.com/custom-search/v1/site_restricted_api>

### B-2. クエリパラメータ（Discovery Document から検証）

必須 / 本アプリで使うもの:

| パラメータ | 型 | 説明（公式 Discovery 原文の要約） | 許容値 |
| --- | --- | --- | --- |
| `key` | string | API キー（Google Cloud のクレデンシャル） | — |
| `cx` | string | The Programmable Search Engine ID to use for this request. | — |
| `q` | string | Query | — |
| `searchType` | string | Specifies the search type: `image`. If unspecified, results are limited to webpages. | `searchTypeUndefined`, **`image`** |
| `num` | integer (int32) | Number of search results to return. | **1〜10** |
| `start` | integer (uint32) | 先頭結果のインデックス。既定 10 件/ページなので `&start=11` で 2 ページ目の先頭。**JSON API は 100 件を超えて返さない。`start + num > 100` はエラー。`num` の最大は 10。** | 1〜(100-num+1) |
| `imgSize` | string | Returns images of a specified size. | `imgSizeUndefined`, `HUGE`, `ICON`, `LARGE`, `MEDIUM`, `SMALL`, `XLARGE`, `XXLARGE` |
| `imgType` | string | Returns images of a type. | `imgTypeUndefined`, `clipart`, `face`, `lineart`, `stock`, `photo`, `animated` |
| `imgColorType` | string | 白黒/グレースケール/透過/カラー | `imgColorTypeUndefined`, `mono`, `gray`, `color`, `trans` |
| `imgDominantColor` | string | 主要色 | `black`,`blue`,`brown`,`gray`,`green`,`orange`,`pink`,`purple`,`red`,`teal`,`white`,`yellow` |
| `safe` | string | Search safety level. `active`=SafeSearch 有効 / `off`=無効（既定） | `safeUndefined`, `active`, `high`, `medium`, `off` |
| `siteSearch` | string | Specifies a given site which should always be included or excluded from results (see `siteSearchFilter`). | ドメイン文字列 |
| `siteSearchFilter` | string | `siteSearch` のサイトを含めるか除外するか | `siteSearchFilterUndefined`, **`e`(exclude)**, **`i`(include)** |
| `rights` | string | ライセンスでのフィルタ | `cc_publicdomain`, `cc_attribute`, `cc_sharealike`, `cc_noncommercial`, `cc_nonderived` およびその組み合わせ |
| `fileType` | string | 拡張子で制限 | — |
| `lr` | string | 言語制限（例 `lr=lang_ja`） | `lang_ja` など |
| `hl` | string | UI 言語。明示すると結果の質と性能が上がる、と公式が明記 | — |
| `gl` | string | エンドユーザーの地理（2 文字国コード） | — |
| `dateRestrict` | string | `d[n]` / `w[n]` / `m[n]` / `y[n]` | — |
| `filter` | string | 重複コンテンツフィルタの on/off | — |
| `sort` | string | ソート式（例 `sort=date`） | — |
| `exactTerms` / `excludeTerms` / `orTerms` / `hq` / `linkSite` | string | 語句制御 | — |
| `snippetLength` | integer | スニペット最大長。**161〜1000**。特定エンジンのみ | — |
| `c2coff` | string | 中文簡体/繁体検索の有効/無効。`1`=無効, `0`=有効(既定) | — |

注意点:
- `imgSize` は **Discovery の enum が大文字**（`MEDIUM` 等）だが、説明文は小文字で書かれている。実装時は大文字で送るのが安全（**小文字が通るかは （未確認）**）。
- `siteSearch` は**単一サイト**を指定するもの。複数ドメインを束ねたいなら `cx`（検索エンジン側の Sites to search）で構成する。
- **`searchType=image` を使うには、Control Panel で Image search を ON にしておく必要がある。**（Overview → Search features → Search settings の「Image search」トグル、または Setup → Basics）
  出典: <https://support.google.com/programmable-search/answer/12423774>

### B-3. レスポンス（Discovery Document `Search` / `Result` スキーマ）

```jsonc
{
  "kind": "customsearch#search",
  "url": { /* OpenSearch template */ },
  "queries": {
    "request":      [ /* 現在のリクエストのメタ */ ],
    "nextPage":     [ /* 次ページ（あれば） */ ],
    "previousPage": [ /* 前ページ（あれば） */ ]
  },
  "context":  { /* エンジン名など */ },
  "searchInformation": {
    "searchTime": 0.0,
    "formattedSearchTime": "0.00",
    "totalResults": "0",
    "formattedTotalResults": "0"
  },
  "spelling":   { /* スペル訂正 */ },
  "promotions": [ /* プロモーション（設定時のみ） */ ],
  "items": [ /* Result[] */ ]
}
```

`items[]`（`Result` スキーマ）の全プロパティ:

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `kind` | string | `customsearch#result` |
| `title` | string | 結果タイトル（プレーンテキスト） |
| `htmlTitle` | string | 同 HTML |
| `link` | string | **結果が指す完全な URL**（画像検索では画像そのものの URL） |
| `displayLink` | string | 短縮表示 URL（`www.example.com`） |
| `snippet` / `htmlSnippet` | string | スニペット |
| `formattedUrl` / `htmlFormattedUrl` | string | 表示用 URL |
| `mime` | string | MIME タイプ |
| `fileFormat` | string | ファイル形式 |
| `cacheId` | string | Google キャッシュ ID |
| `labels` | array | リファインメントラベル |
| `pagemap` | object | PageMap（構造化データ） |
| `image` | object | **画像検索時のみ**。下記 |

`items[].image` の中身:

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `contextLink` | string | **画像を掲載しているウェブページの URL** |
| `thumbnailLink` | string | **サムネイル画像の URL** |
| `thumbnailWidth` | integer(int32) | サムネイル幅(px) |
| `thumbnailHeight` | integer(int32) | サムネイル高さ(px) |
| `width` | integer(int32) | 画像の幅(px) |
| `height` | integer(int32) | 画像の高さ(px) |
| `byteSize` | integer(int32) | 画像のバイト数 |

出典: Discovery Document の `schemas.Search` / `schemas.Result`（実取得）、<https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list>

正規化マッピングは **F-2** の表に集約した。

### B-4. 料金・クォータ

| | Custom Search JSON API | Site Restricted JSON API |
| --- | --- | --- |
| 無料枠 | **100 クエリ/日** | なし |
| 従量 | **$5 / 1,000 クエリ** | $5 / 1,000 クエリ |
| 日次上限 | **10,000 クエリ/日** | **日次上限なし** |
| 新規受付 | **停止中** | **（未確認：同様に停止と推測）** |
| 終了予定 | **2027-01-01** | **（未確認：同時期と推測）** |

出典: <https://developers.google.com/custom-search/v1/overview>, <https://developers.google.com/custom-search/v1/site_restricted_api>

### B-5. CSE（`cx`）の作り方

> ⚠️ **現行 `.env.example` の記述を修正すること。**
> いま `.env.example` には「`https://programmablesearchengine.google.com/` で**「ウェブ全体を検索」**+「画像検索 ON」のエンジンを作り cx を取得」と書かれているが、**「ウェブ全体を検索」は新規エンジンでは選択できない**（2026-01-20 以降）。加えて Custom Search JSON API 自体が**新規顧客に提供されていない**。`.env.example` のコメントを「既存の CSE 契約がある場合のみ。新規取得は不可（2027-01-01 終了）」に書き換えるべき。

1. <https://programmablesearchengine.google.com/controlpanel/all> で「Add」
2. **Sites to search** に対象ドメインを入れる（最大 50）。例:
   `pinterest.com/*`, `stock.adobe.com/*`, `lovethework.com/*`, `adsoftheworld.com/*`, `clios.com/*`, `dandad.org/*`
   ※「Search the entire web」は**新規エンジンでは選べない**（B-0）
3. Overview → Search features → Search settings で **Image search を ON**
4. Overview の Basic 情報に出る **Search engine ID** が `cx`
5. API キーは Google Cloud Console でプロジェクトを作り "Custom Search API" を有効化して発行
   → `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX` として Vercel の Environment Variables へ

出典: <https://support.google.com/programmable-search/answer/11082370>, <https://support.google.com/programmable-search/answer/12423774>, <https://support.google.com/programmable-search/answer/12397162>

### B-6. リクエスト例（サーバー側）

```js
const url = new URL("https://www.googleapis.com/customsearch/v1");
url.search = new URLSearchParams({
  key: process.env.GOOGLE_CSE_KEY,
  cx:  process.env.GOOGLE_CSE_CX,
  q:   query,
  searchType: "image",
  num:  "10",                    // 最大 10
  start: String(offset + 1),     // 1 始まり。start + num <= 100
  safe: "active",
  imgSize: "LARGE",
  siteSearch: "pinterest.com",   // 単一サイト限定のとき
  siteSearchFilter: "i",
  hl: "ja",
  lr: "lang_ja",
}).toString();
```

---

## C. Adobe Stock Search API

### C-1. エンドポイントとヘッダ

| | |
| --- | --- |
| エンドポイント | `https://stock.adobe.io/Rest/Media/1/Search/Files` |
| メソッド | `GET`（`similar_image` を使うときのみ `POST` / `multipart/form-data`） |
| 1 回の最大取得件数 | **64 件** |

必須ヘッダ:

| ヘッダ | 内容 |
| --- | --- |
| `x-api-key` | adobe.io でアプリ登録したときに割り当てられる API キー（= Client ID）。例: `x-api-key: a74b00000dcf4075bea68fca6306a1aa` |
| `X-Product` | アプリ名。慣例は `アプリ名/バージョン`。例: `X-Product: MySampleApp/1.0` |

任意ヘッダ:

| ヘッダ | 内容 |
| --- | --- |
| `Authorization` | **Search API では任意**。Licensing API では必須。Adobe IMS のアクセストークンを `Bearer ` 付きで |
| `X-Request-Id` | 任意の一意 ID。Adobe サポートのログ追跡用。指定しなければサーバーが生成してレスポンスに返す |

出典: <https://developer.adobe.com/stock/docs/api/10-headers-for-api-calls>, <https://developer.adobe.com/stock/docs/api/11-search-reference>
（実取得: <https://raw.githubusercontent.com/pajenterprise/stock-api-docs/master/docs/api/10-headers-for-api-calls.md>, `.../11-search-reference.md`）

### C-2. ユーザートークン無しで検索できるか → **できる（確認済み）**

公式原文:

> An `Authorization` header is not required. If you do not pass a valid bearer token in the Authorization header, you can search within Adobe Stock and access preview versions of assets, but the API will not return licensing requirements or give you the licensed status for the assets. Requests made in this way are essentially anonymous, with no notion of the user making the request.

→ **`x-api-key` + `X-Product` だけで検索とプレビュー（サムネイル）取得ができる。** 本アプリの用途にはこれで十分。
逆に、`is_licensed` などライセンス状態を返させたい場合だけ `Authorization` が要る。

エラー例（キー不正）:

```http
HTTP/1.1 403 Forbidden
X-Request-Id: 50eYaxEFurUlb8bOpkxcnzydg6aGiUgc

{"error_code":"403003","message":"Api Key is invalid"}
```

### C-3. API キーの取得

1. <https://console.adobe.io>（Adobe Developer Console）でプロジェクトを作成
2. **Adobe Stock API** を追加
3. Integration type ごとに必要なクレデンシャル:

| Integration type | 必要なフィールド |
| --- | --- |
| **API Key** | API key（= Client ID）**だけ** ← 検索用途はこれ |
| OAuth | API key, client secret, redirect URI |
| Service Account | API key, technical account ID, organization ID, client secret |

公式注記: 「API キー以外（特に client secret）は、アプリケーションの秘密鍵と同様に保護すること。最低限サーバー側の公開されないファイルに置くこと。**フロントエンド JavaScript に露出させてはならない。**」

出典: <https://developer.adobe.com/stock/docs/getting-started/03-api-authentication>

**本番配布にあたっては Adobe の承認が要る**（Adobe Developer Terms of Use により、Adobe が承認していない Developer Software の配布を制限する権利を留保）。承認申請には (1) クリック可能な UX モックアップ、(2) 無ければ PDF/静止画のユーザージャーニー、(3) 検証可能な動作サイトへのログイン、(4) エンドユーザー向けドキュメントの例、が求められる。
出典: <https://developer.adobe.com/stock/docs/getting-started/16-app-approval>（実取得: `.../docs/16-app-approval.md`）

### C-4. パラメータ

#### C-4-1. 基本

| パラメータ | 説明 |
| --- | --- |
| `locale` | 言語コード。既定 `en_US`。日本語なら `ja_JP` |
| `search_parameters[words]` | **キーワード検索**。スペース区切り。media_id を直接入れることも可 |
| `search_parameters[limit]` | **1〜64、既定 32** |
| `search_parameters[offset]` | 0 以上。`limit` ずつ足してページング。既定 0 |
| `search_parameters[order]` | `relevance`(既定) / `creation` / `featured` / `nb_downloads` / `undiscovered` （`popularity` は非推奨） |
| `search_parameters[creator_id]` | 作者 ID |
| `search_parameters[media_id]` | 単一アセット |
| `search_parameters[model_id]` | モデル（人物）ID |
| `search_parameters[serie_id]` | シリーズ ID |
| `search_parameters[similar]` | 指定 media_id に見た目が似たアセット |
| `search_parameters[similar_url]` | 指定 URL の画像に似たアセット |
| `search_parameters[similar_image]` | `0|1`。`1` のとき POST の `similar_image`（JPG/PNG/GIF, multipart/form-data）を使う。`similar_url` があるとこちらは無視される |
| `search_parameters[category]` | カテゴリ ID |
| `search_parameters[thumbnail_size]` | `110` / `160` / `220` / `240` / `500`(既定, 透かし入り) / `1000`(透かし入り) |

**`search_parameters[]` は最低 1 つ必須。**

**重要**: `search_parameters[filters][premium]` は必ず `false` / `true` / `all` のいずれかを明示せよ、と公式が強く推奨している。指定しないと `limit` より多い件数が返ることがあり、ページングが崩れる。
出典: <https://developer.adobe.com/stock/docs/faq/>（"Why are there more search results returned than the 'limit' value?"）

#### C-4-2. フィルタ

| フィルタ | 値 |
| --- | --- |
| `search_parameters[filters][content_type:photo]` | `0` / `1` |
| `search_parameters[filters][content_type:illustration]` | `0` / `1` |
| `search_parameters[filters][content_type:vector]` | `0` / `1` |
| `search_parameters[filters][content_type:video]` | `0` / `1` |
| `search_parameters[filters][content_type:template]` | `0` / `1` |
| `search_parameters[filters][orientation]` | `horizontal` / `vertical` / `square` / `all`(既定) |
| `search_parameters[filters][premium]` | `false`(core/free のみ) / `true`(premium のみ) / `all` |
| `search_parameters[filters][has_releases]` | `true` / `false` / `all`(既定) |
| `search_parameters[filters][image_width]` | `min-max`（px, 両端省略可） |
| `search_parameters[filters][image_height]` | `min-max` |
| `search_parameters[filters][area_m_pixels]` | `min-max`（メガピクセル, 整数） |
| `search_parameters[filters][panoramic:on]` | `0`(既定) / `1` |
| ~~`search_parameters[filters][area_pixels]`~~ | 廃止予定。`area_m_pixels` / `image_width` / `image_height` を使う |
| ~~`search_parameters[filters][age]`~~ | 廃止予定。`order=creation` を使う |

`content_type` / `template_type_id` / `template_category_id` は**複数指定すると OR**、それ以外のフィルタは **AND**。

**URL エンコード注意**: 角括弧は `%5B` / `%5D` にエンコードされる。`URLSearchParams` を使えば自動。

#### C-4-3. `result_columns[]`

`result_columns[]` を 1 つでも指定すると、**既定フィールドは明示しない限り返らない**。既定で返るものは公式表で `*` 付き。

```
*nb_results  *id  *title  *creator_name  *creator_id  country_name  *width  *height
*thumbnail_url  *thumbnail_html_tag  *thumbnail_width  *thumbnail_height
thumbnail_110_url/_width/_height   thumbnail_160_url/_width/_height
thumbnail_220_url/_width/_height   thumbnail_240_url/_width/_height
thumbnail_500_url/_width/_height   thumbnail_1000_url/_width/_height
*media_type_id  *category  *category_hierarchy  nb_views  nb_downloads  creation_date
keywords  has_releases  comp_url  comp_width  comp_height  is_licensed
*vector_type  *content_type  framerate  duration  comps  details_url
template_type_id  template_category_ids  marketing_text  description  size_bytes
*premium_level_id  is_premium  licenses
video_preview_url/_width/_height/_content_length/_content_type
video_small_preview_url/_width/_height/_content_length/_content_type
```

注: `is_licensed` は `Authorization` ヘッダが必要。

本アプリで指定すべきセット:

```
result_columns[]=nb_results
result_columns[]=id
result_columns[]=title
result_columns[]=creator_name
result_columns[]=content_type
result_columns[]=width
result_columns[]=height
result_columns[]=thumbnail_240_url
result_columns[]=thumbnail_500_url
result_columns[]=thumbnail_1000_url
result_columns[]=details_url
result_columns[]=keywords
result_columns[]=comp_url
```

### C-5. レスポンス

```jsonc
{
  "nb_results": 12345,
  "files": [
    {
      "id": 108289885,
      "title": "Vector illustration of colorful horse, unicorn, or pony.",
      "thumbnail_url": "https://as1.ftcdn.net/jpg/01/08/28/98/500_F_108289885_zxdW0u0ds2oI69ZiLaON3kfhM2OLxdin.jpg",
      "creator_name": "...",
      "width": 5000, "height": 3333,
      "content_type": "image/jpeg",
      "details_url": "https://stock.adobe.com/...",
      "comps": {
        "Standard": {
          "url": "https://stock.adobe.io/Rest/Libraries/Watermarked/Download/76203302/1",
          "width": 1000, "height": 248
        }
      }
    }
  ]
}
```

公式注意: 「Adobe Stock のアセットは API 呼び出しの合間に追加・変更・削除されうる。したがって総件数も結果の並びも呼び出しごとに変わりうる。」

サムネイル CDN は **`*.ftcdn.net`**（`as1.ftcdn.net`, `t4.ftcdn.net` など）。
URL の形: `https://t4.ftcdn.net/jpg/00/84/66/63/240_F_84666330_LoeYCZ5LCobNwWePKbykqEfdQOZ6fipq.jpg`（先頭の `240_` が px サイズ）

正規化マッピングは **F-2** の表に集約した。

### C-6. comp（透かし入りプレビュー）のダウンロードとライセンス

**2 種類のプレビューがあり、扱いが違う。**

| 種類 | 取得方法 | 用途 |
| --- | --- | --- |
| **サムネイル**（CDN キャッシュ済み） | `thumbnail_*_url` を直接 `<img src>` | **ほとんどの用途はこれで十分。公式も「可能な限りこちらを使え」** |
| **comp**（非キャッシュ） | `comp_url` / `comps.Standard.url` を、**ライセンス済みファイルと同じダウンロードワークフロー**で取得 | どうしても大きい透かし入りが要るとき |

comp の URL は `https://stock.adobe.io/Rest/Libraries/Watermarked/Download/{content_id}/{license_type_id}` の形で返る。これは**単なる画像 URL ではなく API 呼び出し**で、`Authorization`（IMS アクセストークン）を伴うダウンロード手順が必要。
出典: <https://developer.adobe.com/stock/docs/faq/>（"How do I download a comp image?"）, <https://developer.adobe.com/stock/docs/api/12-licensing-reference>

**モックアップ/AI 参照としての可否 — Adobe Stock Developer Terms の該当条項:**

| 条 | 内容（要旨） | 本アプリへの影響 |
| --- | --- | --- |
| 3.1 | 許可された Developer Software の開発・運用の目的でのみ利用可。**未ライセンスの Adobe Stock Works を、Developer Software から単独ファイルとしてダウンロードさせてはならない。** Third-Party Software Integrations 等であれば、未ライセンス作品の**透かし入り/サムネイル版の表示は可**。 | **表示は OK、ダウンロード機能は NG** |
| 3.2 | 複製・配布・改変・表示を規約の範囲外で行えないようにすること。**各作品の上または隣に、`Contributor Name / Adobe Stock` の形式で貢献者名を表示すること。** 透かし・通知・メタデータの除去禁止。 | **カード UI に `{creator_name} / Adobe Stock` を必ず出す** |
| 6 | **`Powered by Adobe Stock`** を <http://stock.adobe.com> へリンクして明示表示。加えて「This product uses the Adobe Stock [SDK and/or API], but is not certified, endorsed or sponsored by Adobe. [Your Name] is not affiliated with or related to Adobe.」の免責を掲示。 | フッター等に固定表示が必要 |
| 8 | **キャッシュ・保存は「合理的な期間」かつ Developer Software の運用に必要な範囲を超えてはならない。取得データは 1 日 1 回以上リフレッシュすること。** | **検索結果を DB に長期保存しない。TTL ≤ 24h** |
| 9 | **「Adobe Stock Works およびそれに紐づくタイトル・キャプション・キーワード・その他メタデータを、いかなる機械学習・AI 目的にも使用してはならない」**（および自然人の識別技術への利用も禁止） | **★ 最重要。Adobe Stock の画像/メタデータを AI 画像生成の参照として渡すことは規約違反。** |
| 4 | ファイル名/メタデータに `editorial` を含む作品には用途別の制限。Asset Management / 認可された Third Party Integration では "Editorial Use Only" を隣に目立つよう表示。 | editorial 判定して注記を出すか、除外する |
| 10 | 規約終了時、ライセンスしていない作品は直ちに削除 | ローカル保存しない設計なら自然に満たせる |

出典: <https://raw.githubusercontent.com/pajenterprise/stock-api-docs/master/supplemental/terms-for-adobe-stock-developers.md>（正本: `AdobeDocs/stock-api-docs` の `supplemental/terms-for-adobe-stock-developers.md`、および <http://www.adobe.com/go/developer-terms>）

> **設計上の結論（C）**:
> - Adobe Stock は **「ムードボード上で見る／並べる／構図や配色の議論をする」ための表示専用ソース**として統合する。
> - **「この画像を AI 生成のリファレンスとして渡す」ボタンは Adobe Stock 由来のアイテムには出さない**（`license: "adobe-stock-preview"` でフロントを分岐させる）。
> - 貢献者表示・"Powered by Adobe Stock"・免責文・24h キャッシュ TTL を実装必須項目として起票する。

### C-7. レート制限

Adobe Stock 公式ドキュメント内に Search API のレート制限の明示的な数値は見当たらなかった。検索経由では **「およそ 5 リクエスト/秒（RPS）が推奨上限。ただしこれは 1 リクエストあたり 100 以上のアセット ID を送る前提」** という記述が Adobe の Stock API ドキュメントに由来するとされているが、これは **Files API（バルクメタデータ、`ids` は最大 110 件）** の文脈の可能性が高く、**Search API に対する数値としては （未確認）**。

実装では保守的に:
- サーバー側で **同時実行 2、1 秒あたり 3 リクエスト**程度にセルフスロットル
- 429 / 5xx は指数バックオフ（例: 500ms → 1s → 2s、最大 3 回）
- ユーザー入力にはデバウンス 400ms

出典: <https://developer.adobe.com/stock/docs/faq/>, <https://developer.adobe.com/stock/docs/api/19-bulk-metadata-files-reference>

### C-8. Adobe Firefly API は関係あるか（1 段落）

関係するが、**本タスク（参照画像の検索）とは別のレイヤ**。Firefly Services の画像生成は `POST https://firefly-api.adobe.io/v3/images/generate`（非同期版 `.../v3/images/generate-async`）で、ヘッダは `x-api-key`（Client ID）＋ `Authorization: Bearer <access token>` ＋ `Content-Type: application/json`。利用には Adobe Admin Console で対象ユーザーに **Developer ロール**と **Firefly Services のエンタイトルメント**を割り当てる必要があり、Adobe Stock API キーとは別系統の契約になる。**「Adobe Stock の画像を参照に AI 生成したい」という要望に対する、規約に抵触しない唯一の Adobe 側の答えが Firefly**（Adobe がライセンスを担保した学習データで生成する）という位置づけなので、Adobe Stock 素材を外部生成 AI に渡す代わりに Firefly を使う、という選択肢として頭に置く価値はある。ただし別途エンタイトルメント購入が必要で、本フェーズのスコープ外とする。
出典: <https://developer.adobe.com/firefly-services/docs/firefly-api/guides/how-tos/firefly-generate-image-api-tutorial>, <https://developer.adobe.com/firefly-services/docs/firefly-api/api/>, <https://developer.adobe.com/firefly-services/docs/guides/get-started>

---

## D. Cannes Lions / 広告賞アーカイブ

### D-1. Love The Work（`lovethework.com`）のアクセスモデル

- Cannes Lions（Ascential / LIONS）の**公式アーカイブ**。現在は "The Work" というブランド名でも呼ばれる。Cannes Lions / Dubai Lynx / Eurobest / Spikes Asia の受賞作・ショートリストを収録。
- **会員制（有料）**。LIONS Membership は年額 **€249**（Cannes Lions Live のスタンドアロンパス €249 相当を含む）。**30 歳未満は 30% 割引**。
  なお過去に若手クリエイターからの抗議（`lovetheworkmore.com`）を受けて 30 歳未満への無料開放に合意した経緯がある。
- 受賞作・ショートリストの**一覧ページ自体**は `https://www.lovethework.com/en/awards/winners-shortlists` で参照できるが、**キャンペーンボード（提出ボード）や詳細素材は課金の壁の内側**。

出典: <https://www.lovethework.com/en>, <https://www.lovethework.com/en/awards/winners-shortlists>, <https://www.lovethework.com/en/learn-more>, <https://iapi.ie/blog/default/lions-announces-the-introduction-of-lions-membership>, <https://lovetheworkmore.com/about/>

### D-2. 公開 API は存在するか

**存在しない（見つからない）。** Cannes Lions / LIONS、Clio、D&AD、The One Club のいずれについても、公開の開発者向け API・開発者ドキュメントは確認できなかった。**（未確認：非公開のパートナー API の有無）**

→ **プログラムから機械的に受賞作リストを取得する正規の手段が無い。**

### D-3. 無料で参照できる公開ソース

| ソース | URL | 内容 | 備考 |
| --- | --- | --- | --- |
| Cannes Lions 公式 Press | <https://www.canneslions.com/press> | 受賞発表のプレスリリース | 年次の Grand Prix 発表が公式に出る |
| Cannes Lions 公式 News | <https://www.canneslions.com/news/final-winners-announced-for-2026> | 年次の最終受賞発表 | |
| Cannes Lions Winners Spotlight | <https://www.canneslions.com/awards/winners-spotlight> | 受賞作の紹介 | |
| The Work（Winners & Shortlists） | <https://www.lovethework.com/en/awards/winners-shortlists> | 受賞・ショートリスト一覧 | 詳細は会員限定 |
| Love The Work More | <https://lovetheworkmore.com/> | 1954 年以降の Lions 受賞作を無償で集成した有志サイト | 公式ではない |
| Ads of the World | <https://www.adsoftheworld.com/> | 広告アーカイブ。**Clio Awards LLC が所有・運営**（The Clio Network） | ブランド別・コレクション別（例: Clio Award Winners 2022）で閲覧可 |
| The Clios | <https://clios.com/> | Clio Awards 受賞作 | |
| D&AD Awards archive | <https://www.dandad.org/work/d-ad-awards-archive> | D&AD 受賞作アーカイブ | |
| The One Club / The One Show | <https://www.oneclub.org/> | One Show / ADC 受賞作 | |
| 業界メディア | LBBOnline / The Drum / Creative Review / Campaign Brief | 毎年 Grand Prix 全リストを無料記事化 | 例: <https://www.thedrum.com/news/cannes-lions-2026-watch-every-grand-prix-winner>, <https://www.creativereview.co.uk/cannes-lions-2026-all-the-grand-prix-winners/> |

**robots.txt / 各サイトの ToS は本環境から取得できなかったため （未確認）。** 実装前に必ず各サイトの `robots.txt` と利用規約を確認すること。**いずれのサイトからも画像を自動収集・再ホストしない。**

### D-4. 法務・倫理の枠組み（受賞作を「原理の参照」として使うこと）

> 以下は法的助言ではない。実運用前に弁護士確認を推奨。

**大前提**: 広告作品（映像・グラフィック・コピー）は著作物であり、制作した代理店/制作会社/クライアントに権利がある。**賞を取ったことは公有化を意味しない。**

**日本法**

- **複製・公衆送信（著作権法 21 条・23 条）**: 受賞作の画像を自社サーバーにコピーしてアプリ内で配信すれば、複製権・公衆送信権の侵害になりうる。**→ 画像の再ホストは行わない。**
- **引用（32 条）**: 公正な慣行に合致し、報道・批評・研究等の**正当な範囲内**であることが要件。「ムードボードに貼る」は引用の要件（主従関係・明瞭区別・必然性）を満たしにくい。**引用に依存した設計にしない。**
- **私的使用のための複製（30 条）**: 個人が自分の手元で行う範囲。**業務でチームが使うアプリは該当しない。**
- **情報解析のための利用（30 条の 4）**: 2018 年改正で導入された柔軟な権利制限。著作物に表現された思想・感情を**「享受」する目的ではない**利用（AI 学習等の情報解析を含む）は、原則として権利者の許諾なく適法。ただし
  - **ただし書き**: 「著作権者の利益を不当に害することとなる場合は、この限りでない」
  - 文化庁 文化審議会著作権分科会が 2024 年に「**AI と著作権に関する考え方について**」を公表し、解釈を大幅に具体化した。**「享受目的」が併存する場合は 30 条の 4 は適用されない**（＝スタイルや表現を写し取ることを意図した利用は危うい）。
  出典: <https://storialaw.jp/blog/12050>, <https://www.bunka.go.jp/>（「AIと著作権に関する考え方について」）
- **アイデア/表現二分論**: 「大胆な余白の取り方」「一点突破のコピー戦略」「色数を 2 色に絞る」といった**原理・アイデアは著作権の保護対象ではない**。保護されるのは具体的表現。

**米国法**

- **Fair use（17 U.S.C. §107）**: 4 要素（目的と性格＝変形的か、著作物の性質、利用の量と実質性、市場への影響）で個別判断。**「参考にする」ことと「学習データに入れる」ことは別々に評価される。**
- 生成 AI の学習に関する米国判例は 2025 年以降も流動的で、**確立した安全圏はない。**

**本アプリの設計指針（法務的に安全な線）**

1. **画像を再ホストしない。** サムネイルすら自前 CDN に置かない。
2. **保持するのは事実データのみ**: 年、賞の種別（Lion の色/部門）、キャンペーン名、ブランド、代理店、国、一行の要約、**公式ページへの URL**。
   事実・データそのものは著作物ではない。要約は自分の言葉で書く（原文コピーしない）。
3. **画像が要るときは外部へ飛ばす。** カードの「作品を見る」→ 公式ページを新規タブで開く。
4. **「原理」を言語化して AI に渡す。** 「この受賞作の画像を参照にして生成」ではなく、「この受賞作から抽出した**原理**（例: 単色背景 + 極端な余白 + 被写体の切り取り）を条件にして生成」。**原理はアイデアであり著作権の対象外**という一線を守る。
5. **Adobe Stock / Pinterest 由来の画像は AI 生成の参照に渡さない**（A-1-8 / C-6 の規約）。
6. **UI に出典表記**: 「出典: Cannes Lions 2026 / Film Lions Grand Prix — {代理店} for {ブランド}」＋公式リンク。

### D-5. 推奨する提示方法

```
Cannes Lions 2026 · Film · Grand Prix          ← キュレーション済みメタデータ（自前 JSON）
「{キャンペーン名}」 / {ブランド} / {代理店}, {国}
原理: 単色背景 / 主役 1 点 / コピーなし         ← 自分の言葉で書いた抽出原理
[公式ページで見る ↗]  [この原理で画像を検索]  [この原理をボードに追加]
   └ lovethework.com    └ Adobe Stock へ        └ 画像でなくテキストカード
```

- データソース: `studio/src/data/awards.json`（手でキュレーションした JSON。年 1 回更新）
- **画像は一切持たない。**
- 「この原理で画像を検索」は、抽出した原理キーワードを **Adobe Stock 検索**（合法・確実）に投げる。CSE が使えるなら `siteSearch` を使わない汎用画像検索に投げてもよい。

---

## E. 横断: SSRF セーフな画像プロキシ（Vercel Function）

### E-0. Vercel 固有の上限（先に確認すべき制約）

**Vercel Function のリクエストボディ／レスポンスボディの最大サイズは 4.5 MB。** 超えると `413 FUNCTION_PAYLOAD_TOO_LARGE`。**ストリーミングレスポンスにはこの制限がない。**

出典: <https://vercel.com/docs/functions/limitations>, <https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE>, <https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions>

> **→ 依頼にあった「サイズ上限 ~6MB」は、バッファして返す実装では成立しない。**
> 対応は 2 択:
> 1. **上限を 4 MB に下げる**（推奨。参照用サムネイルに 4MB を超える必要はない）
> 2. **アップストリームのレスポンスをストリームでそのまま流す**（`Response` を返す Web ハンドラ / `ReadableStream`）。この場合は 4.5MB 制限を回避できるが、サイズ上限は自前でバイトカウントして中断する必要がある。
>
> 本仕様では **(1) 上限 4 MB + ストリーム転送**を採る（両方の利点を取る）。

その他の関連上限:
- `maxDuration`: `vercel.json` の `functions` で指定（既存の `api/claude.js` は 60 秒）。画像プロキシは **10 秒**で十分。
- 既存の `vercel.json` は `"api/studio/*.js": { "maxDuration": 60 }` のグロブを持つので追加は不要。ただし画像プロキシに 60 秒は長いので個別指定を検討する（F-5）。

### E-1. 脅威モデル

`/api/studio/image?url=<任意の URL>` は典型的な SSRF の入口。攻撃者は以下を狙う:

- クラウドメタデータの窃取: `http://169.254.169.254/latest/meta-data/...`（AWS IMDS）, `http://metadata.google.internal/...`
- 内部ネットワークのポートスキャン: `http://10.0.0.5:6379/`
- ローカルサービス: `http://127.0.0.1:8080/`, `http://[::1]/`
- 非 HTTP スキーム: `file:///etc/passwd`, `gopher://`, `dict://`, `data:`
- **DNS リバインディング**: 検証時は公開 IP を返し、実接続時に `127.0.0.1` を返す
- **リダイレクト経由のバイパス**: 公開ホストが `302` で `http://169.254.169.254/` に飛ばす
- **パーサ齟齬**: `http://example.com\@evil.com` を実装によって `example.com` とも `evil.com` とも読める

OWASP の指針（原文の要点）:
- 「**Deny-list は迂回されやすい。Allow-list を優先せよ。**」
- 「**入力検証のバイパスを防ぐため、HTTP クライアントのリダイレクト追従を無効化せよ。**」
- 「**ライブラリの返す IP アドレスを allowlist との比較に使え**」（＝ 文字列ではなく解決後の IP で判定）
- 「**ホストを allowlist と突き合わせ、リクエストは自分で組み立てよ。** ユーザーが渡した URL の path / query を持ち回すな」
- 「**パーサ齟齬は拒否として扱え。**」
- ブロックすべき代表: AWS IMDS `169.254.169.254` / `metadata.amazonaws.com`、GCP `metadata.google.internal` / `169.254.169.254`、Azure IMDS `169.254.169.254`、Localhost `127.0.0.0/8` `0.0.0.0/8` `::1/128`、RFC1918 `10.0.0.0/8` `172.16.0.0/12` `192.168.0.0/16`、Multicast `224.0.0.0/4` `ff00::/8`

出典: <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>（実取得: <https://raw.githubusercontent.com/OWASP/CheatSheetSeries/refs/heads/master/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.md>）

### E-2. 我々のケースは allow-list が使える

画像の出所は **我々自身が API から受け取った URL** に限られる。したがって **ホスト allow-list が成立する**（OWASP が「利用可能なら優先せよ」と言うケース）。

```js
const ALLOWED_HOST_SUFFIXES = [
  "i.pinimg.com",           // Pinterest 画像 CDN
  ".pinimg.com",
  ".ftcdn.net",             // Adobe Stock サムネイル CDN
  "stock.adobe.io",         // Adobe comp（要 Authorization。通常は使わない）
  "encrypted-tbn0.gstatic.com",  // Google CSE サムネイル
  "encrypted-tbn1.gstatic.com",
  "encrypted-tbn2.gstatic.com",
  "encrypted-tbn3.gstatic.com",
];
```

**CSE の `items[].link`（元画像の URL）は任意のドメインになる**ので、ここだけは allow-list が張れない。方針:

- **既定では CSE 結果は `image.thumbnailLink`（gstatic）だけをプロキシする** → allow-list 内に収まる
- 元画像が要る場合のみ「一般 URL モード」に落ち、E-3 の deny-list + IP 検証をフルに適用する

### E-3. 一般 URL モードの検証手順

1. **スキーム**: `http:` / `https:` のみ許可。それ以外（`file:`, `data:`, `gopher:`, `dict:`, `ftp:`, `blob:` …）は即 400
2. **ホスト名の形**:
   - `localhost`、ドットを含まない単一ラベル、`*.local`、`*.internal`、`metadata.google.internal`、`metadata.amazonaws.com` を拒否
   - パーセントエンコード・バックスラッシュ・`@` を含む host は拒否（パーサ齟齬対策）
   - URL の再パース結果と元文字列の host が一致しなければ拒否
3. **ポート**: `80` / `443` のみ許可
4. **DNS 解決**: `dns.promises.lookup(host, { all: true })` で **全アドレス**を取得
5. **IP 判定**: 得られた**すべて**の A/AAAA が公開 IP であること。1 つでも下記に該当すれば拒否

   | 範囲 | 内容 |
   | --- | --- |
   | `0.0.0.0/8` | "this network" |
   | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | RFC1918 |
   | `127.0.0.0/8` | ループバック |
   | `169.254.0.0/16` | リンクローカル（**IMDS を含む**） |
   | `100.64.0.0/10` | CGNAT |
   | `192.0.0.0/24`, `192.0.2.0/24`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24` | 特殊用途 |
   | `224.0.0.0/4`, `240.0.0.0/4`, `255.255.255.255/32` | マルチキャスト/予約/ブロードキャスト |
   | `::1/128` | IPv6 ループバック |
   | `::/128`, `::ffff:0:0/96` | 未指定 / IPv4-mapped（**mapped の中身も再判定**） |
   | `fc00::/7` | ULA |
   | `fe80::/10` | IPv6 リンクローカル |
   | `ff00::/8` | IPv6 マルチキャスト |
   | `64:ff9b::/96`, `2002::/16` | NAT64 / 6to4（内側 IPv4 を再判定） |

6. **リダイレクト**: `fetch(url, { redirect: "manual" })`。3xx が返ったら `Location` を取り出し、**1〜3 で全部やり直す**。追従は最大 2 回。追従しない選択（`redirect: "error"`）でも可だが、CDN が普通にリダイレクトするので手動追従が現実的
7. **DNS リバインディング対策**: 「検証した IP に対して直接接続する」のが理想。Node では `undici` の `Agent({ connect: { lookup } })` でカスタム lookup を挿し、**検証済み IP を返す**ようにする。簡易版では「検証 → 即座に fetch」で TTL 窓を狭める（**完全ではない**ことを明記しておく）
8. **レスポンス検証**:
   - `Content-Type` が `image/` で始まること（`image/svg+xml` は **XSS の温床なので拒否**）
   - `Content-Length` があれば **4 MB** 超で即中断
   - 無ければストリームを読みながらバイトカウントし、4 MB を超えたら `controller.abort()`
9. **タイムアウト**: `AbortSignal.timeout(8000)`（8 秒）

### E-4. 実装スケルチ

配置: `api/studio/image.js`（検証部分は `server/lib/sources/guard.js` に切り出し、`op:"unfurl"` からも使う）。

```js
// api/studio/image.js — SSRF セーフな画像プロキシ
// 画像は自前で保存しない（Pinterest ToS / Adobe Stock Terms 第8条）。CDN エッジのキャッシュのみ利用。
import dns from "node:dns/promises";
import net from "node:net";

export const config = { maxDuration: 10 };

const MAX_BYTES = 4 * 1024 * 1024;   // Vercel の 4.5MB 制限より下に取る
const TIMEOUT_MS = 8000, MAX_REDIRECTS = 2;

const ALLOWED_SUFFIXES = [
  "i.pinimg.com", ".pinimg.com", ".ftcdn.net",
  "encrypted-tbn0.gstatic.com", "encrypted-tbn1.gstatic.com",
  "encrypted-tbn2.gstatic.com", "encrypted-tbn3.gstatic.com",
];
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.amazonaws.com"]);
const BLOCKED_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16",
  "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
];

const v4 = (ip) => ip.split(".").reduce((a, o) => (a << 8 >>> 0) + Number(o), 0) >>> 0;
const inV4 = (ip, cidr) => {
  const [base, bits] = cidr.split("/");
  const mask = bits === "0" ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4(ip) & mask) === (v4(base) & mask);
};

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return BLOCKED_V4.some((c) => inV4(ip, c));
  if (!net.isIPv6(ip)) return true;                       // 判定不能は拒否
  const x = ip.toLowerCase();
  const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);  // IPv4-mapped は中身を再判定
  if (m) return isPrivateIp(m[1]);
  return x === "::1" || x === "::" || /^(f[cd]|fe[89ab]|ff)/.test(x)
      || x.startsWith("2002:") || x.startsWith("64:ff9b:");
}

const isAllowlisted = (h) =>
  ALLOWED_SUFFIXES.some((s) => (s.startsWith(".") ? h.endsWith(s) : h === s));

/** server/lib/sources/guard.js に切り出し、op:"unfurl" からも使う */
export async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("invalid url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
  if (u.username || u.password) throw new Error("userinfo");          // パーサ齟齬対策
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("port");

  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".")) throw new Error("host");                   // localhost 等
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("host");
  if (host.endsWith(".local") || host.endsWith(".internal")) throw new Error("host");
  if (isAllowlisted(host)) return u;

  const addrs = await dns.lookup(host, { all: true, verbatim: true }); // 全解決先を検証
  if (!addrs.length) throw new Error("dns");
  for (const { address } of addrs) if (isPrivateIp(address)) throw new Error("private ip");
  return u;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  let target = String(req.query.url || ""), upstream;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = await assertSafeUrl(target);
      upstream = await fetch(u, {
        redirect: "manual",                       // 自動追従しない（OWASP）
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "image/*", "User-Agent": "SorairoStudio/1.0 (+moodboard)" },
      });
      if (upstream.status < 300 || upstream.status >= 400) break;
      const loc = upstream.headers.get("location");
      if (!loc) throw new Error("redirect without location");
      target = new URL(loc, u).toString();        // 次ループで再検証
    }
  } catch (e) {
    return res.status(400).json({ error: `blocked: ${e.message}` });
  }
  if (!upstream.ok) return res.status(502).json({ error: `upstream ${upstream.status}` });

  const ct = upstream.headers.get("content-type") || "";
  if (!ct.startsWith("image/") || ct.includes("svg")) {   // svg は XSS 回避で拒否
    return res.status(415).json({ error: "not an image" });
  }
  if (Number(upstream.headers.get("content-length") || 0) > MAX_BYTES) {
    return res.status(413).json({ error: "too large" });
  }

  res.setHeader("Content-Type", ct);
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Referrer-Policy", "no-referrer");

  let sent = 0;                                   // ストリームしつつ上限で切る
  const reader = upstream.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    sent += value.byteLength;
    if (sent > MAX_BYTES) { await reader.cancel(); res.destroy(); return; }
    res.write(Buffer.from(value));
  }
  return res.end();
}
```

**既知の残存リスク**（レビュー時に明記すること）:
- DNS リバインディング: 上記は「検証 → fetch」の間に TTL が切り替わる窓が残る。厳密にするには `undici.Agent` のカスタム `connect.lookup` で**検証済み IP に直接接続**する必要がある
- allow-list 内ホストは DNS 検証をスキップしているため、その CDN 自体が侵害された場合は防げない（実用上は許容）

### E-5. 各 CDN のホットリンク / CORS の挙動

| CDN | ホスト | 挙動 |
| --- | --- | --- |
| Pinterest | `i.pinimg.com` | **（未確認）** 本環境から到達不可。`<img>` 直リンクは通る可能性が高いが、`fetch()` / canvas 用の `Access-Control-Allow-Origin` の有無は要実測。加えて Pinterest ToS のキャッシュ禁止条項があるため、**プロキシ経由 + 無保存**が無難 |
| Adobe Stock | `as1.ftcdn.net`, `t4.ftcdn.net` ほか `*.ftcdn.net` | **（未確認）** 公式 FAQ は「CDN のキャッシュ済みサムネイルを直接使うのが最も性能が良い」と明記しており、**`<img src>` での直リンクは想定された使い方**。CORS ヘッダの有無は未実測 |
| Google CSE | `encrypted-tbn0.gstatic.com` 〜 `tbn3` | **（未確認）** 「このドメインの画像はダウンロードできない」という報告が多数あり、プログラムからの取得は不安定。`<img>` 表示は動くが、`fetch()` は失敗しうる。**必ずプロキシ経由**にすること |

確認スクリプト（到達可能な環境で実行）:

```bash
for u in \
  "https://i.pinimg.com/236x/xx/yy/zz/hash.jpg" \
  "https://as1.ftcdn.net/jpg/01/08/28/98/500_F_108289885_zxdW0u0ds2oI69ZiLaON3kfhM2OLxdin.jpg" \
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9Gc..." ; do
  echo "=== $u"
  curl -sI -H 'Origin: https://example.com' -H 'Referer: https://example.com/' "$u" \
    | grep -iE 'HTTP/|access-control-allow-origin|cross-origin-resource-policy|cache-control|content-type'
done
```

**結論: 表示も含めてすべて `/api/studio/image?url=` 経由に統一する**（既存 `studio/src/lib/api.js` の `api.proxied(url)` がまさにこれ）。CORS / ホットリンクの不確実性を一箇所に閉じ込められ、canvas 書き出しも確実に動く。

### E-6. (D) 自前アップロード画像

| 項目 | 方針 |
| --- | --- |
| 受け口 | `<input type="file" accept="image/*">` |
| 制限 | `image/jpeg`, `image/png`, `image/webp` のみ。**`image/svg+xml` は拒否**（XSS） |
| リサイズ | **クライアント側**で canvas を使い長辺 1600px / JPEG q=0.82 に縮小してから保存（既存 `src/lib/image.js` の方式を踏襲） |
| 保存先 | 既存の `studio/src/lib/idb.js`（IndexedDB）。サーバーに置くなら Vercel Blob 等の外部ストレージ（**Function のボディ 4.5MB 制限に直接ぶつかるため、サーバー経由アップロードは避ける**） |
| 正規化 | `source: "upload"`, `license: "user-owned"`, `pageUrl: null`, `author: null` |
| 法務 | **AI 生成の参照に渡してよいのはこのソースだけ**（ユーザー自身が権利を持つ前提。UI にその旨を明記） |

---

## F. 実装仕様（Implementation spec）

> 本章は既存の `docs/studio/DESIGN.md` 4.5「サーバ API（Vercel Functions, `api/studio/*`）」の契約に合わせてある。
> 新しいエンドポイントを増やさず、**`POST /api/studio/search`（`op` で分岐）** と **`GET /api/studio/image?url=`** の 2 本に収める。

### F-1. 正規化された結果オブジェクト

DESIGN.md 4.5 が定める形と同一:

```ts
type ReferenceItem = {
  id: string;                  // ソース内で一意。CSE は cacheId or link
  source: "pinterest" | "adobe" | "cse" | "upload";
  title: string;               // 空文字許容
  thumbUrl: string | null;     // グリッド表示用（小）
  imageUrl: string | null;     // 拡大表示用（大）。null なら thumbUrl を使う
  pageUrl: string | null;      // 出典ページ。必ず新規タブで開く
  width: number | null;
  height: number | null;
  author: string | null;       // adobe は必ず入る（表示義務）
  license: "pinterest-tos" | "adobe-stock-preview" | "unknown" | "user-owned";
};
```

`license` はフロントの挙動を分岐させる**機能フラグ**として使う:

| `license` | ムードボード表示 | ダウンロード | **AI 生成の参照に渡す** | 必須クレジット |
| --- | --- | --- | --- | --- |
| `user-owned` | ○ | ○ | **○** | — |
| `adobe-stock-preview` | ○（透かし入り） | **×**（Terms 3.1） | **×**（Terms 9） | `{creator_name} / Adobe Stock` + "Powered by Adobe Stock" |
| `pinterest-tos` | ○（キャッシュしない） | × | **×**（ToS AI 学習禁止） | 元 Pin へのリンク |
| `unknown`（CSE） | ○ | × | **×**（権利者不明） | `displayLink` + 出典リンク |

### F-2. ソース別仕様表

いずれも `POST /api/studio/search` の `op` で分岐する（DESIGN.md 4.5）。入力は `{ op, q, page, site? }` または `{ op:"unfurl", url }`、出力は `{ items: ReferenceItem[], next?, source, degraded? }`。

| op | 上流エンドポイント | env vars | 上流リクエスト | 正規化マッピング | フォールバック |
| --- | --- | --- | --- | --- | --- |
| **`adobe`**<br>→`source:"adobe"` | `GET https://stock.adobe.io/Rest/Media/1/Search/Files` | `ADOBE_STOCK_API_KEY`<br>`ADOBE_STOCK_PRODUCT`<br>(既定 `SorairoStudio/1.0`) | Headers: `x-api-key`, `X-Product`<br>Query: `locale=ja_JP`, `search_parameters[words]=q`, `search_parameters[limit]=32`(≤64), `search_parameters[offset]=page*32`, `search_parameters[order]=relevance`, `search_parameters[filters][premium]=all`, `search_parameters[filters][content_type:photo]=1`, `search_parameters[filters][orientation]`, `result_columns[]=...`(C-4-3) | `id`←`String(id)`<br>`title`←`title`<br>`thumbUrl`←`thumbnail_240_url`<br>`imageUrl`←`thumbnail_1000_url`‖`thumbnail_500_url`<br>`pageUrl`←`details_url`<br>`width/height`←`width/height`<br>`author`←`creator_name`<br>`license`=`adobe-stock-preview` | 429/5xx → 指数バックオフ3回 → `{items:[], degraded:true}` |
| **`pinterest`**<br>→`source:"pinterest"` | `GET https://api.pinterest.com/v5/search/pins?query=&bookmark=` | `PINTEREST_ACCESS_TOKEN` | `Authorization: Bearer <token>`<br>scope `pins:read`<br>**トークン所有アカウントの Pin のみ**(A-4-1) | `id`←`id`<br>`title`←`title`‖`alt_text`<br>`thumbUrl`←`media.images["400x300"].url`<br>`imageUrl`←`media.images["1200x"].url`‖`["600x"].url`<br>`pageUrl`=`https://www.pinterest.com/pin/{id}/`<br>`width/height`← 同 `ImageDetails`<br>`license`=`pinterest-tos`<br>`next`←`bookmark` | 未設定/401 → `{items:[], degraded:true}` + UI で `unfurl` へ誘導 |
| **`cse`**<br>→`source:"cse"` | `GET https://www.googleapis.com/customsearch/v1` | `GOOGLE_CSE_KEY`<br>`GOOGLE_CSE_CX` | `key`,`cx`,`q`,`searchType=image`,`num=10`(≤10),`start=page*10+1`(`start+num≤100`),`safe=active`,`hl=ja`,`imgSize=LARGE`,`siteSearch`(+`siteSearchFilter=i`) | `id`←`cacheId`‖`link`<br>`title`←`title`<br>`thumbUrl`←`image.thumbnailLink`<br>`imageUrl`←`link`<br>`pageUrl`←`image.contextLink`<br>`width/height`←`image.width/height`<br>`author`←`displayLink`<br>`license`=`unknown` | **2027-01-01 終了・新規契約不可。** 未設定 → 501 相当で無効化。403 dailyLimitExceeded → `degraded:true` |
| **`unfurl`**<br>→`source:"pinterest"` ほか | `GET https://www.pinterest.com/oembed.json?url=<enc>`<br>失敗時: 対象ページの `og:image` | なし（キー不要） | 1 URL につき 1 回だけ解決。**結果を保存しない**。E 章の URL 検証を通す | `id`← URL から抽出した pin id（無ければ URL の hash）<br>`title`← oEmbed `title`‖`og:title`<br>`thumbUrl`=`imageUrl`← oEmbed `thumbnail_url`‖`og:image`<br>`pageUrl`← 入力 URL<br>`license`=`pinterest-tos`（pinterest 以外は `unknown`） | oEmbed 失敗 → OGP → 両方失敗なら 422「URL を開いて画像を保存してから読み込んでください」 |
| **`cannesImages`** | なし（自前 JSON） | — | `studio/src/data/awards.json` をローカル検索。**画像は持たない**。「画像を探す」を押したときだけ `adobe`／`cse` にキーワードを中継する | `AwardCard` 型（年/賞/部門/キャンペーン/ブランド/代理店/国/原理/公式 URL）。`ReferenceItem` ではない | 常に利用可 |
| **自前アップロード**<br>→`source:"upload"` | なし（クライアント側／IndexedDB `studio/src/lib/idb.js`） | — | `<input type="file" accept="image/*">` → canvas で長辺 1600px / JPEG q=0.82 | `id`=uuid<br>`thumbUrl`=`imageUrl`=ObjectURL／dataURL<br>`pageUrl`=null, `author`=null<br>`license`=`user-owned` | なし（常に利用可） |
| **画像プロキシ** | `GET /api/studio/image?url=` | — | E 章（SSRF ガード + 4MB 上限 + `image/*` のみ） | — | 400/415/413/502 → グリッドにプレースホルダ表示 |
| **キー有無の通知** | `GET /api/studio/status` | — | — | `{ claude, gemini, pinterest, adobe, cse }` の bool のみ。**キー本体は絶対に返さない** | — |

### F-3. フォールバックチェーン（検索実行時）

`GET /api/studio/status` が返す bool でタブの出し分けをする。**タブは横並びで、フォールバックは「タブを自動で切り替える」のではなく「使えないタブを畳む」形にする**（デザイナーがどこから来た画像かを常に把握できるようにするため）。

```
Refs 画面（studio/src/screens/Refs.jsx）
  │
  ├─ タブ1「アップロード」  ........ 常に有効。API 全滅でも動く
  │     └ ★ AI 生成の参照に渡せる唯一のソース（license: user-owned）
  │
  ├─ タブ2「Adobe Stock」  ......... status.adobe === true のとき
  │     └ 429/5xx → 指数バックオフ3回 → degraded:true → 「一時的に混み合っています」
  │     └ 表示義務: {creator_name} / Adobe Stock ＋ Powered by Adobe Stock ＋ 免責文
  │
  ├─ タブ3「チームの Pinterest」  .. status.pinterest === true のとき
  │     └ 401（トークン失効）→ degraded:true → 「URL で読み込む」へ誘導
  │     └ 0件 → 「Pinterest で保存してから再検索」
  │
  ├─ タブ4「URL で読み込む」  ...... 常に有効（キー不要）。op: unfurl
  │     └ タブ3 が落ちているときの実質的な代替
  │
  ├─ タブ5「カンヌ／広告賞」  ...... 常に有効（自前 JSON）。画像なし・原理カード
  │     └ 「この原理で画像を探す」→ タブ2（無ければタブ3/4）へキーワードを渡す
  │
  └─ タブ6「Web 画像検索」  ........ status.cse === true のときだけ表示
        └ 既存 CSE 契約がある場合のみ。無ければタブごと出さない
        └ 403 dailyLimitExceeded → 「本日の無料枠（100件/日）を使い切りました」
```

**縮退の原則**: タブ1・4・5 はキー無しで必ず動く。したがって**環境変数が 1 つも設定されていなくても Refs 画面は機能する**。

### F-4. 環境変数一覧（Vercel → Project → Settings → Environment Variables）

`.env.example` に既にある名前をそのまま使う。**新しい変数は増やさない。**

| 変数名 | 必須 | 用途 | 本調査による注記 |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | ○ | Claude（既存） | — |
| `STUDIO_CLAUDE_MODEL` | 任意 | Studio 用モデル指定（既存） | — |
| `GEMINI_API_KEY` / `GEMINI_IMAGE_MODEL` | 任意 | 画像生成（既存） | 参照画像を渡してよいのは `license: "user-owned"` のみ |
| `ADOBE_STOCK_API_KEY` | 推奨 | Adobe Stock 検索 | Adobe Developer Console の **Client ID**。Integration type は **API Key** でよい（C-3） |
| `ADOBE_STOCK_PRODUCT` | 推奨 | `X-Product` ヘッダ | 既定 `SorairoStudio/1.0`。**必須ヘッダなので未設定時はフォールバック値を入れる** |
| `PINTEREST_ACCESS_TOKEN` | 任意 | チーム Pinterest 検索 | **有効期限がある**（A-1-5）。恒久運用には `PINTEREST_REFRESH_TOKEN` + `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET` を足して自動更新する必要がある **（要追加検討）** |
| `GOOGLE_CSE_KEY` / `GOOGLE_CSE_CX` | 任意 | Web 画像検索 | **新規取得不可・2027-01-01 終了**（B-0）。`.env.example` のコメント修正が必要（B-5） |

**`VITE_` 接頭辞は 1 つも付けない**（付けるとブラウザに露出する。既存 `.env.example` の方針どおり）。
`GET /api/studio/status` はキーの**有無（bool）だけ**を返し、値は絶対に返さない。

### F-5. 追加・変更するファイル

既存構成（`api/studio/*` + `studio/src/*` + `server/lib/devApi.js`）に沿って置く。

```
api/studio/
  search.js          # op: pinterest | adobe | cse | unfurl | cannesImages（新規）
  image.js           # SSRF セーフ画像プロキシ（E 章）（新規）
  status.js          # キー有無の bool（新規）
server/lib/
  devApi.js          # 開発時に上記ハンドラを /api/studio/* にマウント（既存・追記）
  sources/           # 上流アダプタを Vercel/dev で共用（新規）
    adobe.js         #   normalizeAdobe + クエリ組み立て
    pinterest.js     #   normalizePin + oEmbed/OGP unfurl
    cse.js           #   normalizeCse
    guard.js         #   assertSafeUrl（E-4）— image.js と unfurl の両方から使う
studio/src/
  screens/Refs.jsx   # 検索 UI + 結果グリッド + ムードボード（既存の仮置きを置換）
  data/awards.json   # 広告賞キュレーションデータ（新規）
```

`vercel.json` は**変更不要**。既に `"api/studio/*.js": { "maxDuration": 60 }` のグロブがある。
（ただし画像プロキシに 60 秒は長すぎるので、`api/studio/image.js` だけ個別に短く指定するのが望ましい:
`"api/studio/image.js": { "maxDuration": 10 }` をグロブより前に置く。**Vercel のグロブと個別指定の優先順位は （未確認）** — 実デプロイで確認すること。）

### F-6. 実装フェーズ

| Phase | 内容 | 前提 | 対応するタブ |
| --- | --- | --- | --- |
| **1** | `api/studio/image.js`（SSRF ガード）+ 自前アップロード + ムードボード UI | なし。**ここだけで最低限成立する** | タブ1 |
| **2** | `api/studio/search.js` の `op:"adobe"` + 表示義務（貢献者名 / Powered by Adobe Stock / 免責文 / 24h TTL） | Adobe Developer Console で API キー取得 | タブ2 |
| **3** | `op:"unfurl"`（Pinterest oEmbed → OGP） | なし | タブ4 |
| **4** | `op:"cannesImages"` + 広告賞キュレーションデータ + 「原理」カード | 手作業のデータ整備 | タブ5 |
| **5** | `op:"pinterest"`（チームアカウント検索）+ トークン自動更新 | Pinterest アプリ登録 + Standard access 審査（数週間） | タブ3 |
| **—** | `op:"cse"` | **既存契約がある場合のみ。2027-01-01 までの暫定** | タブ6 |

### F-7. DESIGN.md との整合（差分として起票すべき点）

| # | DESIGN.md / `.env.example` の現状 | 本調査の結論 | 対応 |
| --- | --- | --- | --- |
| 1 | `.env.example`: CSE を「ウェブ全体を検索」で作れと案内 | **新規エンジンでは不可、API も新規受付停止** | コメントを修正し、タブ6 をオプション扱いに降格 |
| 2 | DESIGN.md B4: Pinterest 検索の優先順「公式 API v5 → CSE → URL 取り込み → ボード埋め込み」 | 公式 API は**自分の Pin のみ**、CSE は**新規不可** | 優先順を「URL 取り込み／チーム Pinterest → ボード埋め込み」に組み替え（A-4） |
| 3 | DESIGN.md B1: 既定で Pinterest・CSE・Adobe の画像はモデルに渡さない | **規約上も正しい**（Adobe Terms 9 / Pinterest ToS）。単なる既定値ではなく**強制**にすべき | `license` による UI 制御を実装必須項目に格上げ（F-1） |
| 4 | `PINTEREST_ACCESS_TOKEN` 単独 | トークンは失効する | `refresh_token` 保管と自動更新を設計に追加 |
| 5 | 画像プロキシのサイズ上限 | **Vercel のボディ上限は 4.5MB** | 上限 4MB + ストリーム転送（E-0） |
| 6 | Adobe Stock の結果キャッシュ | **Terms 8: 1 日 1 回以上リフレッシュ** | キャッシュ TTL ≤ 24h を明記 |

---

## 付録 X. 未確認項目一覧（**（未確認）** を付けた箇所）

| # | 項目 | 章 | 確認方法 |
| --- | --- | --- | --- |
| 1 | Pinterest アクセストークン / リフレッシュトークンの具体的な有効期間（continuous refresh = 60 日 等） | A-1-5 | <https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/> を直接閲覧 |
| 2 | Pinterest アクセスティアのレート制限実数（Trial 1,000/day、Standard 100 req/s 等） | A-1-6 | <https://developers.pinterest.com/docs/reference/rate-limits/> |
| 3 | pinit.js の各 `data-pin-*` 属性の既定値・上限 | A-2-2 | <https://developers.pinterest.com/docs/web-features/widgets/> |
| 4 | `www.pinterest.com` の `X-Frame-Options` / `frame-ancestors` の実ヘッダ | A-2-3 | `curl -sI https://www.pinterest.com/` |
| 5 | Pinterest oEmbed レスポンスの正確なフィールド構成 | A-3-1 | `curl 'https://www.pinterest.com/oembed.json?url=<pin url>'` |
| 6 | `i.pinimg.com` のサイズセグメントの公式仕様 | A-3-3 | 公式ドキュメントに記載なし。API 返却値のみ使う運用で回避 |
| 7 | `i.pinimg.com` のホットリンク可否 / CORS ヘッダ | A-3-4, E-5 | E-5 の curl スクリプト |
| 8 | CSE `imgSize` に小文字値が通るか（Discovery の enum は大文字） | B-2 | 実リクエストで検証 |
| 9 | Site Restricted JSON API の新規受付停止・終了時期が本体と同じか | B-4 | <https://developers.google.com/custom-search/v1/site_restricted_api> |
| 10 | Adobe Stock **Search API** のレート制限の公式数値 | C-7 | Adobe サポート / <https://developer.adobe.com/stock/docs/faq/> |
| 11 | `*.ftcdn.net` の CORS ヘッダ | E-5 | E-5 の curl スクリプト |
| 12 | `encrypted-tbn*.gstatic.com` の CORS / ホットリンク挙動 | E-5 | E-5 の curl スクリプト |
| 13 | Cannes Lions / Clio / D&AD / One Club の非公開パートナー API の有無 | D-2 | 各団体へ問い合わせ |
| 14 | 各広告賞サイトの `robots.txt` と利用規約 | D-3 | 各サイトの `/robots.txt` |
| 15 | Adobe Stock ドキュメントのミラー（fork）と本家最新版との差分 | 0, C | <https://developer.adobe.com/stock/docs/api/11-search-reference> を直接閲覧 |
| 16 | `vercel.json` の `functions` でグロブ（`api/studio/*.js`）と個別指定が競合したときの優先順位 | F-5 | 実デプロイで検証、または <https://vercel.com/docs/project-configuration> |
| 17 | Pinterest の静的 `PINTEREST_ACCESS_TOKEN` を無期限運用する正規手段の有無（`refresh_token` 自動更新以外） | F-4 | <https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/> |
| 18 | oEmbed の `thumbnail_url` が `i.pinimg.com` のどのサイズを指すか | A-3-1, F-2 | 実リクエストで確認 |

---

## 付録 Y. 主要な出典 URL（一次情報）

**Pinterest** — API v5 <https://developers.pinterest.com/docs/api/v5/> ／ Search user's Pins <https://developers.pinterest.com/docs/api/v5/search_user_pins-list/> ／ search/partner/pins <https://developers.pinterest.com/docs/api/v5/search_partner_pins/> ／ OAuth token <https://developers.pinterest.com/docs/api/v5/oauth-token/> ／ 認証とスコープ <https://developers.pinterest.com/docs/getting-started/authentication-and-scopes/> ／ アクセスティア <https://developers.pinterest.com/docs/getting-started/access-tiers/> ／ レート制限 <https://developers.pinterest.com/docs/reference/rate-limits/> ／ ウィジェット <https://developers.pinterest.com/docs/web-features/widgets/> ／ Developer ToS <https://developers.pinterest.com/terms/> ／ Developer Guidelines <https://policy.pinterest.com/en/developer-guidelines> ／ ToS <https://policy.pinterest.com/en/terms-of-service>
実取得: <https://raw.githubusercontent.com/pinterest/pinterest-python-generated-api-client/main/docs/SearchApi.md>（および `README.md`, `Pin.md`, `SummaryPin.md`, `ImageMetadataImages.md`, `ImageDetails.md`, `OauthApi.md`, `OauthAccessTokenResponseCode.md`, `OauthAccessTokenRequestRefresh.md`）／ <https://raw.githubusercontent.com/pinterest/api-quickstart/main/README.md> ／ <https://raw.githubusercontent.com/WordPress/WordPress/master/wp-includes/class-wp-oembed.php>

**Google Programmable Search** — cse.list <https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list> ／ 概要・料金 <https://developers.google.com/custom-search/v1/overview> ／ Site Restricted <https://developers.google.com/custom-search/v1/site_restricted_api> ／ 廃止一覧 <https://developers.google.com/custom-search/custom-search-api-list> ／ エンジン作成 <https://support.google.com/programmable-search/answer/11082370> ／ 50 ドメイン制限 <https://support.google.com/programmable-search/answer/12397162> ／ Image search 有効化 <https://support.google.com/programmable-search/answer/12423774> ／ Vertex AI 移行 <https://docs.cloud.google.com/generative-ai-app-builder/docs/migrate-from-cse>
実取得: <https://www.googleapis.com/discovery/v1/apis/customsearch/v1/rest>（`revision: 20260916`）

**Adobe Stock** — Search リファレンス <https://developer.adobe.com/stock/docs/api/11-search-reference> ／ ヘッダ <https://developer.adobe.com/stock/docs/api/10-headers-for-api-calls> ／ 認証 <https://developer.adobe.com/stock/docs/getting-started/03-api-authentication> ／ ライセンス <https://developer.adobe.com/stock/docs/api/12-licensing-reference> ／ FAQ <https://developer.adobe.com/stock/docs/faq/> ／ アプリ承認 <https://developer.adobe.com/stock/docs/getting-started/16-app-approval> ／ Developer Terms <http://www.adobe.com/go/developer-terms> ／ Firefly API <https://developer.adobe.com/firefly-services/docs/firefly-api/api/>
実取得: <https://github.com/AdobeDocs/stock-api-docs> の fork raw（`docs/api/11-search-reference.md`, `docs/api/10-headers-for-api-calls.md`, `docs/getting-started/03-api-authentication.md`, `docs/15-faq.md`, `docs/16-app-approval.md`, `supplemental/terms-for-adobe-stock-developers.md`）

**広告賞** — Cannes Lions <https://www.canneslions.com/press> ／ <https://www.canneslions.com/awards/winners-spotlight> ／ The Work <https://www.lovethework.com/en/awards/winners-shortlists> ／ Love The Work More <https://lovetheworkmore.com/> ／ Ads of the World <https://www.adsoftheworld.com/> ／ The Clios <https://clios.com/> ／ D&AD <https://www.dandad.org/work/d-ad-awards-archive> ／ The One Club <https://www.oneclub.org/>

**セキュリティ / プラットフォーム** — OWASP SSRF Prevention <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>（実取得: <https://raw.githubusercontent.com/OWASP/CheatSheetSeries/refs/heads/master/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.md>）／ Vercel Functions Limits <https://vercel.com/docs/functions/limitations> ／ FUNCTION_PAYLOAD_TOO_LARGE <https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE>

**法務（参考・法的助言ではない）** — 文化庁「AIと著作権に関する考え方について」(2024) <https://www.bunka.go.jp/> ／ 著作権法 30 条の 4 の解説 <https://storialaw.jp/blog/12050>
