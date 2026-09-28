# 画像 → Figma コンポーネント 再現フロー

> 対象: `docs/studio/DESIGN.md` の E1〜E4（§5）。
> 生成したキービジュアル 1 枚を、**色・書体・余白のトークン**と**バリアント付きコンポーネント**として
> Figma に載せ直すまでの手順を、2 つの経路（同梱プラグイン / Claude Code + Figma MCP）で書く。

```
生成画像 ─▶ パレット抽出 ─▶ トークン ─▶ spec.json ─┬─▶ ① プラグイン（決定論的・オフライン）
   (Gemini)     (k-means)      (色/書体/余白)        └─▶ ② Figma MCP（エージェント駆動）
                                                            │
                                              Figma ────────┴──▶ get_design_context / Code Connect ─▶ コード
```

---

## 1. アプリ側（Figma ステージ）

`studio/` の「6 Figma」ステージでやること。ここまでで `handoff.spec` が固まる。

1. **生成を選ぶ** — `gens[]` から採用する 1 枚を選ぶ（`handoff.selectedGenId`）。
   星付き・批評の総合点が高いものが候補に出る。
2. **パレットを抽出する** — 画像を縮小 → RGB 画素を k-means で 6 クラスタに分け、
   面積比（`share`）付きの色を取る（`studio/src/lib/palette.js`）。
3. **役割を割り当てる** — 明度・彩度・面積から
   `primary / secondary / accent / bg / surface / ink / inkSoft / line / onPrimary` の 9 役に自動で配る。
   文字色と背景色のコントラストは AA(4.5:1) を満たすまで自動補正される。**手で入れ替えてもよい**。
4. **書体・余白・角丸を決める** — 本文書体 / 見出し書体、base サイズと比率（既定 Major Third 1.25）から
   `display / h1 / h2 / h3 / body / caption` の 6 段。余白は 8 段、角丸は 5 段のプリセットから選ぶ。
5. **spec を組む** — テンプレート（KV フレーム / Button / Tag / Card / Hero / Header）から
   `spec.json` を決定論的に生成（`studio/src/lib/figmaSpec.js`）。任意で Claude が画像を見て微調整する。
6. **プレビューして書き出す** — アプリ内の HTML プレビューで確認 → `spec.json` を書き出す。
   画像は `assets[0].dataUrl` に base64 で埋め込まれるので、**ファイルは 1 つで完結**する。

`spec.json` の形は DESIGN.md §4.6 が唯一の契約。完全な実例が
`studio-figma-plugin/samples/sample-spec.json` にある（9 色 / 6 段 / KV 1 枚 / 5 コンポーネント 14 バリアント）。

---

## 2. 経路① 同梱プラグイン（既定・おすすめ）

決定論的で、同じ spec からは毎回同じものが出る。Figma アカウントの認証も通信も要らない。

### 2-1. 入れる

**Figma デスクトップアプリ**でファイルを開き、メニューの **Plugins → Development →
Import plugin from manifest…** から `studio-figma-plugin/manifest.json` を選ぶ。
（ブラウザ版のメニューにはこの項目が無い。デスクトップアプリが要る）

一度入れれば以後は **Plugins → Development → Sorairo Studio Importer** に並ぶ。

### 2-2. 流す

起動すると 420 × 560 の小さなパネルが出る。上から順に、

- **spec.json 欄** — 貼り付けるか、右上の「ファイルを選ぶ…」で `.json` を開く。
  入力すると欄の下に「「空色の庭」／色 9 ・フレーム 1 ・コンポーネント 5（14 バリアント）」と要約が出る。
  ここが「JSON として読めません」なら、その先へは進まない。
- **生成するもの** — 「Variables を作る / Styles を作る / Components を作る / 画像フレームを作る」の
  4 つのチェックと、ページ名の上書き欄（空なら `Sorairo / <spec.name>`）。
- **生成ボタン** — 押すとログ欄に時刻付きで進捗が流れる。
  `ページを準備中…` → `フォントを読み込み中…` → `Variables: 22 件作成` → `Paint Styles: 9 件作成` →
  `Text Styles: 7 件` → `フレーム: KV / 16:9` → `コンポーネント: Button — 6 バリアント` … → `完了`。
