# Gemini 画像生成モデル 実装リファレンス

> **検証日: 2026-09-18** / 調査者: リサーチエンジニア
> 対象: デザイン用途（キービジュアル・ポスター・OOH・SNS・Web ヒーロー）の画像生成を Gemini API から叩くための実装仕様。

---

## 0. 最初に読むべき 3 つの結論

1. **ユーザーが言う「Image 2.5」= `gemini-2.5-flash-image`（Nano Banana）は非推奨（deprecated）です。**
   2027-03-15 に廃止予定。Google の公式移行先は `gemini-3.1-flash-lite-image`。
   まだ API 上には存在し呼べますが、新規実装のデフォルトにすべきではありません。
2. **2026-09 時点の本命は `gemini-3.1-flash-image`（Nano Banana 2）と `gemini-3-pro-image`（Nano Banana Pro）。**
   両者とも 2K/4K 出力、最大 14 枚の参照画像、テキストレンダリング強化、Google 検索グラウンディングに対応。
   デザイン成果物（文字が乗るポスター・KV）には **Pro が最有力**、量産・反復には **Flash Image (NB2)**。
3. **`generationConfig` の正確なフィールド名は `responseModalities` / `imageConfig.aspectRatio` / `imageConfig.imageSize`。**
   `negativePrompt` というパラメータは **API 全体に存在しません**（後述 §4.7 で検証済み）。

### 調査環境の制約（重要・正直な申告）

本セッションのネットワーク egress ポリシーにより、以下の公式ドメインは **取得不可（403 / EGRESS_BLOCKED）** でした:

- `ai.google.dev`（Gemini API 公式ドキュメント本体）
- `docs.cloud.google.com`（Cloud ドキュメントの新ドメイン。`cloud.google.com/vertex-ai/generative-ai/docs/...` は 301 でここへ飛ぶため実質取得不可）
- `developers.googleblog.com` / `blog.google` / `deepmind.google`

そのため本書は、**実際に取得できた一次情報**のみを根拠にしています:

| # | 検証に使った URL | 種別 |
|---|---|---|
| S1 | `https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta` | **API Discovery ドキュメント（revision 20260917）** — REST フィールド名の最終的な正 |
| S2 | `https://cloud.google.com/vertex-ai/generative-ai/pricing` | 価格表（実取得・HTTP 200） |
| S3 | `https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana` | Google Cloud 公式プロンプトガイド（2026-03-06） |
| S4 | `https://raw.githubusercontent.com/google-gemini/cookbook/main/quickstarts/Get_Started_Nano_Banana.ipynb` | Google 公式 Cookbook（Copyright 2026 Google LLC） |
| S5 | `https://raw.githubusercontent.com/google-gemini/cookbook/main/quickstarts/Models.ipynb` | 公式 Cookbook 内の実 `models.list` 出力 |
| S6 | `https://raw.githubusercontent.com/google-gemini/cookbook/main/quickstarts-js/Image_out.js` | 公式 Cookbook（JS / `generateContent` 版） |
| S7 | `https://raw.githubusercontent.com/google-gemini/gemini-skills/main/skills/gemini-api-dev/SKILL.md` | Google 公式 Gemini API スキル定義（現行モデル一覧） |
| S8 | `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent` | **ライブ疎通検証**（ダミーキーでリクエスト送出し、ルーティングとボディ受理を確認） |

参照のみ（**本セッションでは取得できていない** = 記述の裏取りに使っていない）:
`https://ai.google.dev/gemini-api/docs/image-generation` /
`https://ai.google.dev/gemini-api/docs/rate-limits` /
`https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image`

---

## 1. モデル表（2026-09-18 現在 / Gemini Developer API）

### 1.1 実在するモデル ID

S5（公式 Cookbook に貼られた実 `models.list` レスポンス）で確認できた **画像生成系 ID の全量**:

```
models/gemini-3-pro-image
models/gemini-3-pro-image-preview
models/nano-banana-pro-preview
models/gemini-3.1-flash-image
models/gemini-3.1-flash-image-preview
models/gemini-3.1-flash-lite-image
models/gemini-2.5-flash-image
```

REST では `models/` を除いた部分を URL に入れます（例: `.../v1beta/models/gemini-3.1-flash-image:generateContent`）。
**Imagen 系（`imagen-*`）はこの一覧に 1 件も存在しません**（§6.1 参照）。

### 1.2 能力・価格比較

| REST ID | 通称 | ステータス | 最大参照画像 | 出力解像度 | アスペクト比 | 価格 / 枚 | SynthID |
|---|---|---|---|---|---|---|---|
| `gemini-3-pro-image` | Nano Banana Pro | GA（`-preview` / `nano-banana-pro-preview` エイリアスも存在） | **14**（うち高忠実度は 6） | 1K / 2K / 4K | 10 種 | **$0.134**(1K・2K) / **$0.24**(4K) | あり + C2PA |
| `gemini-3.1-flash-image` | Nano Banana 2 | GA（`-preview` エイリアスあり） | **14**（うち高忠実度は 6） | 512px / 1K / 2K / 4K | **14 種** | $0.045(512) / **$0.067**(1K) / $0.101(2K) / $0.15(4K) | あり + C2PA |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | GA | **3** | 512px / 1K | 10 種 | **$0.034**(1K) | あり |
| `gemini-2.5-flash-image` | Nano Banana | **非推奨 / 2027-03-15 廃止** | **3** | 1K (1024px) のみ | 10 種 | $0.039(1K) | あり |

**アスペクト比 10 種（全モデル共通）**: `1:1` `2:3` `3:2` `3:4` `4:3` `4:5` `5:4` `9:16` `16:9` `21:9`
**+4 種（`gemini-3.1-flash-image` のみ）**: `1:4` `4:1` `1:8` `8:1`（超パノラマ・縦長帯）

出典: 能力・比率・参照画像枚数 = S3, S4 / 価格 = S2 / ID とステータス = S5, S7

### 1.3 価格の算出根拠（S2 の脚注を実取得）

Gemini の画像は**トークン課金**です。S2 の脚注原文（抜粋）:

