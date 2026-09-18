# Sorairo Studio — 設計書（仮説課題解決 → 画像生成 → Figma 再現）

> 役割分担: 設計 = Fable 5.1 / リサーチ・実装 = Opus 5。
> 本書は「ゴールを達成するための条件」を列挙し、仮説→課題→解決策の順に精査した上で、
> Web アプリと Figma 再現フローを規定する。実装エージェントはこの文書を契約として扱う。

---

## 0. ゴール（1行）

**曖昧な依頼を、クオリティの高いキービジュアル（画像）と、Figma で精緻に再現されたコンポーネント群に、再現可能な手順で変換する。**

ゴールの分解:

| # | サブゴール | 完了の定義 |
|---|---|---|
| G1 | 課題を仮説ベースで定義し、1行ブリーフに落とす | 問題・インサイト・対象・約束・トーンが 1 画面で読める |
| G2 | 参考（カンヌ歴代企画・Pinterest・Adobe Stock・自前画像）を集め、**原理**として抽出する | ムードボードの各参照に役割(構図/色/光/質感/書体/空気)と原理テキストが付く |
| G3 | 具体的で明示的なプロンプトを生成する | 変数がすべてプロンプト内で可視化され、EN 本文と JA 解説が並ぶ |
| G4 | Gemini 2.5 Flash Image（「Image 2.5」= Nano Banana）で高品質画像を生成する | 複数案 → 批評 → 修正 → 確定 のループが回る |
| G5 | 生成画像から Figma コンポーネントを精緻に再現する | 色/書体/余白トークン + 画像フレーム + コンポーネント(バリアント付き)が Figma 上に自動生成される |
| G6 | 全変数を変更・差し替え可能な Web アプリにする | 自前画像投入、Pinterest 検索(サイト内)、変数の即時反映、プロジェクト保存/書き出し |

---

## 1. ゴール達成のための条件（達成条件リスト）

「何が揃えば達成と言えるか」を先に固定する。各条件には検証方法を付ける。

### A. 課題設定の条件
- A1 依頼文が「誰の・何の・なぜ」の 3 点に分解されている（Issue Tree / MECE）。
- A2 仮説が 3 つ以上並び、**1 つが選ばれ**、選定理由が書かれている（仮説思考）。
- A3 「How Might We」が 1 文で書かれ、成功基準が測定可能である（Get–To–By）。
- A4 上記が AI 生成でも手入力でも同じデータ構造に入る（AI が無くても進める）。

### B. 参照の条件
- B1 参照は **原理（principle）に変換して**プロンプトに渡す。画像そのものをモデルに渡すかは参照ごとに明示的に選ぶ（既定: 自前画像=渡す / Pinterest・CSE=渡さない / Adobe=渡さない）。
- B2 各参照に役割（composition / palette / lighting / texture / typography / mood / subject）と重み(1–3)を付ける。
- B3 カンヌ歴代企画は **メタデータ＋原理**のみを同梱し、画像は再ホストしない（検索クエリで都度探す）。
- B4 Pinterest 検索はサイト内で完結する。優先順: 公式 API v5（**トークン所有者自身のピン**を検索。Pinterest 全体の公開検索は一般アプリに提供されていない） → Brave Search API の画像検索を `site:pinterest.com` で絞る → Google Programmable Search（レガシー: 2027-01-01 終了予定・新規不可） → ピン URL 貼り付け（Pinterest oEmbed → og:image） → ボード埋め込みウィジェット（pinit.js）。
- B5 Adobe Stock は公式 Search API（キーのみで検索可）でサムネイルを取得し、作者名 / Adobe Stock の帰属表示を添える。**Adobe の開発者規約は Stock 素材とメタデータの AI/ML 利用を禁じる**ため、Adobe 由来の参照は表示・参考のみ（画像をモデルへ渡さない・AI 原理抽出もしない）。
- B6 いかなる参照も「特定キャンペーン・ロゴ・商標の再現」をプロンプトに書かせない（ガード関数で検査）。

