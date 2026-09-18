# 手入れ — Teire

名前を知り、季節を待ち、手を入れる。成果のいらない庭仕事の記録帳。

通知ゼロ・スコアゼロ・streakゼロ。開いた時だけ季節(七十二候)が応えるモードレス設計。

## 3つの機能

| 画面 | 内容 |
|---|---|
| 名前判定 | 写真から植物を同定。二段推論(形態観察→図鑑照合)で誤同定を抑え、剪定・手入れ・病害虫まで一度に引く |
| 手入れ暦 | 12種の樹木の月別作業。剪定適期は熾色の点で灯る |
| 庭づくり | 45種を自由に配植するアイソメトリック・シミュレーション。自動保存 |

## すぐ動かす

```bash
npm install
npm run dev        # http://localhost:5173
```

AI機能(名前判定・添え書き)を使う場合のみ、APIキーの設定が必要です。

```bash
cp .env.example .env.local
# .env.local を開き ANTHROPIC_API_KEY に自分のキーを設定
```

キーがなくても**庭づくりと手入れ暦は完全に動きます**(AI機能だけがエラーメッセージを返す)。

## APIキーの扱い ⚠️

**キーをフロントエンドのコードに書かないこと。** ビルド後のJSは誰でも読めるため、
公開した瞬間に盗まれて他人があなたの請求で使い始めます。

このプロジェクトは最初からその事故が起きない構造にしてあります。

- **開発時** — `vite.config.js` のプロキシが `/api/claude` を中継し、キーをサーバー側で付与する。
  キーはブラウザに渡らない
- **本番** — `worker/` の Cloudflare Worker を経由する。キーは Worker のsecretに保存

`VITE_` 接頭辞のついた環境変数はブラウザに露出します。**キーには絶対に使わないでください**
(だから `ANTHROPIC_API_KEY` には接頭辞が付いていません)。

## ディレクトリ構成

```
src/
├── App.jsx              タブ切り替えと共通ヘッダー
├── main.jsx             エントリポイント
├── theme.js             デザイントークン(色・書体・盤面座標)
├── data/
│   ├── sekki72.js       七十二候 72件 + 今日の候を返す関数
│   ├── species.js       庭づくりの植物 45種
│   └── plants.js        手入れ暦の樹種 12種
├── lib/
│   ├── api.js           Claude API通信・二段推論の同定ロジック
│   ├── image.js         写真のJPEG正規化(HEIC対策)
│   ├── sprite.js        植物スプライトのSVG生成
│   └── random.js        決定的擬似乱数
├── components/Bits.jsx  共通UI部品
└── views/
    ├── Identify.jsx     名前判定
    ├── Calendar.jsx     手入れ暦
    └── Garden.jsx       庭づくり
worker/index.js          本番用のAPI中継(Cloudflare Workers)
```

## デプロイ

### フロントエンド(Netlify / Vercel)

```bash
npm run build   # dist/ に出力
```

`netlify.toml` が同梱済み。GitHubリポジトリを繋げばそのままビルドが通ります。
Vercelの場合もビルドコマンド `npm run build`、出力先 `dist` で動きます。