> \*\* Gemini 3 Pro Image charges **560 tokens per input image**, with output image costs scaling by resolution: **1120 tokens ($0.134) for 1K and 2K** (roughly 1MP and 4MP), and **2000 tokens ($0.24) for 4K** (roughly 16MP).
> \*\*\* Gemini 3.1 Flash Image charges **1120 tokens per input image**, with output image costs scaling by resolution: **747 tokens ($0.045) for 512**, **1120 tokens ($0.067) for 1K**, **1680 tokens ($0.101) for 2K**, and **2,520 tokens ($0.15) for 4K**.
> \*\*\*\* Gemini 3.1 Flash-Lite Image charges 1120 tokens per input image, and **1120 tokens ($0.034) for 1K** output images.
> \*\*\* (Gemini 2.5 Flash Image) A 1024x1024 image consumes **1290 tokens ($0.039 per 1K output image)**.

画像出力の単価（/1M tokens）は Pro=$120.00、3.1 Flash Image=$60.00、3.1 Flash-Lite Image=$30.00、2.5 Flash Image=$30.00。
→ 例: 1120 × $120/1M = $0.1344 ≒ $0.134（Pro 1K）。表の数値と整合します。

> ⚠️ S2 は **Vertex AI（Gemini Enterprise Agent Platform）** の価格表です。本アプリが使う **Gemini Developer API（AI Studio の API キー）** の価格ページ（`ai.google.dev/gemini-api/docs/pricing`）は本セッションで取得できませんでした。両者は歴史的にほぼ同額ですが、**課金前に Developer API 側の価格ページを必ず確認してください**。

### 1.4 アスペクト比 → 実出力ピクセル（1K 時）

S4（公式 Cookbook）に載っている表をそのまま転記:

| アスペクト比 | 対応モデル | 出力サイズ (1K) |
|---|---|---|
| 1:1 | 全モデル | 1024 x 1024 |
| 2:3 / 3:2 | 全モデル | 832 x 1248 / 1248 x 832 |
| 3:4 / 4:3 | 全モデル | 864 x 1184 / 1184 x 864 |
| 4:5 / 5:4 | 全モデル | 896 x 1152 / 1152 x 896 |
| 9:16 / 16:9 | 全モデル | 768 x 1344 / 1344 x 768 |
| 21:9 | 全モデル | 1536 x 672 |
| 1:4 / 4:1 | NB2 / Pro | 超ワイド・パノラマ |
| 1:8 / 8:1 | NB2 / Pro | 極端なパノラマ |

2K / 4K は概ね線形に 2 倍 / 4 倍されます（4K ≒ 16MP、S2 の脚注と整合）。

### 1.5 コンテキスト・知識・透かし・地域

S3（Google Cloud 公式ブログ）より:

- **入力トークン**: `gemini-3.1-flash-image` = 131,072 / `gemini-3-pro-image` = 65,536。**出力トークン**: 両者 32,768。
- **知識カットオフ**: 両者 2025 年 1 月。ただし NB2 / Pro は **Google 検索グラウンディング**でリアルタイム情報を取得可能（`tools` に google_search を渡す）。
- **入力 MIME**: `image/png`, `image/jpeg`, `image/webp`, `image/heic`, `image/heif`（S3）。
  Discovery（S1）の `Blob.mimeType` 説明はさらに `image/jpg`, `image/gif`, `image/avif` も列挙。**PNG / JPEG / WebP に寄せるのが安全**です。
- **ファイルサイズ**: API / Cloud Storage 経由は **1 ファイル 50 MB** まで、コンソール直アップロードは 7 MB まで（S3）。
- **透かし**: 「All generated images include **C2PA Content Credentials and a SynthID watermark**」（S3 原文）。
  → 生成物は不可視の SynthID と C2PA メタデータを常に含みます。**無効化オプションはありません。**
  クライアント側で再エンコード（リサイズ・PNG→JPEG 変換等）すると **C2PA メタデータは失われる**ので、来歴を保持したい場合はオリジナルバイト列も保管してください。
- **地域**: Developer API は `global` エンドポイント 1 本（`generativelanguage.googleapis.com`）。Vertex 側は S2 に `Global` と `Non-global` の 2 価格帯があり、Non-global は約 +10%。`gemini-3.1-flash-lite-image` と `gemini-3-pro-image` の画像出力は S2 上 **Global のみ** の記載です。

### 1.6 非推奨タイムライン

- `gemini-2.5-flash-image`: **非推奨。廃止 2027-03-15**（当初 2026-10-02 予定から延期）。移行先は `gemini-3.1-flash-lite-image`。
- Google 公式スキル（S7）は `gemini-2.5-*` 全般を "legacy and deprecated / Never use them" と明記。
- → **モデルセレクタには残してよいが、`default` にはしない。UI 上で「非推奨」バッジを出すこと。**

---

## 2. text→image の REST リクエスト（Gemini Developer API）

### 2.1 エンドポイントと認証

Discovery（S1）より確定:

- `baseUrl`: `https://generativelanguage.googleapis.com/`
- `models.generateContent` の `path`: `v1beta/{+model}:generateContent`、`httpMethod`: `POST`

```
POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL_ID}:generateContent
x-goog-api-key: <GEMINI_API_KEY>
Content-Type: application/json
```

`{MODEL_ID}` は `gemini-3.1-flash-image` のように **`models/` 接頭辞なし**で入れます。

> **ライブ検証済み（S8）**: 上記 URL・ヘッダ・下記ボディで実際に送出したところ、ルーティングとスキーマ検証を通過し `API_KEY_INVALID`（ダミーキーのため）で止まりました。エンドポイント形・ヘッダ名・モデル ID・ボディ構造が現行 API に受理されることを確認しています。

### 2.2 最小 curl（検証済みの形）

```bash
curl -sS -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: ${GEMINI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          { "text": "A minimal Japanese-aesthetic poster for a tea ceremony exhibition. Off-white washi paper texture, a single vermilion circle slightly off-center, generous negative space. The words \"静寂\" set in a refined vertical serif, small and bottom-right." }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {
        "aspectRatio": "2:3",
        "imageSize": "2K"
      }
    },
    "safetySettings": [
      { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH" },
      { "category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_ONLY_HIGH" },
      { "category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "BLOCK_ONLY_HIGH" },
      { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH" }
    ]
  }' | jq -r '.candidates[0].content.parts[] | select(.inlineData) | .inlineData.data' | base64 -d > out.png
```

### 2.3 `generationConfig` フィールド名（Discovery で 1 件ずつ照合）

S1 の `GenerationConfig` スキーマに実在するプロパティ（画像生成に関係するもののみ）:

