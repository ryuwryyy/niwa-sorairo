# 手入れ — Teire

名前を知り、季節を待ち、手を入れる。成果のいらない庭仕事の記録帳。

本番: https://teire-app.vercel.app (`main` へのマージで Vercel が自動デプロイ)
デザインリサーチ道具「聴く」: https://ryuwryyy.github.io/niwa-sorairo/ (GitHub Pages。庭アプリとは別の場所)

通知ゼロ・スコアゼロ・streakゼロ。開いた時だけ季節(七十二候)が応えるモードレス設計。

## 3つの機能

| 画面 | 内容 |
|---|---|
| 今月の手入れ | 57種(もみじ・桜・柑橘・果樹・グラスなど)の月別作業。剪定/作業/収穫/肥料/虫/水/見頃に分けて「今月の大事な作業」から並べる。★わが家の木・手入れ済みの印・用語ミニ辞典つき |
| 名前判定 | 写真から植物を同定。二段推論(形態観察→図鑑照合)で誤同定を抑え、剪定・手入れ・病害虫まで一度に引く。対象の植栽なら今月の手入れへ直接飛べる |
| 庭づくり | 162種を自由に配植するアイソメトリック・シミュレーション。先頭の「植栽リスト」は今月の手入れと同じ植物。自動保存 |

初めて開いた人には「はじめての方へ」の案内が出る(ヘッダーの「使い方」で再表示)。

## すぐ動かす

```bash
npm install
npm run dev            # 庭アプリ http://localhost:5173
npm run dev:research   # 聴く http://localhost:5174
```

AI機能(名前判定・添え書き)を使う場合のみ、APIキーの設定が必要です。

```bash
cp .env.example .env.local
# .env.local を開き ANTHROPIC_API_KEY に自分のキーを設定
```

キーがなくても**庭づくりと今月の手入れは完全に動きます**(AI機能だけがエラーメッセージを返す)。

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
│   ├── species.js       庭づくりの植物 162種
│   └── plants.js        今月の手入れの植栽 57種 + 月別作業の生成 + 用語ミニ辞典
├── lib/
│   ├── api.js           Claude API通信・二段推論の同定ロジック
│   ├── image.js         写真のJPEG正規化(HEIC対策)
│   ├── sprite.js        植物スプライトのSVG生成
│   └── random.js        決定的擬似乱数
├── components/Bits.jsx  共通UI部品
└── views/
    ├── Identify.jsx     名前判定
    ├── Monthly.jsx      今月の手入れ
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

**手入れ対象の追加方法** — `src/data/plants.js` の `PLANTS` に1件足します。
`prune`(剪定月)・`fert`(肥料月)・`harvest`(収穫月)・`pests`(見回り月)・`see`(見頃)・`extra`(その木だけの作業)を
書けば、月ごとの作業一覧は `tasksFor()` が自動で組み立てます。`sp` に species.js の名前を入れると庭づくりにも並びます。

**植物の追加方法(庭づくり)** — `src/data/species.js` に1行足すだけです。
`arch` に既存の描画型(kabudachi / layered / dome / round / shrub / flower / bamboo / tuft / fern / moss)を
指定し、葉色と実の色を決めれば、スプライトは自動生成されます。

## CI/CD(すべて無料)