### AI機能を本番で使う場合(任意)

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # キーはここにだけ入れる
npx wrangler deploy worker/index.js
```

発行されたURLをフロント側の環境変数に設定します。

```
VITE_API_ENDPOINT=https://teire-api.<あなた>.workers.dev
```

`worker/index.js` の `ALLOWED_ORIGINS` を自分の本番ドメインに書き換えてください
(`*` のままにすると誰でもあなたのキーを使えてしまいます)。

## 設計メモ(引き継ぎ用)

**なぜ庭の描画にAIを使わないか** — 初期版はAIにSVGを生成させていましたが、
出力が途中で切れると壊れるため、作図エンジンを内蔵する方式に反転しました。
結果、生成が20秒→即時になり、オフラインでも動きます。AIは添え書きの一文だけを担当します。

**なぜ input の accept に .heic を書かないか** — iOSは「HEICを受け取れない」と伝えると
自動でJPEGに変換して渡します。`.heic` を含めると生のHEICが来てデコードに失敗します。
これが写真アップロードが動かない典型原因でした。

**植物の追加方法** — `src/data/species.js` に1行足すだけです。
`arch` に既存の描画型(kabudachi / layered / dome / round / shrub / flower / bamboo / tuft / fern / moss)を
指定し、葉色と実の色を決めれば、スプライトは自動生成されます。

## 空色 Studio（/studio/）— 仮説から画像、画像から Figma へ

同じリポジトリの第 2 のエントリ。曖昧な依頼を **仮説→課題→1行ブリーフ → 参照 → アートディレクション変数 → 叙述プロンプト → 画像生成 → 批評・修正 → Figma コンポーネント** に変換するデザイン・コンサルティング用ワークベンチです。設計の全文は `docs/studio/DESIGN.md`（達成条件・課題ツリー・仮説と解決策・フレーム・データ契約）。

```bash
npm run dev            # http://localhost:5173/studio/  （庭アプリは / のまま）
npm test               # サーバ API・プロンプトコンパイラ・Figma プラグインのテスト
```

| ステージ | できること | 使う API キー |
|---|---|---|
| 0 案件 | 名前・ブランド・成果物（KV / ポスター / OOH / SNS / Web / 誌面 / パッケージ / アプリ） | なし |
| 1 課題 | Issue Tree・仮説 3 案・How Might We・Get–To–By の 1 行ブリーフ・Art Thinking の問い。20 のフレーム（Double Diamond / SCAMPER / Six Hats …）をワークショップ形式で回答 | `ANTHROPIC_API_KEY`（無くても手入力で進める） |
| 2 参照 | カンヌ歴代受賞作 67 件（原理・プロンプト種付き）／Pinterest（自分のピン検索・URL 取り込み・ボード埋め込み）／Adobe Stock 検索／自前画像。参照ごとに役割（構図・配色・光・質感・書体・空気・主題）と重み、「画像を渡す／原理だけ渡す」を選ぶ | `PINTEREST_ACCESS_TOKEN` / `BRAVE_SEARCH_API_KEY` / `ADOBE_STOCK_API_KEY`（任意） |
| 3 方向 | 6 軸スライダー・媒体・技法・構図・光・カメラ・質感・配色（60-30-10）・文字方針・ムード語・必須/禁止・アスペクト比・モデル。SCAMPER ボタンで変種を作る | なし |
| 4 プロンプト | 変数から決定的に編んだ叙述プロンプト（EN）+ 日本語解説。Claude で磨く、テンプレートから作る、版管理、権利ガード | `ANTHROPIC_API_KEY`（任意） |
| 5 生成 | Gemini 画像生成（既定 `gemini-2.5-flash-image`、上位モデル切替可）。参照画像を役割付きで渡す。6 基準の批評 → 修正指示で image-to-image 編集 | `GEMINI_API_KEY` |
| 6 Figma | 生成画像から配色抽出 → トークン → `spec.json`（フレーム・コンポーネント・バリアント）→ アプリ内プレビュー → 書き出し | `ANTHROPIC_API_KEY`（微調整のみ任意） |

### Figma へ再現する 2 つの経路

1. **同梱プラグイン** `figma-plugin/` — Figma デスクトップ → Plugins → Development → Import plugin from manifest… → `spec.json` を貼るか選ぶ → Variables / Styles / KV フレーム / Components（Variants）を自動生成。
2. **Claude Code + Figma MCP** — `docs/studio/figma-flow.md` の手順で同じ `spec.json` を `use_figma` に渡す。

### キーと権利の注意

- キーはすべてサーバ側（`.env.local` / Vercel の Environment Variables）。`VITE_` は付けない。
- 画像生成モデル `gemini-2.5-flash-image`（Nano Banana）は Google が 2027-03-15 に廃止予定。後継 `gemini-3.1-flash-image` は UI とモデル選択で切り替えられます（`docs/studio/research-image-generation.md`）。
- Pinterest 公式 API の検索は「トークン所有者自身のピン」のみ。全体検索は Brave Search API（`site:pinterest.com`）→ ピン URL 貼り付け（oEmbed）→ ボード埋め込みの順にフォールバックします。
- Adobe Stock 素材は開発者規約により AI 利用不可のため、アプリでは表示・参考のみ（画像をモデルに渡さない・AI 原理抽出もしない）。
- 参照は「原理」に変換して使い、特定作品・ロゴ・商標の再現は指示しません（プロンプトガードが警告します）。

### 構成

```
studio/            /studio/ のフロント（React）— screens/ components/ lib/ data/
api/studio/        Vercel Functions（ai / generate / search / image / status）
server/lib/        共有ロジック（Claude・Gemini・検索・SSRF セーフな取得・開発用シム）
figma-plugin/      spec.json → Figma を組み立てるプラグイン
docs/studio/       設計書・リサーチ・Figma フロー
tests/             node --test（依存パッケージ不要）
```

## 今後の拡張候補

- 判定精度の向上 — PlantNet-300K(Kaggle)で専用CNNを学習し、上位候補をClaudeに事前情報として渡すハイブリッド構成
- 病害診断 — PlantVillageデータセットで葉の病斑分類を追加
- 「うちの庭」— 判定した樹を登録し、手入れ暦をその庭専用にする