- **エラー欄** — 契約に合わない spec は赤い箱に箇条書きで出る。
  例: `components[0].variants[2].node.fill: $color.brand が tokens.color にありません。`

終わるとキャンバスが新しいページに切り替わり、作られたものが選択された状態でビューに収まる。

### 2-3. 出来上がり

左に版面（1920×1080 の KV、画像塗り + 見出しゾーン）、その下に 120px 空けて
ComponentSet が横並び（Button / Tag / Card / Hero / Header）。
ローカル変数パネルに `Sorairo` コレクション（`color/*` 9 本、`space/*` 8 本、`radius/*` 5 本）、
スタイル一覧に `Sorairo/…` の Paint / Text Style が入る。

もう一度流しても壊れない。ページ・変数・スタイルは名前で再利用し、
版面とコンポーネントセットだけ ` (2)` を足して右隣に並ぶ。

---

## 3. 経路② Claude Code + Figma MCP（`use_figma`）

同じ `spec.json` を、プラグインを入れずに Claude に組ませる経路。
**Figma MCP サーバが繋がっていて、対象ファイルを開く権限がある**ことが前提。

### 3-0. 生成器でスクリプトを作る（推奨・実走済み）

手で `use_figma` のコードを書く代わりに、`spec.json` から自己完結スクリプトを生成する。

```bash
node studio-figma-plugin/mcp/spec-to-use-figma.mjs <spec.json> <出力先> --check
#   01-page-variables.js  ページ "Sorairo / <name>" + Variables（color/space/radius、scopes 付き）
#   02-styles.js          Paint Styles（Sorairo/<key>）+ Text Styles（Sorairo/<style>-<family>）
#   10-frame-<id>.js      版面（画像塗りは副色のプレースホルダ。imageTargets を返す）
#   20-component-<id>.js  コンポーネント（createComponent → combineAsVariants → グリッド配置）
#   assets/<id>.png       dataUrl を復号した画像（upload_assets の nodeIds に貼る）
```

各スクリプトは `use_figma` の作法に沿っている: 最上位 `await`/`return`、`setCurrentPageAsync` は 1 回、
HUG/FILL は `appendChild` の後、`setBoundVariableForPaint` の戻り値を使う、Variables/Styles は名前で再利用（再実行しても壊れない）。
`--check` は `use_figma` と同じ async ラップで構文検査する。

**2026-09-18 の実走（アプリ書き出しの spec → 新規 Figma ファイル）**: 8 本のスクリプトを順に流し、
Variables 22 / Paint Styles 9 / Text Styles 6 / KV フレーム 1 / ComponentSet 5（Button 6・Tag 2・Card 2・Hero 2・Header 2 = 14 バリアント）が
エラー・フォント代替なしで生成された。`upload_assets` の POST だけは実行環境の egress 制限で送れなかったため、
画像はローカル環境から `curl -F "file=@assets/kv.png;type=image/png" <submitUrl>` で貼る（URL は 10 分で失効）。

### 3-1. 渡すプロンプト（そのまま貼る）

````text
Figma の <ファイルの URL> に、この spec.json をそのまま再現してほしい。
figma-use と figma-generate-library のスキルを読んでから use_figma を使うこと。
順番は Variables → Styles → Frames → Components で、各ステップのあと get_metadata で確認して。

ルール:
- 色は tokens.color を Variables コレクション "Sorairo" の color/<key>（COLOR, scopes は
  ["ALL_FILLS","STROKE_COLOR"]）にする。値は 0〜1 の {r,g,b,a}。
- tokens.space / radius は FLOAT 変数 space/<i> / radius/<i>（scopes は ["GAP"] / ["CORNER_RADIUS"]）。
- Paint Style は Sorairo/<key>、Text Style は Sorairo/<style>。塗りは
  figma.variables.setBoundVariableForPaint(paint, "color", variable) の戻り値を使う（新しい paint が返る）。
- node の size.wMode / hMode は layoutSizingHorizontal / Vertical（FIXED|HUG|FILL）に写す。
  必ず appendChild のあとで設定する。
- 画像（assets[].dataUrl）は use_figma からは作れないので upload_assets を使い、
  返ってきた imageHash を { type:"IMAGE", imageHash, scaleMode:"FILL" } として塗る。
