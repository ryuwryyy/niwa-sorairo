# design-agent

ペルソナ → ユーザージャーニーマップ → 感情マップ → 価値提供マップ → UX仕様 → 画像生成 → **構造化抽出** → Figma構築 → 検証
を **1画面ずつ**回し、**3つのゲートを全部通るまで諦めない**デザイン自動化エージェント。

```
製品ブリーフ → 01 ペルソナ → 02 ジャーニー → 03 感情 → 04 価値提供 → 05 UX仕様
                                                                     ↓
                              ┌──────── 1画面ずつ、順番に ────────┐
                              ↓                                    │
                  06  Images 2.5 でモックアップ生成                 │
                              ↓                                    │
                  06b 構造化抽出（信頼度マーカー ✅⚠️❓）            │
                      ← 画像を直接 Figma へ渡さない                 │
                              ↓                                    │
                  07  Figma構築 (use_figma)                        │
                      変数 → コンポーネント → 画面 の順             │
                              ↓                                    │
                  08  検証 → G1 / G2 / G3 ─────────────────────────┘
                              ↓ 全通過
                            次の画面へ
```

## 設計の根拠は公式スキル

自己流をやめ、[figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) の
`figma-generate-design` / `figma-generate-library`、および
[openai/skills](https://github.com/openai/skills) の curated スキル、
[uxKero/anydesign](https://github.com/uxKero/anydesign) の抽出方針に合わせてあります。
`prompts/07-figma-build.md` と `prompts/08-verify.md` には該当規則を原文で引用しています。

主に効いている規則:

- **「Variables BEFORE components — components bind to variables. No token = no component.」**
  トークンが無い見た目は作らない。変数 → コンポーネント → 画面 の順を崩さない。
- **「Never hardcode hex colors or pixel spacing when a design system variable exists.
  Use `setBoundVariable` for spacing/radii and `setBoundVariableForPaint` for colors.」**
  束縛対象は fills/strokes・spacing・radii・typography の**4系統すべて**。
- **「Do NOT build sections as top-level page children and reparent them later —
  moving nodes across `use_figma` calls with `appendChild()` silently fails.」**
  ラッパーを先に作り、各セクションは自分の `use_figma` 呼び出しの中で直接そこへ足す。
- **「Screenshot individual sections, not just the full view. A full-view screenshot at
  reduced resolution hides text truncation, wrong colors, and placeholder text.」**
  全景1枚のレビューは G3 で無効扱いにする。
- **「You MUST explicitly assert that rendered text uses the product font(s) ...
  loading Inter when the product uses SF Pro is a failure even if no errors occur.」**

## なぜ画像を直接 Figma へ渡さないか（06b 抽出ステージ）

生成画像をそのまま「これを作れ」と渡すと、下流は読み取れなかった値を
**それらしい数字で埋めます**。これが精度を落とす最大の原因でした。

`anydesign` の方針に倣い、画像を先に構造化仕様へ落とし、すべての推定に信頼度を付けます。

| マーカー | 意味 |
|---|---|
| ✅ | 画像から直接読み取れた（16進数、明確なテキスト） |
| ⚠️ | 画素からの測定値。誤差あり |
| ❓ | 判別不能。**埋めずに「不明」と書く** |

`divergence` 層で「仕様と生成画像のズレ」を明示します。生成モデルは仕様を取りこぼすので、
画像が常に正しいとは限りません。❓ の箇所は仕様側を優先します。

## ゴールの定義と3つのゲート

| ゲート | 判定内容 | 閾値 | 判定方法 |
|---|---|---|---|
| **G1** spec-coverage | UX仕様の `mustHave` 要素がFigma上に実在するか | 100% | ノード名を走査。主観ゼロ |
| **G2** token-fidelity | 色・余白・角丸・書体がトークンに束縛されているか | 100% | 4系統それぞれの束縛率＋スケール逸脱を実測 |
| **G3** visual-review | **セクション単位**のスクリーンショット評価 | 4.0/5 かつ blocker 0件 | 全景1枚しか無い場合は無効として弾く |

G1/G2 は実測値の機械判定なので、モデルが自分に甘く付けられません。
G3 は採点が未記録なら pending のまま不合格を返します。
**監査データが不完全な場合も、通しません**（下記の訂正を参照）。

## トークンは DTCG（W3C 標準）で持つ

独自JSONをやめ、W3C Design Tokens Community Group 形式（安定版 2025.10、
Adobe / Figma / Google / Microsoft / Shopify / Salesforce ほか40社超が支持）に揃えました。
Figma・Penpot・Sketch・Tokens Studio・Style Dictionary・Terrazzo がそのまま読み書きします。

```bash
node tools/emit-tokens.mjs
# → artifacts/design.tokens.json        ($type / $value、dimension は {value, unit})
# → artifacts/figma-variable-plan.json  (Figma Variables 作成用の平坦な指示)
```

## 「必ずゴールに到達する」ための仕掛け

- 不合格の理由（`gate.js` の `fixes`）が、そのまま次の試行のプロンプトに入る
- N回失敗するごとに Web 調査へ切替（`escalate.js`）
- それでも駄目なら人間に質問。**その画面だけ保留して他の画面は進める**（ブロックしない）
- 同一の指摘が3回続いたら「アプローチ自体が間違っている」と判定して質問へ切替
- `.design-agent/state.json` から再開できる

## 使うモデル

| 役割 | 既定 | 環境変数 |
|---|---|---|
| 推論・仕様生成・構造化抽出・視覚レビュー | `gpt-6-astra` | `ASTRA_MODEL` |
| モックアップ画像 | `gpt-image-2.5-sunburst` | `IMAGE_MODEL` |

`images25.js` の `snapSize()` は API のサイズ制約（各辺16の倍数 / 各辺≤3840 / 長短比≤3:1 /
総画素 655,360〜8,294,400）に自動で丸めます（`1440x900` → `1440x896`）。

## 実行

```bash
npm install
cp .env.example .env.local          # OPENAI_API_KEY を設定

node tools/emit-tokens.mjs          # DTCG トークンを出力
node src/cli.js run --dry-run       # 実行計画だけ表示
node src/cli.js run --driver mcp --file <figmaFileKey>
node src/cli.js status
node src/verify.js --visual artifacts/visual-review.json
```

`--driver emit` はプラグインJSを `.out/` に書き出すだけのモードです。
MCP接続を持つエージェント（Claude Code / Codex 等）がそれを実行します。

## Figma MCP のレート制限（実測で踏んだ）

| プラン / シート | 上限 |
|---|---|
| Starter、または View / Collab シート | **月 6 回** |
| Pro / Organization / Enterprise の Full・Dev シート | **日 200 回** |

Starter + View シートの個人チームで作業したところ、**6回で打ち止め**になりました。
「書き込みツールは制限対象外」という記述を見つけて検証しましたが、
実際には `use_figma`（書き込み）も同じように弾かれます。
実運用では Full / Dev シートのある Pro 以上が前提です。

## この構成で作ったもの

題材は「差配 / Sahai」— デザインと定型タスクに特化し、トリガーで起動し、
Push型で受動的に届き、**意思決定は人間が持つ**AIエージェント基盤（`config/product.sahai.json`）。

- Figma: https://www.figma.com/design/V2ZZhYMLznvdtJ2StFhtlf
  - `01 画面` — 6画面（差配ボード / 決裁ビュー / 実行トレース / トリガー編成 / エージェント目録 / 決裁台帳）
  - トークン27個を Figma Variables として定義

## 訂正（2026-09-16）

**当初「トークン束縛率 709/709 (100%)、全画面 GOAL REACHED」と報告しましたが、これは誤りです。**

G2 は SOLID paint の色しか測っておらず、製品仕様が求める「色・字種・余白」のうち
**余白と角丸を測っていませんでした**。4系統で採点し直すと実態は約 0.50 で不合格です。
Figma 上の余白・角丸は変数に束縛されておらず、生値のまま入っています。

さらに、G3 の採点は全景1枚（1440px を約1024pxへ縮小）で行っており、
公式スキルが明示的に禁じている撮り方でした。文字切れを見落としている可能性があります。

`gate.js` は4系統を測る実装に直し、`artifacts/figma-audit.json` は
不完全であることを明示、`verify.js` は監査が不完全なら通さないようにしました。
現在の `node src/verify.js` は**意図どおり不合格（exit 1）を返します**。

再測定と修正（余白・角丸の変数束縛、コンポーネント化、セクション単位の再撮影）には
Figma への書き込みが必要で、上記のレート制限の解除待ちです。

## 既知の未完了

- **余白・角丸が変数に未束縛。** 色15個・余白8個・角丸4個の変数は作ってあるが、
  束縛したのは色だけ。`setBoundVariable` での束縛が必要。
- **コンポーネント化していない。** サイドバーを4回 `clone()` しており、
  COMPONENT + インスタンスになっていない。`figma-generate-library` の要求を満たしていない。
- **余白スケールが実装と合っていない。** 宣言は 4/8/12/16/24/32/48/64 だが、
  実装では 3/5/7/9/11/13/14/18/20/22 などを使っている。
  スケール側を見直すか、実装を寄せるかの判断が要る。
- **Astra / Images 2.5 の実呼び出しは未検証。** アダプタは公開仕様どおり実装済みだが、
  このコンテナからは `openai.com` への通信がプロキシでブロックされている。