| フィールド | 型 | Discovery の説明（抜粋） |
|---|---|---|
| `responseModalities` | `string[]` | enum: `MODALITY_UNSPECIFIED` / **`TEXT`** / **`IMAGE`** / `AUDIO`。「An empty list is equivalent to requesting only text.」 |
| `imageConfig` | `ImageConfig` | 「Optional. Config for image generation. An error will be returned if this field is set for models that don't support these config options.」 |
| `imageConfig.aspectRatio` | `string` | 「Supported aspect ratios: `1:1`, `1:4`, `4:1`, `1:8`, `8:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, or `21:9`. **If not specified, the model will choose a default aspect ratio based on any reference images provided.**」 |
| `imageConfig.imageSize` | `string` | 「Supported values are `512`, `1K`, `2K`, `4K`. **If not specified, the model will use default value `1K`.**」 |
| `candidateCount` | `integer` | 1 リクエストあたりの候補数。既定 1。 |
| `seed` | `integer` | 「Seed used in decoding. If not set, the request uses a randomly generated seed.」→ 再現性が要るデザイン反復で有用。 |
| `temperature` / `topP` / `topK` | number | 画像モデルでも受理されるが、既定のままで良い。 |

> ⚠️ **`imageSize` の値表記のゆれ**: Discovery（S1）は `512` と書き、公式 Cookbook（S4）の UI パラメータは `"512px"` と書いています。`1K` / `2K` / `4K` は両者一致。**512 を使う場合は両表記を試してレスポンスの実寸で確認してください。** `1K`/`2K`/`4K` のみ使うなら問題ありません。

> ⚠️ **`imageSize` は対応モデルのみ**: Discovery の説明どおり、非対応モデルに `imageConfig` を渡すとエラーになります。`gemini-2.5-flash-image` は `imageSize` 非対応（1K 固定）なので、**セレクタで選ばれたモデルに応じて `imageSize` を出し分ける**実装にしてください（promptGuide.json の `supportsImageSize` がこの用途）。

### 2.4 参照画像の渡し方（`parts[]`）

S1 の `Part` スキーマに存在するのは `text` / `inlineData`(型 `Blob`) / `fileData`(型 `FileData`) など。
`Blob` は `{ mimeType, data, displayName? }`、`FileData` は `{ mimeType, fileUri, displayName? }`。

```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "Use the first image for composition and the second only for its colour palette." },
      { "inline_data": { "mime_type": "image/png",  "data": "<BASE64_1>" } },
      { "inline_data": { "mime_type": "image/jpeg", "data": "<BASE64_2>" } }
    ]
  }],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": { "aspectRatio": "16:9", "imageSize": "2K" }
  }
}
```

**JSON のケーシングについて（重要）**: Google の proto3 JSON マッピングにより、リクエストは **snake_case（`inline_data` / `mime_type`）でも camelCase（`inlineData` / `mimeType`）でも受理**されます。
一方 **レスポンスは常に camelCase**（`inlineData` / `mimeType`）で返ります。パース側は camelCase 固定で書いてください。

### 2.5 レスポンスの形

S1 の `GenerateContentResponse` / `Candidate` / `PromptFeedback` より:

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          { "text": "Here is the poster you asked for." },
          { "inlineData": { "mimeType": "image/png", "data": "iVBORw0KGgoAAAANS..." } }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": [
        { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "probability": "NEGLIGIBLE", "blocked": false }
      ]
    }
  ],
  "promptFeedback": {
    "blockReason": "IMAGE_SAFETY",
    "safetyRatings": [ /* ... */ ]
  },
  "usageMetadata": { "promptTokenCount": 21, "candidatesTokenCount": 1120, "totalTokenCount": 1141 },
  "modelVersion": "gemini-3.1-flash-image",
  "responseId": "..."
}
```

`parts[]` は **text と image が混在**します（`responseModalities: ["TEXT","IMAGE"]` の場合）。
画像だけ欲しいときは `responseModalities: ["IMAGE"]` にすると text part が減りトークンも節約できます（S4 で明示）。
Gemini 3 系は思考パートを返すことがあるため、`part.thought === true` の part はスキップしてください（S6 の公式サンプルがそうしています）。

### 2.6 ブロック / 空結果の検出（Discovery の enum で網羅）

`candidates[].finishReason` の enum（S1、全 22 値のうち画像で効くもの）:

```
STOP, MAX_TOKENS, SAFETY, RECITATION, LANGUAGE, OTHER, BLOCKLIST,
PROHIBITED_CONTENT, SPII,
IMAGE_SAFETY, IMAGE_PROHIBITED_CONTENT, IMAGE_OTHER, NO_IMAGE, IMAGE_RECITATION,
MALFORMED_RESPONSE, ...
```

`promptFeedback.blockReason` の enum（S1、全量）:

```
BLOCK_REASON_UNSPECIFIED, SAFETY, OTHER, BLOCKLIST, PROHIBITED_CONTENT, IMAGE_SAFETY
```

判定ロジックはこの順で書くのが安全です:

```js
function extractImage(json) {
  // 1) プロンプト自体が弾かれた: candidates は空で返る
  const blockReason = json?.promptFeedback?.blockReason;
  if (blockReason) {
    return { ok: false, kind: "prompt_blocked", reason: blockReason };
  }

  const cand = json?.candidates?.[0];
  if (!cand) return { ok: false, kind: "empty", reason: "NO_CANDIDATE" };

  // 2) 生成途中で弾かれた / 画像が出なかった
  const fr = cand.finishReason;
  const imageFailure = [
    "SAFETY", "PROHIBITED_CONTENT", "RECITATION", "BLOCKLIST", "SPII",
    "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION",
    "IMAGE_OTHER", "NO_IMAGE",
  ];
  if (fr && imageFailure.includes(fr)) {
    return { ok: false, kind: "generation_blocked", reason: fr, message: cand.finishMessage };
  }

  // 3) finishReason が STOP でも画像 part が無いことは普通にある（テキストだけ返す）
  const parts = cand.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("\n");
    return { ok: false, kind: "no_image_part", reason: fr ?? "STOP", modelText: text };
  }

  return { ok: true, mimeType: img.inlineData.mimeType, data: img.inlineData.data };
}
```

**`kind: "no_image_part"` は必ず実装してください。** 画像モデルでも「指示が曖昧」「安全側に倒した」場合に
テキストだけ返すことが実運用でよくあり、`finishReason` は `STOP` のままです。その `modelText` をそのまま
UI に出すと、ユーザーがプロンプトを直すヒントになります。