### C. プロンプトの条件
- C1 プロンプトは **叙述文**で書く（キーワード羅列より Nano Banana の推奨に合致）。
- C2 構造: 成果物/意図 → 主題/シーン → 構図 → 光/カメラ → 媒体/技法/質感 → 配色 → 文字の扱い → ムード語 → 参照の使い方 → 制約。各ブロックが UI 上で変数に紐づく。
- C3 EN 本文（モデルに渡す）と JA 解説（人が読む）を必ず対にする。
- C4 バージョン管理: 生成のたびにプロンプト版 ID を残し、いつでも復元できる。
- C5 AI 無しでも決定的コンパイラでプロンプトが出る（`lib/prompt.js`）。AI（Claude Opus 5）は「磨き」担当。

### D. 生成の条件
- D1 モデルは環境変数で切替（既定 `gemini-2.5-flash-image` = 依頼どおりの「Image 2.5」。ただし Google は同モデルを 2027-03-15 廃止予定としており、後継 `gemini-3.1-flash-image`（Nano Banana 2）を UI で推奨表示する。詳細は `research-image-generation.md`）。
- D2 参照画像は最大 3 枚（2.5 Flash Image / 3.1 Flash Lite）を役割付きで渡す。3.1 Flash Image / 3 Pro Image は最大 14 枚。上限は `promptGuide.json` の `maxRefImages` を唯一の定義源にする。
- D3 アスペクト比は成果物から自動提案し、変更可能。
- D4 生成 → 批評（Claude 視覚評価: コンセプト/構図/階層/色/仕上げ/ブランド適合 各 5 点）→ 修正指示 → 再生成 のループを UI で回す。
- D5 文字（見出し・コピー）は画像内に描かせず **Figma で載せる**のを既定にする（文字描画の不安定さを回避）。画像内に文字が要る場合だけ「文字ゾーン」として指示。
- D6 画像は IndexedDB に保存（localStorage には入れない）。

### E. Figma 再現の条件
- E1 生成画像から **色トークン**（k-means 抽出 → 役割割当）、**書体スケール**、**余白/角丸**を決める。
- E2 コンポーネント仕様（`spec.json`）は決定論的テンプレート（KV フレーム / Hero / Card / Button / Tag / Header / Section）から生成し、AI が微調整する。
- E3 Figma への投入は 2 経路: (a) 同梱 Figma プラグイン（`figma-plugin/`）で `spec.json` を読み込み Variables / Styles / Components(Variants) / 画像フレームを生成、(b) Claude Code の Figma MCP（`use_figma`）で同じ spec を流す。
- E4 生成したコンポーネントはアプリ内でも HTML プレビューされ、Figma と見比べられる。