- components[] は各バリアントを figma.createComponent() で作り、名前を "Prop=Value, Prop2=Value2" に
  してから figma.combineAsVariants(components, page)。まとめた直後は全部 (0,0) に重なるので、
  x / y を振り直してセットを resizeWithoutConstraints すること。
- 作成・変更したノードの ID を毎回 return すること。

spec.json:
```json
<ここに spec.json の中身を貼る>
```
````

長い spec は 1 回の `use_figma` に収まらない。**Variables → Styles → 版面 → コンポーネント 1 つずつ**と
分けて投げるのが速い（スキルの指針も「1 呼び出しあたり論理操作 10 個まで」）。

### 3-2. Claude 側が守る主なルール（`figma-use` スキル）

| 決まり | 中身 |
|---|---|
| スキル必読 | `use_figma` の前に `figma-use` を読む。コンポーネントを作るなら `figma-generate-library` も |
| ページ切り替え | `figma.currentPage = page` は throw する。`await figma.setCurrentPageAsync(page)` のみ。1 スクリプト 1 回 |
| 出力 | `console.log` は返らない。`return` した値だけがエージェントに見える。`figma.notify()` は未実装 |
| 色 | 0〜255 ではなく **0〜1**。Paint の `color` に `a` は入れない（不透明度は paint 側の `opacity`） |
| 塗り・線 | 読み取り専用配列。複製して差し替える |
| フォント | 触る前に必ず `await figma.loadFontAsync(...)`。スタイル名は `listAvailableFontsAsync()` で確認（`SemiBold` / `Semi Bold` の取り違えが定番） |
| サイズ | `HUG` は auto-layout フレーム自身か、その TEXT の子だけ。`FILL` は auto-layout の子だけ。`resize()` はサイズ指定を FIXED に戻すので**先に resize、あとで sizing** |
| 画像 | `figma.createImage()` / `createImageAsync()` は **use_figma では使わない**。`upload_assets` が唯一の経路 |
| 変数 | `scopes` は必ず明示（既定の `ALL_SCOPES` はピッカーを汚す） |

### 3-3. 確認すること

1. `get_metadata` — ページ構成・階層・個数・名前。`Variant=Primary, Size=M` の形になっているか。
2. `get_screenshot`（または `await node.screenshot()`）— 文字の切れ、要素の重なり、余白。
3. `get_variable_defs` — 変数が実際に値として解決されているか。
4. ローカル変数パネルとスタイル一覧 — 名前が `Sorairo/...` で揃っているか。

### 3-4. プラグインとの違い

| | ① プラグイン | ② Figma MCP |
|---|---|---|
| 実行主体 | 決定論的なコード。同じ spec → 毎回同じ結果 | エージェント。**毎回まったく同じにはならない** |
| 認証 | 不要（ローカルのファイルに書く） | ユーザーの Figma 認証と MCP サーバが要る |
| 通信 | 一切なし（`allowedDomains: ["none"]`） | MCP 経由で Figma と通信する |
| 画像 | `figma.createImage(bytes)` で spec 内の dataUrl をそのまま取り込む | `upload_assets` にバイト列を POST する必要がある |
| 途中の判断 | しない（契約どおりに作るだけ） | 既存のデザインシステムを探して合わせる、命名を揃える等ができる |
| 失敗の出方 | 検証エラーを日本語でまとめて返す | 実行時エラーを見てエージェントが自己修復する |
| 向いている場面 | 毎回同じものを確実に作る。オフライン。配布 | 既存ファイルに馴染ませる。spec に無い調整を混ぜる |

**迷ったらプラグイン。** MCP は「既にあるライブラリに合わせて置きたい」ときに効く。

---

## 4. 精度チェックリスト

Figma に載ったあと、この順で見る。片方の経路で作っても同じ基準。

- [ ] **Auto Layout のサイズ指定** — 版面の子は `FILL`、ボタンは縦横 `HUG`、カードは幅 `FIXED` × 高さ `HUG`。
      「幅 `FILL` なのに `WIDTH_AND_HEIGHT` の文字」は細い縦棒になるので即わかる。
- [ ] **ピクセルグリッド** — 余白・角丸が `tokens.space` / `radius` の値そのままか（半端な小数が無いか）。
- [ ] **制約（Constraints）** — Auto Layout でない親（版面フレーム直下）の子が `STRETCH` か。
      リサイズしても中身がずれないこと。