### 2.7 safetySettings

S1 の `SafetySetting` は `{ category, threshold }` の 2 フィールドのみ。

- `category` enum（画像で実用的なもの）: `HARM_CATEGORY_HARASSMENT`, `HARM_CATEGORY_HATE_SPEECH`, `HARM_CATEGORY_SEXUALLY_EXPLICIT`, `HARM_CATEGORY_DANGEROUS_CONTENT`, `HARM_CATEGORY_CIVIC_INTEGRITY`
- `threshold` enum: `BLOCK_LOW_AND_ABOVE`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_ONLY_HIGH`, `BLOCK_NONE`, `OFF`

デザイン用途では `BLOCK_ONLY_HIGH` が実用的です。`BLOCK_NONE` / `OFF` はアカウント設定によっては拒否される場合があります。
なお **safetySettings を緩めても画像側の安全フィルタ（`IMAGE_SAFETY`）は別系統**で、完全には無効化できません。

---

## 3. image→image 編集 / 複数参照合成

### 3.1 参照画像の枚数（公式の数字）

S4（公式 Cookbook）原文:

> You can mix multiple images (**up to 3 with Nano-Banana 2 Lite, up to 14 with Nano-Banana 2 and Pro, 6 with high fidelity**)

S6（旧 JS Cookbook）原文:

> you can mix multiple images (**up to 3 with nano-banana, 14 with pro**)

S3（Cloud ブログ）原文:

> You can mix **up to 14 reference object images** in a single prompt.

まとめ:

| モデル | 参照画像上限 | 高忠実度で扱える枚数 |
|---|---|---|
| `gemini-3-pro-image` | 14 | 6 |
| `gemini-3.1-flash-image` | 14 | 6 |
| `gemini-3.1-flash-lite-image` | 3 | — |
| `gemini-2.5-flash-image` | 3 | — |

S3 はさらに、Pro について「**最大 5 人の人物の一貫性**、**最大 6 個のオブジェクトの高忠実度再現**」という粒度の記述もあります。
**14 枚を超えたいとき**の公式回避策（S4 のヒント原文）:

> Tip: Combine multiple images into a single collage first if you need to go beyond the image upload limit.

→ クライアント側で参照画像をタイル状の 1 枚に合成し、プロンプトで「左上がロゴ、右上がカラーパレット…」と位置で役割を伝える。

### 3.2 役割の指示（"1 枚目は構図、2 枚目はパレット"）

S3 の公式フォーミュラ:

> **Formula: [Reference images] + [Relationship instruction] + [New scenario]**
>
> Example Prompt: *Using the attached napkin sketch as the structure and the attached fabric sample as the texture [References], transform this into a high-fidelity 3D armchair render [Relationship]. Place it in a sun-drenched, minimalist living room [New Scenario].*

実務上のポイント:

- **`parts[]` の順序＝参照番号**。テキスト part を先頭に置き、その中で "the first image" / "the second image" と序数で参照する。
- さらに堅いのは `Blob.displayName` の活用。S1 に実在するフィールドで、説明は
  「Specifies the name used to refer to this blob to the model (e.g. "my_blob.png")」。
  `displayName: "composition_ref"` のように付け、プロンプト側で `composition_ref` と名指しできます。
  （※ 説明文に `verbalization_mode` への言及があり挙動が条件付きの可能性あり。**序数での指示を主、displayName を補助**にしてください。）
- 役割は**肯定形で、何を取り何を捨てるかを両方書く**:
  `Use the first image ONLY for the layout and camera angle. Use the second image ONLY for its colour palette; ignore its subject matter entirely.`

### 3.3 編集の指示文（S3 の公式ガイダンス）

> Editing requires a different mindset than generating. You already have a base image; your prompt needs to focus on **what is changing and what is staying the same**.
> - **Semantic masking (inpainting)**: You can define a "mask" through text to edit a specific part of an image while leaving the rest untouched.
> - **Prompting tip: Be explicit about what to keep exactly the same.**

さらに S3 は「プロンプトは**強い動詞で始める**」ことを推奨:

> The key is to start a prompt with a strong verb that tells the model the primary operation you want to perform.

→ `Replace...` / `Remove...` / `Restyle...` / `Extend...` / `Recolour...` / `Relight...`

### 3.4 入力サイズ上限

- **1 ファイル 50 MB**（API / Cloud Storage 経由）、コンソール直アップロードは 7 MB（S3）。
- **ピクセル上限の明示的な数値は、取得できた一次情報の中にありませんでした。**（`ai.google.dev` が遮断されているため未確認）
  実務的には長辺 1568px 程度に事前リサイズすれば十分で、それ以上は入力トークンを増やすだけです
  （入力画像は Pro で 560 tokens / 枚、NB2 で 1120 tokens / 枚の固定課金＝S2 脚注）。
- **大きい参照画像は Files API を使う**: S1 の Discovery に `files` リソースと `Part.fileData { fileUri, mimeType }` が実在します。
  アップロード後に `file_data` で参照すれば、リクエストボディに base64 を積まずに済み、§5.4 のサイズ問題を回避できます。

### 3.5 対応入力 MIME

`image/png`, `image/jpeg`, `image/webp`, `image/heic`, `image/heif`（S3）。
S1 の `Blob.mimeType` 説明はさらに `image/jpg`, `image/gif`, `image/avif` を列挙。
加えて `gemini-3.1-flash-image` は **動画・YouTube URL からの画像生成**にも対応（S4 の video-to-image セクション）。

---

## 4. 公式プロンプトガイドの要点（S3 / S4 を蒸留）

### 4.1 大原則: キーワードの羅列ではなく、情景を語る

S3 の "Best practices" 原文:

> - **Be specific**: Provide concrete details on subject, lighting, and composition.
> - **Use positive framing**: Describe what you want, not what you don't want (e.g. "empty street" instead of "no cars").
> - **Control the camera**: Use photographic and cinematic terms like "low angle" and "aerial view".
> - **Iterate**: Refine images with follow-up prompts in a conversational manner.

text-to-image の公式フォーミュラ:

> **Formula: [Subject] + [Action] + [Location/context] + [Composition] + [Style]**

### 4.2 カメラ・レンズ・ライティング・質感（"Creative Director のように書く"）

S3 の §5 を要約:

- **ライティング設計**: `three-point softbox setup`（製品を均一に）、`Chiaroscuro lighting with harsh, high contrast`、`Golden hour backlighting creating long shadows`
- **カメラ本体で画の DNA を決める**: `GoPro`（没入・歪み）、`Fujifilm`（色再現）、`cheap disposable camera`（生っぽいフラッシュ）
- **レンズ**: `low-angle shot with a shallow depth of field (f/1.8)` / `wide-angle lens`（スケール感）/ `macro lens`（微細）
- **カラーグレーディング・フィルム**: `as if on 1980s color film, slightly grainy` / `Cinematic color grading with muted teal tones`
- **素材と質感を必ず名指しする**: "suit jacket" ではなく `navy blue tweed`、"armor" ではなく `ornate elven plate armor, etched with silver leaf patterns`、モックアップなら `minimalist ceramic coffee mug`

### 4.3 画像内テキスト（デザイン用途の要）

S3 の §4 原文ルール:

> - **Use quotes**: Enclose your desired words in quotes (e.g., "Happy Birthday" or "URBAN EXPLORER").
> - **Choose a font**: Describe the typography style or name of the font. Prompt for a "bold, white, sans-serif font" or "Century Gothic 12px font".
> - **Translate and localize**: Write your prompt in one language and specify a target language for the text output.
> - **Text-first hack**: When generating text for an image, Gemini Image models work best if you **first converse with it to generate the text concepts, and then ask for an image with that text**.

公式の実例（そのまま使える書式）:

> A high-end, glossy commercial beauty shot of a sleek, minimalist nude-colored face moisturizer jar resting on a warm studio background. The lighting is soft and radiant. Next to the product, render three lines of text with the following exact styling: For the top line, the word 'GLOW' in a flowing, elegant Brush Script font. For the middle line, the text '10% OFF' in a heavy, blocky Impact font. For the bottom line, the text 'Your First Order' in a thin, minimalist Century Gothic font.

タイポグラフィを型抜きに使う公式実例:

> A typographic poster with a solid black background, bold letters spell "New York", filling the center of the frame. **The text acts as a cut-out window.** A photograph of New York skyline is visible ONLY inside the letterforms.

**限界**: NB2 / Pro は「10 言語以上の多言語テキスト生成」に対応（S3）し、S4 では英語インフォグラフィックを日本語へ翻訳する例が載っています。
ただし**長文になるほど破綻率が上がる**のは変わりません。実務では **1 画像あたり 3〜5 ブロック程度の短い文字列**に留め、
本文・法定表記・正確なロゴは**後段で SVG / CSS で重ねる**のが安全です。

### 4.4 反復編集（iterative editing）

S4 の推奨は会話の継続:
- **Interactions API** では `previous_interaction_id` で前ターンを参照（画像バイトの再送不要）。
- **`generateContent`（本アプリが使う方）**では、`contents` に `role: "user"` / `role: "model"` を交互に積んで会話履歴を作るか、
  前回の出力画像を `inline_data` として再投入します。実装がシンプルなのは後者です。

S3 の編集例: `"Remove the man from the photo"` のように**操作を 1 つに絞る**。複数変更を 1 プロンプトに詰めると精度が落ちます。

### 4.5 スタイル転送

S3 原文:

> **Style transfer**: Upload a photo and ask the model to recreate its **exact content** in a different artistic style, such as transforming a photo of a modern city street into a Van Gogh-style painting.

「内容は完全に維持、様式だけ差し替える」と明示するのがコツです。

### 4.6 キャラクター / プロダクトの一貫性

- 参照画像を渡し、**変えてはいけない属性を列挙**する（`Keep the bottle's proportions, label typography and cap colour identical.`）。
- Pro は**最大 5 人の人物の一貫性**と**6 個のオブジェクトの高忠実度**を維持できる（S3）。
- 会話継続（同一セッション内の反復編集）の方が、毎回テキストだけで再生成するより一貫性が高い（S4 のマルチターン例）。
- `seed` を固定すると反復時のブレを抑えられます（S1 に実在するフィールド）。