### F. アプリの条件
- F1 API キーはサーバ側のみ（Vercel Functions / Vite dev ミドルウェア）。フロントに `VITE_` で出さない。
- F2 画像プロキシは SSRF 対策（http(s) のみ・プライベート IP 拒否・image/* のみ・サイズ上限・タイムアウト）。
- F3 プロジェクトはローカル保存（localStorage + IndexedDB）、JSON で書き出し/読み込み。
- F4 すべての段階が独立に編集可能。順序は推奨であって強制しない。
- F5 スマホ幅でも壊れない（16px ガター、横スクロール無し）。

---

## 2. 仮説 → 課題 → 解決策（コンサルとしての精査）

### 2.1 中心仮説
**H0: 画像生成の品質は「モデル性能」より「ブリーフ→参照→変数→プロンプトの変換精度」で決まる。**
根拠: 同じモデルでもプロンプトの叙述性・構図/光/技法の明示・参照の役割指定で結果が大きく変わる（Google の公式ガイドが叙述指示を推奨）。よってアプリの中核は「変換パイプライン」であり、生成 API はその末端に置く。

### 2.2 課題ツリー（MECE）

```
なぜ高品質な KV が安定して出ないのか
├─ 1. 課題が曖昧（誰に何を約束するかが決まっていない）
│    ├─ 1a 依頼文がそのままプロンプトになっている
│    └─ 1b 成功基準が無く、良し悪しを判断できない
├─ 2. 参照の使い方が雑
│    ├─ 2a 参照が「好き」で集められ、役割が無い
│    ├─ 2b 参照画像をそのまま渡し、模倣・権利リスクが出る
│    └─ 2c 歴代の名作（カンヌ）の"原理"が言語化されていない
├─ 3. プロンプトの構造が無い
│    ├─ 3a キーワード羅列で、構図・光・技法が欠ける
│    ├─ 3b 変更したい変数が文中に埋もれ、比較できない
│    └─ 3c 文字を画像に描かせて破綻する
├─ 4. 評価と修正のループが無い
│    └─ 4a 1 回出して終わり。批評基準が無い
└─ 5. Figma に持ち込むと再現できない
     ├─ 5a 画像を貼るだけで、トークン化されていない
     └─ 5b コンポーネント化（Auto Layout / Variants）が手作業
```

### 2.3 仮説と解決策（各課題に 1 対 1）

| 課題 | 仮説 | 解決策（アプリ機能） | 検証 |
|---|---|---|---|
| 1a/1b | 1 行ブリーフと成功基準があれば、生成のブレが減る | 「課題設定」ステージ: Issue Tree → 仮説 3 案 → HMW → Get–To–By ブリーフ → 成功基準。AI 生成＋手編集 | 同じ変数でブリーフ有無を A/B し批評スコアを比較 |
| 2a | 参照に役割と重みを付けると、プロンプトの指示が具体化する | ムードボード: 役割/重み/原理テキスト。原理は Claude 視覚で抽出 | 参照 0 枚 vs 役割付き 3 枚で比較 |
| 2b | 画像を渡すか原理だけ渡すかを分ければ、権利と品質を両立できる | `passPixels` トグル（既定は出所で自動） | 生成物と参照の類似度を目視確認 |
| 2c | 名作の"原理"辞書があると、発想の起点が上がる | カンヌ歴代 50+ 件のメタデータ＋原理＋プロンプト種（`cannes.json`） | 種を入れた/入れないで批評「コンセプト」点比較 |
| 3a/3b | 変数を UI 化し、叙述文に決定論的に編む | 「方向」ステージ: 軸スライダー・技法・構図・光・カメラ・配色・文字方針。`lib/prompt.js` で編集可能プロンプトへ | 変数を 1 つ変えて差分が生成に出るか |
| 3c | 文字は Figma で載せる方が品質が高い | 既定 `typography.intent = "headline_zone"`（余白を空けさせる） | 文字あり生成との比較 |
| 4a | 批評基準を固定すると改善が収束する | 「生成」ステージ: 6 基準×5 点 + 修正案 3 つ → ワンクリック再生成 | 反復 2〜3 回で総合点が上がるか |
| 5a/5b | 画像→トークン→spec→プラグインで自動化できる | 「Figma」ステージ: 色抽出、トークン、spec.json、プラグイン/MCP | プラグインで生成された Variables/Components を確認 |

---

## 3. 使用するフレーム（ワーク）と流れ

| ステージ | フレーム | 入力 | 出力（データ） |
|---|---|---|---|
| 1 課題 | Issue Tree（MECE）/ 仮説思考 / So what? / HMW / Get–To–By / Reverse brief | 依頼文・対象・制約 | `consult.brief` |
| 1 課題 | Art Thinking（Lighthouse question: 到達点 B が未知の問い）| ブリーフ | `consult.brief.lighthouse` |
| 2 参照 | Mood board → tone words → visual system / Cannes lens（Idea / Execution / Impact）| 検索・投入 | `refs.board[]` + 原理 |
| 3 方向 | Tone-of-voice sliders / 60-30-10 / Gestalt / 構図文法 / Big Idea→Visual Metaphor→Craft / SCAMPER（バリエーション）| 変数 | `direction` |
| 4 プロンプト | Nano Banana 叙述ガイド / Prompt anatomy | 1〜3 | `prompt.versions[]` |
| 5 生成 | Six Thinking Hats（批評）/ Crazy 8s（複数案）| プロンプト+参照 | `gens[]` + `critique` |
| 6 Figma | Design tokens / Atomic components | 画像 | `handoff.spec` |

フレームの本体テキストは `studio/src/data/frameworks.json`（Opus 5 がリサーチ）に置き、UI は同 JSON を汎用レンダリングする。

---

## 4. パイプラインとデータモデル（契約）

### 4.1 ステージ

```
0 Project → 1 課題(Consult) → 2 参照(Refs) → 3 方向(Direction) → 4 プロンプト(Prompt) → 5 生成(Generate) → 6 Figma(Handoff)
```

右側の「コンテキストパネル」に、常に ブリーフ要約 / ボード縮小版 / 現在のプロンプト冒頭 / 最新生成 を表示し、どのステージからでも上流を編集できる。

### 4.2 Project JSON（localStorage、画像は IndexedDB）

`studio/src/store.jsx` の `emptyProject()` が唯一の定義源。要点:

- `meta` — 名前・クライアント・ブランド・成果物種別（`kv|poster|ooh|social|web_hero|editorial|packaging|app`）
- `consult` — `context / audience / constraints / frames{} / issueTree[] / hypotheses[] / hmw[] / brief{problem, insight, audience, promise, tone[], oneLiner, lighthouse, successCriteria[]}`
- `refs.board[]` — `{ id, source, title, thumbUrl, imageUrl, pageUrl, blobKey, width, height, author, license, role, weight, passPixels, notes, principles[] }`
- `direction` — `axes{}` / `medium` / `technique[]` / `composition` / `lighting` / `camera` / `texture[]` / `palette{mode, colors[], harmony}` / `typography{intent, style, copy}` / `subject` / `scene` / `mood[]` / `mustInclude[]` / `mustAvoid[]` / `aspect` / `model` / `variants` / `size`
- `prompt.versions[]` — `{ id, at, source: "compiled|ai|manual", en, ja, blocks{}, refIds[] }`, `prompt.activeId`
- `gens[]` — `{ id, at, promptVersionId, model, aspect, blobKey, parentId, editInstruction, critique{scores{}, total, notes[], revisions[]}, starred }`
- `handoff` — `{ selectedGenId, palette[], tokens{}, spec{}, exportedAt }`

### 4.3 アートディレクション語彙

`studio/src/data/directionVars.json`（Fable 執筆）。各項目は `{ id, ja, en, hint }` で、`en` がそのままプロンプト断片になる。軸（スライダー）は両端に断片を持ち、値に応じて強度語を選ぶ。

### 4.4 プロンプト構造（`lib/prompt.js`）

```
[1 Deliverable & intent]  A {medium} {deliverable} for {brand}: {oneLiner}.
[2 Subject & scene]       {subject} … {scene}
[3 Composition]           {composition.en}; {axes → "generous negative space" 等}
[4 Light & camera]        {lighting.en}, {camera.en}
[5 Medium & craft]        {technique.en…}, {texture.en…}
[6 Palette]               {palette colors as names+hex}, {harmony}
[7 Typography]            intent=headline_zone → "leave a clean, uncluttered area in the {zone} for a headline to be added later; do not render text"
[8 Mood]                  {tone words}
[9 References]            "Reference image 1 guides composition only; 2 guides the palette …" / 原理テキスト
[10 Constraints]          must include / must avoid / "no logos, no trademarks, no watermarks, no captions"
```

ガード: `guardPrompt()` がブランド名・商標・「in the style of <実在作品>」等を検出して警告する。

### 4.5 サーバ API（Vercel Functions, `api/studio/*`）

すべて `POST`、JSON。エラーは `{ error: { message } }`。開発時は Vite ミドルウェア（`vite.config.js` → `server/lib/devApi.js`）が同じハンドラを `/api/studio/*` にマウントする。

| エンドポイント | op | 入力 | 出力 |
|---|---|---|---|
| `/api/studio/ai` | `brief` | `{ context, audience, constraints, frames, deliverable }` | `{ issueTree[], hypotheses[], hmw[], brief{} }` |
| `/api/studio/ai` | `principles` | `{ image: {base64|url}, role }` | `{ principles[], toneWords[], palette[] }`（参照 1 枚の原理抽出） |
| `/api/studio/ai` | `prompt` | `{ brief, direction, refs(原理のみ), compiled }` | `{ en, ja, blocks{} }` |
| `/api/studio/ai` | `critique` | `{ image: base64, brief, prompt }` | `{ scores{concept,composition,hierarchy,color,craft,brand}, total, notes[], revisions[{title, editInstruction, promptPatch}] }` |
| `/api/studio/ai` | `figmaSpec` | `{ image: base64, palette[], brief, deliverable }` | `{ spec }`（4.6 の schema） |
| `/api/studio/generate` | — | `{ prompt, refs:[{base64, mime, role}], aspect, model?, n?, size? }` | `{ images:[{base64, mime}], model, blocked?, reason? }` |
| `/api/studio/search` | `pinterest|adobe|cse|unfurl|cannesImages` | `{ q, page, site? }` / `{ url }` | `{ items:[normalized], next?, source, degraded? }` |
| `/api/studio/image` (GET) | — | `?url=` | 画像バイト（SSRF ガード付きプロキシ） |
| `/api/studio/status` (GET) | — | — | `{ claude, gemini, pinterest, brave, adobe, cse: bool, geminiModel, claudeModel }`（キーの有無のみ） |

正規化した検索結果: `{ id, source, title, thumbUrl, imageUrl, pageUrl, width, height, author, license }`。

Claude 呼び出しは `claude-opus-5`、`thinking: {type:"adaptive"}`、`output_config.effort` は用途別（brief/critique = high, prompt = medium）。JSON 出力は `output_config.format`（構造化出力）を使い、失敗時は本文から JSON を抽出するフォールバック。

### 4.6 Figma spec（`handoff.spec`）— プラグインとの契約

```jsonc
{
  "version": 1,
  "name": "案件名",
  "tokens": {
    "color": { "primary": "#1F3A5F", "secondary": "#C9D6DF", "accent": "#E76F51", "bg": "#F7F5F0", "surface": "#FFFFFF", "ink": "#1B1B1B", "inkSoft": "#5F5F5F", "line": "#D9D4C7", "onPrimary": "#FFFFFF" },
    "type": { "family": "Noto Sans JP", "displayFamily": "Shippori Mincho", "scale": { "display": 56, "h1": 40, "h2": 28, "h3": 20, "body": 16, "caption": 12 }, "lineHeight": 1.5 },
    "space": [4, 8, 12, 16, 24, 32, 48, 64],
    "radius": [0, 4, 8, 16, 999]
  },
  "assets": [ { "id": "kv", "kind": "image", "dataUrl": "data:image/png;base64,…", "width": 1024, "height": 1024 } ],
  "frames": [ { "id": "kv-16x9", "name": "KV / 16:9", "width": 1920, "height": 1080, "children": [ /* node */ ] } ],
  "components": [
    {
      "id": "button", "name": "Button",
      "props": { "Variant": ["Primary", "Secondary", "Ghost"], "Size": ["M", "L"] },
      "variants": [
        { "props": { "Variant": "Primary", "Size": "M" }, "node": { /* node */ } }
      ]
    }
  ]
}
```

node:
```jsonc
{ "type": "frame|text|rect|image|ellipse",
  "name": "…",
  "layout": { "mode": "none|horizontal|vertical", "padding": [12, 20, 12, 20], "gap": 8, "align": "center|start|end|space_between", "counterAlign": "center|start|end" },
  "size": { "w": 320, "h": 48, "wMode": "fixed|hug|fill", "hMode": "fixed|hug|fill" },
  "fill": "#hex" | "$color.primary" | { "asset": "kv", "scale": "fill|fit" },
  "stroke": { "color": "$color.line", "width": 1 }, "radius": 8, "opacity": 1,
  "text": { "value": "見出し", "style": "h1", "color": "$color.ink", "align": "left|center|right", "family": "display|body" },
  "children": [ /* node */ ] }
