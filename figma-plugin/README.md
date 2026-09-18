# Sorairo Studio Importer（Figma プラグイン）

Sorairo Studio が書き出した `spec.json`（[DESIGN.md §4.6](../docs/studio/DESIGN.md) の契約）を読み込み、
Figma のネイティブなオブジェクトとして組み直します。画像を貼るだけでは終わらせない、が方針です。

| spec の中身 | Figma に出来るもの |
|---|---|
| `tokens.color` | Variables コレクション `Sorairo` の `color/<key>` + Paint Style `Sorairo/<key>` |
| `tokens.type` | Text Style `Sorairo/display` … `Sorairo/caption` |
| `tokens.space` / `tokens.radius` | FLOAT 変数 `space/<i>` / `radius/<i>`（余白・角丸に自動で束縛） |
| `assets[]` | `figma.createImage()` で取り込んだ画像（`imageHash`） |
| `frames[]` | 版面フレーム（画像塗り + 見出しテキスト） |
| `components[]` | ComponentSet（`Prop=Value, Prop2=Value2` のバリアント付き） |

バンドラは使いません。`code.js` は単一ファイルの素の JavaScript です。

---

## 入れ方

1. **Figma デスクトップアプリ**を開く（ブラウザ版では開発用プラグインを読み込めません）。
2. 任意のデザインファイルを開く。
3. メニュー **Plugins → Development → Import plugin from manifest…**
   （またはキャンバス右クリック → Plugins → Development → Import plugin from manifest…）
4. このリポジトリの `figma-plugin/manifest.json` を選ぶ。
5. **Plugins → Development → Sorairo Studio Importer** で起動。

`manifest.json` は `networkAccess.allowedDomains: ["none"]` です。通信は一切しません。
spec は貼り付けかファイル選択で渡します。

---

## 使い方

1. Sorairo Studio の「Figma」ステージで `spec.json` を書き出す。
2. プラグインを起動し、**spec.json を貼り付ける**か、「ファイルを選ぶ…」で `.json` を読み込む。
   入力欄の下に「色 9 ・フレーム 1 ・コンポーネント 5（14 バリアント）」のように要約が出ます。
3. 作るものをチェックで選ぶ。

   | オプション | 内容 |
   |---|---|
   | Variables を作る | コレクション `Sorairo` に色・余白・角丸の変数を作り、塗りと数値を束縛する |
   | Styles を作る | Paint Style と Text Style を作り、テキストにスタイルを当てる |
   | Components を作る | ComponentSet（バリアント）を作る |
   | 画像フレームを作る | `frames[]` の版面を作る |

   「ページ名」を空にすると `Sorairo / <spec.name>` に作ります。
4. **生成**を押す。ログに進捗が流れ、終わると件数の要約が出ます。

生成したものは新しいページに置かれ、選択状態でビューが寄ります。

---

## 出来上がるもの（命名規則）

| 種類 | 名前 | 例 |
|---|---|---|
| ページ | `Sorairo / <spec.name>` | `Sorairo / 空色の庭` |
| 変数コレクション | `Sorairo` | — |
| 色の変数 | `color/<key>` | `color/primary` |
| 余白・角丸の変数 | `space/<i>` `radius/<i>` | `space/4`（= 24px） |
| Paint Style | `Sorairo/<key>` | `Sorairo/accent` |
| Text Style | `Sorairo/<style>` | `Sorairo/h1` |
| Text Style（もう一方の書体） | `Sorairo/<style>-<display\|body>` | `Sorairo/h3-display` |
| バリアント | `Prop=Value, Prop2=Value2` | `Variant=Primary, Size=M` |

Text Style は既定で **display・h1 は見出し書体、h2〜caption は本文書体**で作ります。
spec の中に「見出し書体の h3」のような組み合わせが出てきた場合だけ、`Sorairo/h3-display` を追加で作って当てます
（スタイルと実際の書体がずれると、スタイルを当てた瞬間に見た目が変わってしまうため）。

---

## フォントについて

`tokens.type.family` / `displayFamily`（例: `Noto Sans JP` / `Shippori Mincho`）を
`figma.listAvailableFontsAsync()` で確認してから読み込みます。

- ウェイトは **Regular / Medium / Bold** を解決します。無いウェイトは同じ書体の別ウェイトで代用します。
- **書体そのものが無い場合は `Inter` に落とします。** その旨はログと完了サマリに
  「`Shippori Mincho → Inter（この環境に Shippori Mincho がありません）`」として必ず出ます。
- 日本語書体を正しく反映したいときは、先に Figma 側でその書体を使えるようにしてください
  （Google Fonts の `Noto Sans JP` / `Shippori Mincho` は Figma に標準で入っています。
  ローカルフォントを使う場合はデスクトップアプリ + フォントインストーラが必要です）。

---

## もう一度流したとき（冪等性）

同じ spec を 2 回流しても壊れません。

- ページ・変数コレクション・変数・Paint/Text Style は**名前で探して再利用**します（値は上書き）。
- フレームとコンポーネントセットは名前が衝突すると ` (2)`, ` (3)` … を足して**別物として並べます**
  （既存を消さないため。要らない方は手で消してください）。
- 新しい版面は既存コンテンツの右隣（120px 空け）に置きます。

---

## 対応していないこと