| いつ | 何が | どこで |
|---|---|---|
| PR・`main` への push | 単体テスト、両ビルド、FigJamプラグイン構文(`npm run check`)と、偽 Jev・偽 Claude でのブラウザ通しテスト(`npm run e2e`) | `.github/workflows/ci.yml` |
| claude/* の PR で CI が成功 | 自動でマージし、聴くを再デプロイ(「hold」ラベルで止められる) | `.github/workflows/automerge.yml` |
| `main` へのマージ | 庭アプリと API を本番へ | Vercel(Git連携) |
| `main` へのマージ(`research/` などが変わったとき) | 聴くを GitHub Pages へ | `.github/workflows/pages.yml` |
| 手動(キーを入れ替えたとき) | Brave・Jev・Claude に本物の最小リクエストを1回ずつ送り、キーが使えるか確認(少額かかる) | `.github/workflows/live-check.yml` |
| Vercel のデプロイ完了 | トップ・API(入力検証で弾かれる空リクエストのみ)・CORS を確認 | `.github/workflows/smoke.yml` |

テストと CI は本物の Jev・Claude を呼ばないので、API の課金は発生しない。
初回だけ GitHub の Settings → Pages → Source を「GitHub Actions」にする。
手順の詳細は `.claude/skills/ship-research/`、マージ前の点検は `.claude/agents/release-checker.md`。

## 聴く — Jevリサーチ(GitHub Pages)

庭アプリとは別ページのデザインリサーチ道具。TypeSafe AI の **Jev**(文章を生成せず、決めた選択肢から判断と確率だけを返す System One モデル)で、
大量の声を一瞬で仕分けます。

| 画面 | 入力 | Jevへの問い(1件ごと) | 出力 |
|---|---|---|---|
| ソーシャルリスニング | X / Instagram / レビューの投稿を貼り付け、またはCSV(公式・広告・宣伝はルールで除外) | 体験に関係あるか・感情・話題(編集可)・意図・深刻度 | 話題×感情の棒、まず読むべき投稿、確信度の低い「要確認」、手修正、CSV、FigJam(話題ごとの付箋、元リンク付き)、戦略シート |
| インタビュー整理 | 文字起こし・議事録(話者形式を自動判別し、聞き手を除外) | アフィニティ分類(編集可)・ジャーニー段階・具体的な行動か・重要度 | アフィニティ図、行動フロー、FigJam / Miro / Mermaid / CSV 書き出し |

| 深掘りレポート | **Braveで集める**(Brave Search API で X・Instagram の公開投稿と、その投稿者への返信を検索)、またはCSV(本文+元URL)・貼り付け | Jev: 使えるか・具体性・感情語(好き/いい/最高/感動/やばい/悪い/嫌い/最悪/くそ)・強さ(少し〜めっちゃ)。上位N件にClaudeがカテゴリーを作り、Jevがタグ付け | 感情語グループの要約・感情の動き・インサイト、4象限マップ(嫌悪↔好意 × 少し↔めっちゃ)、一段深いUI/UX洞察、アートディレクションのデコンテ。FigJam / Markdown / CSV |

- **公式・広告・宣伝の除外** — 検索の除外語(Brave)→ 無料のルール(#PR・キャンペーン・告知・求人・販促・アフィリエイト・公式らしい名前・定型文・投稿者の出しすぎ・除外リスト)→ Jev の「発信元」判定、の3段。外した投稿は理由つきで画面に並ぶ(`research/src/lib/filters.js`)
- **声の質チェック(関門)** — ふるい分けのあと、件数・使える割合・宣伝の多さ・具体性・偏りから質を「良い/注意/低い」で判定して止まる。「インサイトを抽出する」「リサーチのワードを変える」「リサーチの方向を提案してもらう」(Claude が診断と検索ワード案を出す)のどれかを押さないと先へ進まない
- **費用を抑える** — 「ふるい分けて質を見る」はふるい分けと質チェックまで。カテゴリーは「インサイトを抽出する」を押したとき。グループの要約・洞察とデコンテ・戦略シートは、ボタンを押したときだけ Claude を1回呼ぶ
- **戦略シート** — ペルソナ・感情マップ(推測)・仮説・インサイト・コアアイデア・課題・解決策/サービス提案・トンマナ・クリエイティブブリーフを Claude 1回でつくる(ソーシャルリスニングと深掘りレポートの両方。Markdown・FigJam に書き出せる)
- **FigJam** — `figma-plugin/` の開発用プラグインに「FigJamへ(コピー)」の内容を貼ると、セクション+付箋のアフィニティ図と、矢印つきの行動フローを配置(手順は `figma-plugin/README.md`)
- **Miro** — 「Miroへ(コピー)」は分類ごとの列に並べたタブ区切りテキスト。ボードに貼ると付箋になる。フローは Mermaid で
- **キー** — `.env.local` / Vercel の環境変数に `TYPESAFE_API_KEY`(Jev)。Brave での収集は `BRAVE_API_KEY`(`api/brave.js` → `api/_brave-core.js`。新規は毎月5ドル分の無料クレジット、画面に Powered by Brave を表示)。深掘りレポートの文章部分は `ANTHROPIC_API_KEY`(Claude、`api/analyze.js` → `api/_analyze-core.js`、構造化出力でJSONを受ける)。未設定でも「デモ判定」(キーワード照合。Jevではない)で画面は試せる
- **構成** — `api/jev.js`(Vercel関数)→ `api/_jev-core.js`(検証・上限・並列実行・公式SDK `@typesafe-ai/sdk`)。開発時は `vite.config.js` が同じ処理を `/api/jev` で受ける

**なぜ Jev か** — 分類は「文章を書く」必要がなく、選択肢と確率が返れば十分。JSONを生成させる方式より速く、出力が壊れない。
確率が返るので、確信度の低いものだけを人が見直す運用にできる。
**限界** — Jev は要約を書かないので、フローの各ステップは発言の原文(短縮)。要約ラベルが要るなら、既存の `/api/claude` で後段に一言書かせる構成が次の一手。
X / Instagram を直接スクレイピングはしない(各社の規約で禁止)。Brave が索引した公開ページを検索するので、本文は検索結果の抜粋で、返信もスレッドのすべてではない。

## 空色 Studio（/studio/）— 仮説から画像、画像から Figma へ

本番: https://teire-app.vercel.app/studio/ (庭アプリと同じ Vercel。`main` へのマージで一緒にデプロイ)

同じリポジトリの第 2 のエントリ。曖昧な依頼を **仮説→課題→1行ブリーフ → 企画（インサイト→コアアイデア）→ 参照 → アートディレクション変数 → 叙述プロンプト → 画像生成 → 批評・修正 → Figma コンポーネント** に変換するデザイン・コンサルティング用ワークベンチです。設計の全文は `docs/studio/DESIGN.md`（達成条件・課題ツリー・仮説と解決策・フレーム・データ契約）。

```bash
npm run dev            # http://localhost:5173/studio/  （庭アプリは / のまま）
npm test               # 庭・聴く・Studio の単体テスト（Studio はサーバ API・プロンプトコンパイラ・Figma プラグイン）
```

| ステージ | できること | 使う API キー |
|---|---|---|
| 0 案件 | 名前・ブランド・成果物（KV / ポスター / OOH / SNS / Web / 誌面 / パッケージ / アプリ） | なし |
| 1 課題 | Issue Tree・仮説 3 案・How Might We・Get–To–By の 1 行ブリーフ・Art Thinking の問い。20 のフレーム（Double Diamond / SCAMPER / Six Hats …）をワークショップ形式で回答 | `ANTHROPIC_API_KEY`（無くても手入力で進める） |
| 2 企画 | 受賞作の分解（デコンテ）を先生に選び、発想の型 20 種から組み立てる。インサイト 5 本 → 緊張 → コアアイデア 6 案（10 問の検査・カンヌの 3 基準で採点・反転/極端化/媒体/主語の変種）→ KV コンセプトとタグライン。仕様は `docs/studio/idea-stage.md` | `ANTHROPIC_API_KEY`（無くても「型から」決定的に出せる） |
| 3 参照 | カンヌ歴代受賞作 67 件（原理・プロンプト種付き）／Pinterest（自分のピン検索・URL 取り込み・ボード埋め込み）／Adobe Stock 検索／自前画像。参照ごとに役割（構図・配色・光・質感・書体・空気・主題）と重み、「画像を渡す／原理だけ渡す」を選ぶ | `PINTEREST_ACCESS_TOKEN` / `BRAVE_API_KEY`（聴くと共用）/ `ADOBE_STOCK_API_KEY`（任意） |
| 4 方向 | 6 軸スライダー・媒体・技法・構図・光・カメラ・質感・配色（60-30-10）・文字方針・ムード語・必須/禁止・アスペクト比・モデル。SCAMPER ボタンで変種を作る | なし |
| 5 プロンプト | 変数から決定的に編んだ叙述プロンプト（EN）+ 日本語解説。Claude で磨く、テンプレートから作る、版管理、権利ガード | `ANTHROPIC_API_KEY`（任意） |
| 6 生成 | Gemini 画像生成（既定 `gemini-2.5-flash-image`、上位モデル切替可）。参照画像を役割付きで渡す。6 基準の批評 → 修正指示で image-to-image 編集 | `GEMINI_API_KEY` |
| 7 Figma | 生成画像から配色抽出 → トークン → `spec.json`（フレーム・コンポーネント・バリアント）→ アプリ内プレビュー → 書き出し | `ANTHROPIC_API_KEY`（微調整のみ任意） |

### Figma へ再現する 2 つの経路

1. **同梱プラグイン** `studio-figma-plugin/`（聴くの FigJam プラグイン `figma-plugin/` とは別物）— Figma デスクトップ → Plugins → Development → Import plugin from manifest… → `spec.json` を貼るか選ぶ → Variables / Styles / KV フレーム / Components（Variants）を自動生成。
2. **Claude Code + Figma MCP** — `docs/studio/figma-flow.md` の手順で同じ `spec.json` を `use_figma` に渡す（`node studio-figma-plugin/mcp/spec-to-use-figma.mjs` がスクリプトを書き出す）。

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
studio-figma-plugin/  spec.json → Figma を組み立てるプラグインと use_figma スクリプト生成器
docs/studio/       設計書・リサーチ・Figma フロー
tests/api・tests/studio・tests/figma  node --test（*.test.mjs、依存パッケージ不要）
```

## 今後の拡張候補

- 判定精度の向上 — PlantNet-300K(Kaggle)で専用CNNを学習し、上位候補をClaudeに事前情報として渡すハイブリッド構成
- 病害診断 — PlantVillageデータセットで葉の病斑分類を追加
- 「うちの庭」の強化 — 判定した樹を★わが家の木へ自動登録する