```

`$color.<key>` はトークン参照。プラグインは Variables（コレクション "Sorairo"）・Paint/Text Styles・Components を生成し、`combineAsVariants` でバリアントにまとめる。

---

## 5. Figma 再現フロー（E1〜E4）

1. 「Figma」ステージで生成画像を選ぶ → k-means で 6 色抽出 → 役割（primary/secondary/accent/bg/ink…）を自動割当（明度・彩度・面積で決める）→ 手で入れ替え可。
2. 書体スケール（Major Third 1.25 を既定）・余白・角丸を成果物種別から提案。
3. テンプレート（KV frame / Hero / Card / Button / Tag / Header）から `spec.json` を決定論的に生成 → 任意で Claude が画像を見て微調整（配置・トーン）。
4. アプリ内で HTML プレビュー（`components/SpecPreview.jsx`）。
5. `spec.json` + PNG を書き出し。
6. Figma: プラグイン（Development → Import plugin from manifest → `figma-plugin/manifest.json`）→ JSON を貼るかファイルを選ぶ → 「生成」。
   または Claude Code + Figma MCP: `docs/studio/figma-flow.md` の手順でそのまま `use_figma` に流す。

---

## 6. 参照ソース戦略と権利

| ソース | 取得 | 画像をモデルへ | AI 原理抽出 | 表示 |
|---|---|---|---|---|
| 自前画像 | アップロード（IndexedDB） | 既定 ON | 可 | サムネ |
| Adobe Stock | Search API（キーのみ） | **不可**（規約 §9: AI/ML 利用禁止） | **不可** | サムネ + 「作者名 / Adobe Stock」+ Powered by Adobe Stock |
| Pinterest（自分のピン） | API v5 `/search/pins`（自アカウント） | 既定 OFF（ユーザーが明示的に取り込んだ時のみ） | 可（明示取り込み後） | サムネはプロキシで都度取得。保存するのは id・URL・題名のみ |
| Pinterest（全体） | Brave `site:pinterest.com` → CSE → oEmbed/URL 貼り付け → 埋め込み | 既定 OFF | 可（明示取り込み後） | サムネ + 出典リンク |
| カンヌ歴代 | 同梱メタデータ + 画像は Brave/CSE 検索 | OFF（原理・種のみ） | — | メタデータカード |

原則: **参照は原理に変換する。特定作品・ロゴ・商標の再現を指示しない。** ガードは C6/B6。
権利の根拠と未確認事項は `research-reference-sources.md` §C・§D・Appendix X を参照。

---

## 7. アーキテクチャ

```
/studio/index.html            ← Vite MPA の 2 つ目のエントリ（既存 teire は / のまま）
studio/src/
  main.jsx  App.jsx  store.jsx  styles.css
  data/   directionVars.json  promptGuide.json  cannes.json  frameworks.json
  lib/    api.js  prompt.js  idb.js  palette.js  figmaSpec.js  guard.js
  components/  (共通 UI)
  screens/     Project.jsx Consult.jsx Refs.jsx Direction.jsx Prompt.jsx Generate.jsx Handoff.jsx