### 4.7 ネガティブ指定（`negative_prompt` は存在しない — 検証済み）

**検証方法**: S1（Discovery revision 20260917）の**全スキーマのプロパティ名を機械的に走査**し、
`/negative/i` にマッチするフィールドを探した結果 — **ヒット 0 件**。

つまり `GenerationConfig` にも `ImageConfig` にも `GenerateContentRequest` にも
`negativePrompt` / `negative_prompt` は**存在しません**。（Imagen の `:predict` には過去 `negativePrompt` がありましたが、
それは別 API 面であり、§6.1 のとおり Developer API からは既に消えています。）

代替は S3 が明示する **positive framing**:

> **Use positive framing**: Describe what you want, not what you don't want (e.g. "empty street" instead of "no cars").

| 書きたいこと | ❌ 悪い書き方 | ✅ 良い書き方 |
|---|---|---|
| 人を入れたくない | `no people, no humans` | `a completely deserted plaza at dawn, not a single person in sight` |
| 文字を入れたくない | `no text, no watermark` | `a clean, unlettered surface with no signage or lettering anywhere` |
| ごちゃつかせたくない | `not cluttered` | `a spare composition with large areas of flat, uninterrupted negative space` |

※「〜がない状態」を**情景として描写する**なら否定語を使って構いません。効かないのは `no X` の羅列です。

### 4.8 デザイン成果物向け 具体例プロンプト 10 本

すべて S3 のフォーミュラ（`[Subject] + [Action] + [Location/context] + [Composition] + [Style]`）と
テキストレンダリング規則（引用符 + フォント指定）に沿って構成しています。

**1. ポスター（タイポグラフィ階層あり）** — `aspectRatio: "2:3"`, `imageSize: "2K"`, model: Pro
> A printed exhibition poster for a contemporary ceramics show. The composition is built on a strict three-tier typographic hierarchy: the headline "土と火" in a heavy, condensed vertical sans-serif occupying the top third; the subtitle "Contemporary Japanese Ceramics 2026" in a thin, wide-tracked Latin sans beneath it; and the venue line "Kyoto Art Center / 4.12 — 6.28" in a small monospace at the bottom edge. Behind the type, a single unglazed stoneware vessel is lit by a hard raking light from the left, casting a long shadow across a warm grey paper ground. Shot on medium-format film, subtle paper grain, muted earth palette of clay, ash and charcoal.