| できないこと | 理由・回避 |
|---|---|
| グラデーション塗り | spec の `fill` は `#hex` / `$color.<key>` / `{ asset, scale }` のみ。必要なら Figma 側で手で足す |
| 影・ぼかしなどのエフェクト | spec に持たせていない（`figma.createEffectStyle()` を使う拡張は可能） |
| 絶対座標での配置（x/y） | 配置はすべて Auto Layout で表現する契約。重ね配置が要るなら spec 側の設計から見直す |
| Component Property（TEXT / BOOLEAN / INSTANCE_SWAP） | 今はバリアント（`Prop=Value`）のみ。ラベル差し替えは各バリアントのテキストを直接編集 |
| バリアント同士の入れ子（インスタンス化） | Card の中の Tag などは**実体としてコピー**されます。インスタンスにしたい場合は Figma 上で置き換える |
| 画像の最適化 | `figma.createImage()` は PNG / JPEG / GIF のみ、最大 4096px。それを超える画像は先に縮小する |
| 複数モード（Light / Dark） | 変数はコレクションの既定モード 1 つだけに値を入れます |
| FigJam / Slides | `editorType` は `["figma"]`（デザインファイル専用） |

`tokens.radius` の `999`（= 丸）は Figma 側が実寸に合わせて丸めます。

---

## サンプル

`samples/sample-spec.json` が契約どおりの完全な例です（9 色・6 段の書体・KV 1 枚・
Button / Tag / Card / Hero / Header の 5 コンポーネント = 14 バリアント）。
Web アプリ側（`studio/src/lib/figmaSpec.js`）が出す spec は、この形に揃えてあります。

埋め込み画像（64×36 の PNG）は自前で生成しています。

```bash
node figma-plugin/samples/make-png.mjs              # kv.png を作り直す
node figma-plugin/samples/make-png.mjs --patch-spec # sample-spec.json の dataUrl も入れ替える
```

---

## 開発

```bash
node --check figma-plugin/code.js                 # 構文チェック
node --test "tests/figma/*.test.mjs"              # プラグインのテストだけ
node --test "tests/**/*.test.mjs"                 # リポジトリ全体
```

テストは `node:vm` の中で `code.js` を偽の `figma` グローバルと一緒に動かします。
偽 API 側で Figma と同じ制約（`layoutSizing*` の HUG / FILL 規則、`combineAsVariants` は
ComponentNode のみ、など）を再現しているので、**警告ゼロで完走する = 規則を破っていない**という検査になります。

`validate.js`（ESM、テストと Web アプリから使える）と `code.js` の検証ロジックは同一です。
`// ===== SORAIRO_VALIDATOR_BEGIN =====` 〜 `END` のブロックを**両方に同じ内容で**置き、
テストが 1 バイト単位で照合します。片方だけ直すとテストが落ちます。

主な API は `@figma/plugin-typings` v1.138.0 で確認済みです。
`documentAccess: "dynamic-page"` なので、以下は**非同期版しか使えません**。

| 同期版（使えない） | 使う方 |
|---|---|
| `figma.currentPage = page` | `await figma.setCurrentPageAsync(page)` |
| `figma.getLocalPaintStyles()` | `await figma.getLocalPaintStylesAsync()` |
| `node.fillStyleId = id` | `await node.setFillStyleIdAsync(id)` |
| `node.textStyleId = id` | `await node.setTextStyleIdAsync(id)` |
| `figma.variables.getLocalVariables()` | `await figma.variables.getLocalVariablesAsync()` |

---

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| Import plugin from manifest… が無い | ブラウザ版を使っている。**デスクトップアプリ**で開く |
| 「spec.json が §4.6 の形式に合っていません」 | エラー欄に不一致の場所が全部出ます（`components[0].variants[2].node.fill: $color.brand が tokens.color にありません` など）。Web アプリ側で直してから書き出す |
| 文字が全部 Inter になる | その書体がこの環境に無い。完了サマリの「フォント代替」を確認。Figma 側で書体を入れてから再実行 |
| 画像が入らない（塗りが抜ける） | `assets[].dataUrl` が base64 の data URL か確認。PNG / JPEG / GIF 以外、4096px 超は `figma.createImage()` が弾きます。警告に画像 ID が出ます |
| テキストが細い縦棒になる | 幅 `fill` のテキストに `textAutoResize = WIDTH_AND_HEIGHT` が付いた状態。本プラグインは `HEIGHT` を設定しますが、手で戻すと再発します |
| バリアントが全部重なっている | `combineAsVariants()` の直後は (0,0) に重なります。本プラグインは並べ直しますが、手で作った場合は自分で `x` / `y` を振る必要があります |
| ページが増えていく | 「ページ名」を毎回変えている。空欄にすれば `Sorairo / <spec.name>` を使い回します |
| 「Starter プランは 3 ページまで」 | 無料プランのページ数上限。既存ページを消すか、有料プランのファイルで実行する |
| 実行が長い | 版面と全バリアントを一度に作ります。まずオプションを絞って（Variables + Styles だけ）試すと切り分けられます |

流れ全体（アプリ側の操作、Claude Code + Figma MCP 経由の別ルート）は
[`docs/studio/figma-flow.md`](../docs/studio/figma-flow.md) にあります。