api/studio/   ai.js generate.js search.js image.js status.js   ← Vercel Functions
server/lib/   claude.js gemini.js sources.js safeFetch.js devApi.js  ← 共有ロジック（api/ 外に置き関数化を避ける）
figma-plugin/ manifest.json code.js ui.html
docs/studio/  DESIGN.md research-*.md figma-flow.md
```

環境変数（サーバ側のみ）: `ANTHROPIC_API_KEY`, `STUDIO_CLAUDE_MODEL`, `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `PINTEREST_ACCESS_TOKEN`, `BRAVE_SEARCH_API_KEY`, `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX`, `ADOBE_STOCK_API_KEY`, `ADOBE_STOCK_PRODUCT`。

---

## 7b. リサーチで修正された前提（2026-09-18）

| 当初の前提 | 判明した事実 | 設計への反映 |
|---|---|---|
| 「Image 2.5」= `gemini-2.5-flash-image` を既定に | 同モデルは廃止予定（2027-03-15）。後継は `gemini-3.1-flash-image`（参照 14 枚・2K/4K 対応） | 既定は依頼どおり 2.5 のまま。UI に「非推奨」バッジと推奨モデルを表示し、env で切替 |
| Pinterest API で公開検索できる | `/v5/search/pins` は自アカウントのピンのみ。`search/partner/pins` はパートナー限定ベータ | 「自分のピン検索」として実装し、全体検索は Brave/CSE/oEmbed へ |
| Google CSE で site 限定検索 | JSON API は 2027-01-01 終了・新規不可。新規 PSE は 50 ドメイン上限 | レガシー扱い。Brave Search API を第一の代替に |
| Adobe Stock 画像を参照としてモデルに渡せる | 開発者規約 §9 が AI/ML 利用を禁止。§3.2/§6 が帰属表示を要求 | 表示のみ。passPixels 不可・AI 抽出不可・帰属表示必須 |
| Pinterest 画像を自由に保存できる | 開発者規約は API データの保存・AI 学習を禁止 | 保存は id/URL/題名のみ。画像は明示操作で取り込み |
| 画像プロキシ 6MB | Vercel の本文上限は 4.5MB | 4MB 上限。2K/4K はローカル実行を案内 |
| Cannes の公式アーカイブ API | 存在しない（Love The Work は会員制） | 同梱メタデータ + 外部リンク + 画像は都度検索 |