**2. プロダクト キービジュアル** — `aspectRatio: "16:9"`, `imageSize: "4K"`, model: Pro
> A high-end commercial key visual for a glass fragrance bottle. The bottle stands on a polished travertine plinth, floating droplets of water suspended in mid-air around it. Lit with a three-point softbox setup plus a single hard rim light from behind to catch the glass edge. Medium close-up, centred, shallow depth of field at f/2.0 on an 85mm lens. The label reads "SORAIRO" in a thin, precisely kerned modern serif. Cool pastel gradient backdrop shifting from pale blue to bone white, immaculate reflections, crisp material textures.

**3. エディトリアル イラストレーション** — `aspectRatio: "4:5"`, `imageSize: "2K"`, model: NB2
> An editorial illustration for a long-form article about urban loneliness. A single figure sits on the edge of a vast, empty rooftop at blue hour, dwarfed by the scale of the city behind them. Flat vector shapes with visible grain overlay, limited palette of dusty indigo, warm ochre and off-white, no outlines. Composed with the figure small in the lower-left third and a large expanse of uninterrupted sky filling the rest of the frame.

**4. OOH ビルボード モック** — `aspectRatio: "21:9"`, `imageSize: "4K"`, model: Pro
> A photorealistic mockup of a large-format billboard mounted on the side of a concrete building, photographed from street level at a low angle with a 24mm wide-angle lens during golden hour. The billboard artwork is a bold, minimal composition: a single vermilion circle on an off-white field with the word "めぐる" set large in an elegant vertical serif. Real-world context is visible — power lines, a slice of pavement, warm late-afternoon light raking across the board's surface with a faint sheen.

**5. SNS スクエア** — `aspectRatio: "1:1"`, `imageSize: "1K"`, model: NB2 Lite
> A square social post announcing a seasonal tea blend. A ceramic cup of pale green tea sits slightly off-centre on a linen cloth, steam catching a soft window light from the upper left. Overhead flat-lay composition with generous empty space in the upper right where the words "新茶はじめました" are rendered in a clean, medium-weight Japanese sans-serif. Soft natural daylight, gentle shadows, muted sage and cream palette, shot on a 50mm lens.

**6. Web ヒーロー** — `aspectRatio: "16:9"`, `imageSize: "2K"`, model: NB2
> A wide web hero image for a landscape architecture studio. A stone path curves from the lower-left foreground into a misty grove of maples, the far end dissolving into soft fog. Deliberately composed with the left 40 percent of the frame kept visually quiet and low-contrast so that headline text can be overlaid there. Early morning light, cool desaturated greens, fine atmospheric haze, shot on a 35mm lens at f/4.

**7. 3D レンダー** — `aspectRatio: "4:3"`, `imageSize: "2K"`, model: Pro
> A high-fidelity 3D product render of a modular shelving system in soft matte plastic. Three units are arranged in a stepped isometric configuration on a seamless pale grey backdrop. Studio lighting with a large overhead area light and subtle fill from the left, producing soft contact shadows. Clean subsurface-free matte materials in bone white, sage and terracotta, physically based rendering, razor-sharp edges, faint ambient occlusion in the joints.

**8. リソグラフ / 印刷テクスチャ** — `aspectRatio: "2:3"`, `imageSize: "2K"`, model: NB2
> A risograph-printed gig poster. Two ink layers only — fluorescent pink and deep blue — with visible misregistration of about two millimetres along the right edge and the characteristic mottled, uneven ink coverage of a Riso drum. The subject is a stylised bird mid-flight rendered in coarse halftone dots. The words "NIGHT CHORUS" are set in a chunky, slightly distressed grotesque across the lower third. Printed on uncoated cream paper with visible fibre texture.

**9. ミニマル・日本的美意識** — `aspectRatio: "3:4"`, `imageSize: "2K"`, model: Pro
> A quiet, minimal composition in the Japanese aesthetic tradition. A single dried persimmon branch rests diagonally across a field of undyed washi paper, occupying only the lower-right quadrant. The remaining three quarters of the frame are empty, textured paper. Soft, even north-facing daylight with almost no shadow. The characters "余白" appear very small in the upper-left corner in a refined vertical brush script. Palette limited to bone white, pale ochre and a single muted vermilion accent.

**10. フォトキャンペーン（人物）** — `aspectRatio: "4:5"`, `imageSize: "2K"`, model: Pro
> A fashion campaign photograph. A model wearing an oversized indigo-dyed linen coat stands with a confident, statuesque posture, slightly turned away from camera and looking back. Seamless deep clay-red studio backdrop. Medium-full shot, centre-framed with headroom. Fashion magazine editorial style, shot on medium-format analog film, pronounced grain, high colour saturation, cinematic side lighting from a single large softbox at 45 degrees.

**11. スタイル転送（参照 1 枚）** — image→image, model: NB2
> Using the provided photograph, recreate its exact content, composition and camera angle as a hand-pulled screenprint: four flat spot colours, heavy black key line, visible paper texture and slight ink bleed at the edges. Keep every element and its placement identical; change only the rendering technique.

**12. マルチ参照合成（参照 3 枚）** — image→image, model: Pro
> Use the first image for the overall composition and camera angle. Use the second image only for its colour palette — ignore its subject matter entirely. Use the third image as the exact product that must appear in the scene, preserving its proportions, label typography and cap colour precisely. Combine them into a single premium skincare key visual lit with a soft three-point softbox setup on a warm stone surface.

---

## 5. エラーハンドリングと割り当て（quota）

### 5.1 レート制限の次元

Gemini API のレート制限は **プロジェクト単位**（API キー単位ではない）で、次の次元があります:

- **RPM**（requests per minute）
- **RPD**（requests per day / 太平洋時間の深夜にリセット）
- **TPM**（tokens per minute）
- **IPM**（images per minute）— **画像生成モデル固有の次元**。見落としやすいボトルネック。

> ⚠️ **具体的な数値は本書に書きません。** 公式レート制限ページ（`ai.google.dev/gemini-api/docs/rate-limits`）は
> 本セッションで取得できず、かつ値はティア（Free / Tier 1 / 2 / 3）・課金状況・プレビュー状態・プロジェクトごとに異なります。
> **Google AI Studio の認証済みレート制限画面が唯一の正**です。実装前にそこで確認してください。
> なお `gemini-3.1-flash-lite-image` は**無料枠あり**（S4 が明記）、それ以外の画像モデルは基本的に課金必須です。