- [ ] **命名** — バリアントが `Prop=Value, Prop2=Value2`、セット名が `Button` 等の単数形。
      `=` と `,` をプロパティ名・値に含めない（Figma がバリアント名を壊す）。
- [ ] **画像の scaleMode** — 版面は `FILL`（切れてもよい）、比率を保って全部見せたい場所は `FIT`。
- [ ] **テキストスタイル** — 文字に `Sorairo/<style>` が当たっているか。
      当たっていない文字は、書体とスタイルがずれている（= 当てると見た目が変わる）ことが多い。
- [ ] **変数の束縛** — 塗りが `color/<key>` に、余白が `space/<i>` に、角丸が `radius/<i>` に紐づいているか。
      色を 1 つ変えたら全部追随すること。
- [ ] **コントラスト** — `ink` / `inkSoft` が `bg` / `surface` の上で 4.5:1 以上、`onPrimary` が `primary` の上で読めるか。
- [ ] **バリアントの網羅** — 宣言した組み合わせが全部あるか（欠けるとバリアントピッカーが空欄になる）。
- [ ] **重なり** — 版面とコンポーネントセットが 120px 以上離れているか。

---

## 5. 往復（Figma → コード）

戻す側も MCP で繋がる。

- **`get_design_context`** — Figma のノード（URL か node-id）から、実装用の文脈
  （レイアウト・トークン・変数名・画像）を取り出す。
  呼ぶ前に `figma-design-to-code` スキルを読むこと（必須）。
- **`get_variable_defs`** — 変数の定義だけを引き、CSS 変数やトークンファイルに落とす。
  Sorairo の spec は `toDtcg()` で W3C Design Tokens 形式にも書き出せるので、突き合わせに使える。
- **Code Connect** — `figma-code-connect` スキルを読んでから `.figma.ts` を書き、
  `add_code_connect_map` で Figma のコンポーネントとコードのコンポーネントを対応づける。
  一度繋いでおくと、以後 `get_design_context` が**そのコンポーネントのコードそのもの**を返すようになる。

つまり `spec.json → Figma → Code Connect → コード` で一周する。
一周させたあとは、色や余白の変更は Figma の変数側で完結する。

---

## 6. 限界と次の一手

いまできないこと（両経路とも）:

- グラデーション・影・ぼかし。spec にフィールドが無い（`fill` は単色 / トークン参照 / 画像のみ）。
- 絶対座標。配置はすべて Auto Layout で表すのが契約なので、重ね置きは表現できない。
- Component Property（TEXT / BOOLEAN / INSTANCE_SWAP）。今はバリアントだけ。
- 入れ子インスタンス。Card の中の Tag は**実体のコピー**で、Tag コンポーネントのインスタンスではない。
- 複数モード（Light / Dark）。変数はコレクションの既定モード 1 つにしか値を入れない。

次に効きそうな順:

1. **入れ子インスタンス** — 先に Tag / Button を作り、Card / Hero ではそのインスタンスを置く。
   spec に `{ "type": "instance", "component": "tag", "props": {...} }` を足せば表現できる。
2. **Component Property** — ボタンのラベルを TEXT プロパティにする（`addComponentProperty` は
   `combineAsVariants` の**前**に各バリアントへ足し、`componentPropertyReferences` で子に結ぶ）。
3. **Light / Dark** — `tokens.color` をモード別に持ち、`collection.addMode("Dark")` で 2 モードにする
   （無料プランは 1 モードまで）。
4. **エフェクト** — `tokens.shadow` を足して `figma.createEffectStyle()` に流す。
5. **Code Connect の自動生成** — 生成したコンポーネントに対して `.figma.ts` の雛形も同時に書き出す。

---

## 関連

- 契約（spec の schema）: [`DESIGN.md` §4.6](./DESIGN.md)
- プラグインの使い方・トラブルシュート: [`studio-figma-plugin/README.md`](../../studio-figma-plugin/README.md)
- 実例の spec: `studio-figma-plugin/samples/sample-spec.json`
- spec を作る側: `studio/src/lib/figmaSpec.js` / `studio/src/lib/palette.js`