---

## 8. 品質基準（批評ルーブリック）

| 基準 | 問い | 5 点の状態 |
|---|---|---|
| Concept | ブリーフの約束が一目で伝わるか | 1 秒で主題と意図が読める |
| Composition | 視線誘導と余白 | 主役・脇役・余白が三層で成立 |
| Hierarchy | 見出しゾーン/情報の順序 | 文字を載せる場所が自然に空いている |
| Color | 60-30-10 と参照配色との整合 | 主・副・差し色が役割を持つ |
| Craft | 破綻（手・文字・パース）の無さ | 拡大しても破綻が無い |
| Brand fit | トーン語との一致 | トーン語 3 つ全部が感じ取れる |

---

## 9. リスクと対策

- Pinterest 公式 API は公開検索を許さない（確定） → Brave / CSE(site:pinterest.com) / oEmbed 取り込みで代替（B4）。
- Google CSE JSON API は 2027-01-01 終了・新規不可 → Brave を第一の代替とし、CSE はレガシー扱い。
- Gemini の安全フィルタで空返却 → `blocked/reason` を UI に出し、プロンプト修正案を提示。
- Gemini 2.5 Flash Image の廃止（2027-03-15） → モデル ID は env と UI で切替可能。`promptGuide.json` に廃止注記。
- Vercel 60 秒制限 → 生成は 1 リクエスト 1〜2 枚、参照画像は 1024px 以下に縮小してから送る。
- Vercel の本文上限 4.5MB（リクエスト/レスポンス） → 画像プロキシは 4MB 上限、2K/4K 出力は Vercel 上では 413 を返してローカル実行を案内。
- localStorage 上限 → 画像は IndexedDB、プロジェクト JSON は 1MB 以下に保つ（サムネは blob 参照）。
- 権利 → B1/B6 のガードと UI 上の明示。

---

## 10. 実装分担

| 担当 | 範囲 |
|---|---|
| Fable | 本設計書、`store.jsx`、`lib/prompt.js`、`directionVars.json`、`styles.css`、`App.jsx` シェル、`vite.config.js`、`server/lib/devApi.js`、統合/レビュー/PR |
| Opus 5（リサーチ） | `research-image-generation.md` + `promptGuide.json` / `research-reference-sources.md` / `cannes.json` + `frameworks.json` + `research-cannes-and-frameworks.md` |
| Opus 5（実装 API） | `api/studio/*`, `server/lib/*`（devApi 以外） |
| Opus 5（実装 UI） | `studio/src/screens/*`, `components/*`, `lib/{api,idb,palette,figmaSpec,guard}.js` |
| Opus 5（実装 Figma） | `figma-plugin/*`, `docs/studio/figma-flow.md` |