### 5.2 HTTP ステータスの扱い

| コード | 意味 | 再試行 | 対応 |
|---|---|---|---|
| **400** `INVALID_ARGUMENT` | ボディ不正 / 非対応モデルに `imageConfig` を渡した等 | ❌ しない | ログに残して修正。`imageSize` 非対応モデルに送っていないか確認 |
| **403** | API キーの権限 / 請求先未設定 | ❌ しない | キーと課金設定を確認 |
| **404** | モデル ID の綴り間違い / 廃止済みモデル | ❌ しない | `models.list` で実在確認 |
| **429** `RESOURCE_EXHAUSTED` | RPM / RPD / TPM / **IPM** 超過 | ⭕ する | 指数バックオフ。RPD 超過なら当日中は回復しないので即座にユーザーへ通知 |
| **500** `INTERNAL` | サーバ側の一時障害 | ⭕ 1 回だけ | 同一プロンプトで再送 |
| **503** `UNAVAILABLE` | モデル過負荷 | ⭕ する | 指数バックオフ。続くなら軽いモデルへフォールバック |
| **504** | ゲートウェイタイムアウト | △ | 4K 生成では起こりうる。解像度を落として再試行 |

### 5.3 Vercel サーバーレス（最大 60 秒）での再試行戦略

**前提**: 画像生成は 1 枚あたり **1K で 10〜20 秒、4K や Pro の thinking 込みで 40 秒超**になることがあります。
60 秒の予算では**再試行は現実的に 1 回まで**です。ナイーブな指数バックオフ（1s/2s/4s/8s/16s）を関数内で回すと
リトライする前に関数ごと落ちます。

推奨する設計:

1. **予算管理型リトライ**: 残り時間を計算し、「残り時間 < 想定所要時間」なら再試行せず即座に諦める。
2. **AbortController で必ず上限を切る**: `fetch` にタイムアウトを付けないと関数のハードリミットに巻き込まれて
   エラーレスポンスすら返せません。
3. **429 は 1 回だけ、短いジッタ付きで**。`RPD` 超過が疑われる場合（`Retry-After` が長い / エラー文言に daily）は即座に諦める。
4. **4K と Pro は同期処理にしない**。ジョブキュー（Vercel の background function / QStash / DB ポーリング）に逃がし、
   同期エンドポイントは 1K・2K のプレビュー専用にする。
5. **フォールバック階段**: `gemini-3-pro-image` (4K) → 503 が続く → `gemini-3.1-flash-image` (2K) → `gemini-3.1-flash-lite-image` (1K)。

```js
// api/generate-image.js  —  Vercel serverless (Node runtime), 60s hard limit
export const config = { maxDuration: 60 };

const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const HARD_BUDGET_MS = 55_000;   // 60s のうち 5s は後処理とレスポンス送出に残す
const PER_CALL_MS    = 45_000;   // 1 回の fetch に許す上限

function buildBody({ prompt, refs = [], aspectRatio, imageSize, supportsImageSize }) {
  const parts = [{ text: prompt }];
  for (const r of refs) {
    // r = { mimeType: "image/png", data: "<base64 without data: prefix>" }
    parts.push({ inline_data: { mime_type: r.mimeType, data: r.data } });
  }

  const imageConfig = { aspectRatio };
  // imageSize をサポートしないモデルに渡すと 400 になる
  if (supportsImageSize && imageSize) imageConfig.imageSize = imageSize;

  return {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };
}

async function callOnce(model, body, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT(model), {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON エラーページ */ }
    return { status: res.status, json, raw: text, retryAfter: res.headers.get("retry-after") };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const started = Date.now();
  const { prompt, refs, aspectRatio = "1:1", imageSize = "1K",
          model = "gemini-3.1-flash-image", supportsImageSize = true } = req.body ?? {};

  const body = buildBody({ prompt, refs, aspectRatio, imageSize, supportsImageSize });

  let attempt = 0;
  let lastErr = null;

  while (attempt < 2) {                      // 60s 予算では実質 2 回が上限
    const remaining = HARD_BUDGET_MS - (Date.now() - started);
    if (remaining < 8_000) break;            // 残りが短すぎるなら試さない

    let r;
    try {
      r = await callOnce(model, body, Math.min(PER_CALL_MS, remaining - 2_000));
    } catch (e) {
      // AbortError を含む
      lastErr = { kind: "timeout", message: String(e?.message ?? e) };
      break;                                 // タイムアウトは再試行しても間に合わない
    }

    if (r.status === 200) {
      const out = extractImage(r.json);      // §2.6 の関数
      if (out.ok) {
        return res.status(200).json({
          mimeType: out.mimeType,
          data: out.data,                    // base64。§5.4 の注意を参照
          model,
        });
      }
      // 200 だが画像なし = 安全ブロック等。再試行しても同じなので即返す
      return res.status(422).json({ error: out });
    }

    // 再試行しても無駄なもの
    if ([400, 401, 403, 404].includes(r.status)) {
      return res.status(r.status).json({ error: r.json?.error ?? r.raw });
    }

    if ([429, 500, 503, 504].includes(r.status)) {
      lastErr = { kind: "upstream", status: r.status, error: r.json?.error ?? null };

      // 日次クォータ切れは待っても回復しない
      const msg = (r.json?.error?.message ?? "").toLowerCase();
      if (r.status === 429 && (msg.includes("per day") || msg.includes("daily"))) break;

      const suggested = Number(r.retryAfter) * 1000;
      const backoff = Number.isFinite(suggested) && suggested > 0
        ? suggested
        : 1_500 * Math.pow(2, attempt) + Math.random() * 500;   // ジッタ付き

      if (Date.now() - started + backoff > HARD_BUDGET_MS - 10_000) break;
      await new Promise((r2) => setTimeout(r2, backoff));
      attempt += 1;
      continue;
    }

    lastErr = { kind: "unexpected", status: r.status, raw: r.raw?.slice(0, 500) };
    break;
  }

  // クライアントに「時間を置いて再試行可能」であることを伝える
  return res.status(503).json({
    error: lastErr ?? { kind: "unknown" },
    retryable: true,
    hint: "解像度を下げるか、軽量モデルに切り替えて再試行してください。",
  });
}
```

### 5.4 base64 ペイロードのサイズ問題（見落とし厳禁）

base64 は元バイト数を **約 1.37 倍**（4/3 + 改行）に膨らませます。

**リクエスト方向**:
- Vercel サーバーレス関数のリクエストボディ上限は **4.5 MB**。
- 3 MB の参照画像 1 枚 → base64 で約 4.1 MB。**参照 2 枚で即座に上限超過**します。
- 対策（推奨順）:
  1. **クライアント側で事前リサイズ**（長辺 1568px 程度・JPEG q80）してから送る。入力トークンは固定課金なので画質を落としても課金は変わらず、上限だけ回避できる。
  2. **Files API を使う**（S1 に `files` リソースと `Part.fileData` が実在）。アップロード済みファイルを `file_uri` で参照すれば、本体ボディに base64 を積まずに済む。
  3. クライアント → Blob ストレージ（Vercel Blob / S3）へ直接アップロードし、サーバー関数は URL だけ受け取る。

**レスポンス方向（こちらの方が深刻）**:
- 4K PNG は素で 10〜25 MB になりえます。base64 化すると **14〜34 MB**。
- Vercel サーバーレス関数のレスポンス上限も **4.5 MB** なので、**4K を base64 でそのまま返すと確実に失敗します**。
- 対策:
  1. サーバー関数内で base64 をデコードし、**Blob ストレージへ保存して署名付き URL だけ返す**。これが本命。
  2. 同期プレビューは **1K 固定**（1K PNG ≒ 1〜2 MB → base64 1.4〜2.8 MB でぎりぎり収まる）。
  3. 2K / 4K は**非同期ジョブ**にして、完成後に URL を通知する。

**DB / localStorage に base64 を貯めない**こと。画像はオブジェクトストレージ、DB には URL とメタデータ（プロンプト・モデル・比率・seed）だけを持たせる設計にしてください。

---

## 6. 代替手段の比較（参考・深追いしない）

### 6.1 Imagen 4（`:predict`）— **Developer API では既に利用不可の可能性が高い**

Imagen は `models.generateContent` ではなく **`POST .../v1beta/models/{model}:predict`** を使う別系統の API でした
（S1 の Discovery には `models.predict` メソッドと `PredictRequest` が今も実在します）。
リクエストは `{ "instances": [{ "prompt": "..." }], "parameters": { "sampleCount": 4, "aspectRatio": "16:9", "personGeneration": "allow_adult", "negativePrompt": "..." } }` という形で、
**Gemini 系と違い `negativePrompt` が存在する**のが最大の差でした。

しかし **S5（実 `models.list` 出力）に `imagen-*` は 1 件も含まれていません**。
Web 検索でも「Imagen 4 の standard / fast / ultra エンドポイントは 2026-06-15 に非推奨化、**2026-08-17 に停止**、移行先は `gemini-3.1-flash-image`」という情報が一致して出てきます。
一方 Vertex AI の価格表（S2）には Imagen 4（$0.04）/ Ultra（$0.06）/ Fast（$0.02）/ Imagen 4 Upscaling（$0.06、2K・3K・4K へのアップスケール）が**まだ記載**されています。

**結論**: 本アプリ（Developer API キー利用）では **Imagen を選択肢に入れないでください。**
Vertex AI 経由でのみ生き残っている可能性がありますが、その確認は本セッションのネットワーク制約により未実施です。
唯一惜しいのは Imagen 4 Upscaling（既存画像の 2K/3K/4K 化）ですが、
NB2 / Pro がネイティブ 4K を出せる今、必要性は低いはずです。

### 6.2 OpenAI `gpt-image-1`

OpenAI の画像モデル。`POST /v1/images/generations`（および `/v1/images/edits`）で、`model`・`prompt`・`size`・`quality`・`n` を渡す独立した API 系統です。
テキストレンダリングの正確さでは Gemini と並んで評価が高い一方、**1 枚あたり $0.17〜0.19 前後（high quality）と Nano Banana Pro の $0.134 より高価**で、
生成に 1 分前後かかるという報告が多く、**Vercel の 60 秒制限とは相性が悪い**です。
参照画像による合成や会話的編集の作り込みは Gemini 側が厚く、日本語テキストの描画も NB2 / Pro の多言語対応が有利。
**比較検証用のサブ選択肢**に留めるのが妥当です。（※ 価格・速度は二次情報ベース。採用するなら OpenAI 公式価格ページで再確認してください。）

### 6.3 その他

- **Midjourney / Stable Diffusion 系（Replicate 等）**: 美的品質や特定スタイルの再現では依然強力ですが、
  公式の商用 API・SLA・来歴メタデータ（C2PA）の整備という点で Gemini に劣ります。ブランド案件では取り扱い注意。
- **Veo / Lyria との連携**: S3 が明示しているとおり、Nano Banana でキーフレームを作り Veo で動画化、Lyria で音を付ける、という
  同一ベンダー内のパイプラインが組めます。将来 KV → 動画バナー展開をやるなら有利な点です。

---

## 7. 実装チェックリスト

- [ ] デフォルトモデルを `gemini-3.1-flash-image` にする（`gemini-2.5-flash-image` は非推奨バッジ付きで残すだけ）
- [ ] `imageConfig.imageSize` は `supportsImageSize: true` のモデルにのみ付与する（2.5 は 1K 固定）
- [ ] `aspectRatio` の選択肢をモデルごとに出し分ける（`1:4` `4:1` `1:8` `8:1` は `gemini-3.1-flash-image` のみ）
- [ ] レスポンスは camelCase (`inlineData` / `mimeType`) でパースする
- [ ] `promptFeedback.blockReason` → `finishReason` → 「画像 part なし」の 3 段で失敗を判定する
- [ ] `part.thought === true` の part を読み飛ばす（Gemini 3 系）
- [ ] 参照画像はクライアント側で長辺 1568px 程度にリサイズしてから送る
- [ ] 4K / 2K は同期レスポンスで base64 を返さない（Blob 保存 → URL を返す）
- [ ] 同期エンドポイントは AbortController で必ずタイムアウトを切る
- [ ] `seed` をリクエストに含め、結果と一緒に保存する（再現性）
- [ ] 生成物に SynthID と C2PA が入ることを UI に明記する
- [ ] 実レート制限値は Google AI Studio の画面で確認してから本番投入する
- [ ] 課金前に Gemini Developer API 側の価格ページで単価を再確認する（本書の価格は Vertex 価格表由来）
