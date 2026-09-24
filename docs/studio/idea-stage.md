# 企画（Idea）ステージ — 仕様

> 位置: `1 課題(Consult)` と `3 参照(Refs)` のあいだ。`STAGES` の `n = 2`。
> 目的: 専門家でない人が、**ブリーフ → インサイト → 緊張 → コアアイデア → KV コンセプト + タグライン** を、
> 受賞作の分解と手法ライブラリに導かれながら 1 画面で通せるようにする。
> AI キーが 1 つも無くても、決定的生成器（`studio/src/lib/idea.js`）だけで同じデータ構造が全部埋まる。

---

## 1. 何をする画面か

| # | セクション | やること | 出るデータ |
|---|---|---|---|
| 1 | 先生を選ぶ（デコンテ） | カンヌ受賞作を**固定の順**で分解して読む。最大 3 件を「先生」にする。型（20 種）を最大 3 つ選ぶ | `idea.teachers[]` / `idea.patterns[]` |
| 2 | インサイトを掘る | 6 つの探し方の問いに答え、インサイト 5 本と緊張 5 本を出して 1 本ずつ採用する | `idea.insights[]` / `idea.tensions[]` / `consult.frames["insight_<id>"]` |
| 3 | コアアイデアを出す | 6 案を出し、書き直し、10 問で検査し、3 基準で採点し、変種を足し、1 本を採用する | `idea.ideas[]` |
| 4 | CD の問い | 出す前に自分で自分に聞く問い（チェックリスト）。手法・仕上げの辞典 | `consult.frames["cd_questions"]` |
| 5 | この企画で進む | 採用した 1 本を core に固定し、参照 / 方向へ送り出す | `idea.core` |

受賞作は**構造（どう考えたか）だけ**を借りる。作品名・ブランド・絵をなぞる指示は、
プロンプトのガード（`lib/guard.js` / `guardPrompt()`）と AI のシステムプロンプト両方で止める。

読む順は全作品で固定する。同じ順で読むから「型」が見えてくる:

```
課題 → 人間の真実 → ブランドの真実 → 緊張 → コアアイデア → 跳躍 → 実行 → 接点 → 結果 → 学び
```

---

## 2. 状態（`store.jsx` の `emptyIdea()`）

```jsonc
idea: {
  teachers: ["<cannes.json の id>"],        // 最大 3
  patterns: ["<ideaPatterns.json の id>"],  // 最大 3
  insights: [{ id, text, source, evidence, chosen }],   // source = craft.insightSources の id
  tensions: [{ id, text, chosen }],
  ideas: [{
    id, oneLiner, twist, kvConcept, tagline, why, risk,
    patterns: ["<型 id>"],
    scores: { idea, execution, impact } | null,   // 1–5
    tests: { "<ideaTests の id>": true },
    chosen, source, parentId
  }],
  core: { oneLiner: "", kvConcept: "", tagline: "", rationale: "" },
  aiRun: null   // { at, model, op }
}
```

- `stageStatus(p).idea` — `core.oneLiner` があれば `done`、インサイトかアイデアが 1 つでもあれば `partial`、それ以外は `empty`。
- `parseProject()` は `idea` と `idea.core` を既定値とマージする。**旧バージョンの案件 JSON（`idea` が無い）も読める**。
- 画面・`prompt.js` は常に `project.idea?.…` で読む。`patch("idea.…")` は `setIn` が途中のオブジェクトを作るので、`idea` が無い案件でも書ける。
- reducer の action: `idea/addIdeas` `idea/updateIdea` `idea/removeIdea` `idea/choose`（`key: "insights" | "tensions" | "ideas"`）。

---

## 3. 読むデータファイル

| ファイル | 書く人 | 使うところ |
|---|---|---|
| `studio/src/data/ideaPatterns.json` | リサーチ | 型 20 種。`kvSeedEn` が KV コンセプトの種、`summaryJa` が跳躍の文、`risksJa` が危うさ |
| `studio/src/data/cannesDeconstruction.json` | リサーチ | 先生（受賞作の分解）。`cannes.json` と `id` で突き合わせる |
| `studio/src/data/craft.json` | リサーチ | `insightSources`（探し方の問い）/ `tensionPairs`（緊張の型）/ `ideaTests`（10 問）/ `cannesLens`（審査の見方）/ `kvGrammar`（KV 文法）/ `taglineDirections` / `adChecklist` / `cdQuestions` / `methods` |
| `studio/src/data/cannes.json` | 既存 | 受賞作の事実（年・部門・ブランド・出典） |

**`cannesDeconstruction.json` は未着でも壊れない。** `components/Deconte.jsx` は
`import.meta.glob` で「あれば読む」形にしてあり、無いときは先生の一覧を隠して
「まだ入っていない」と静かに出すだけ。型の選択と 2 以降はそのまま使える。
分解の各項目も欠けていれば行ごと出さない（部分的なエントリに耐える）。

`lib/idea.js` はデータを **引数で受け取る**（import しない）。だからデータが未着でも
ユニットテストとビルドが壊れず、テスト側は好きな入力を渡せる。

---

## 4. 決定的生成器（`studio/src/lib/idea.js`）

`Math.random()` も `Date.now()` も使わない。**同じ入力 → 同じ出力**。id だけ `makeId` で外から差せる。

### 4.1 `mineInsights({ brief, answers, sources, tensionPairs, makeId })`

`{ insights: [5], tensions: [5] }` を返す（AI op `insights` と同じ形）。

1. ブリーフ（`insight / problem / oneLiner / promise / audience`）とワーク回答を
   `fragments()` で短い断片に割る。句読点で割った端に残る接続語（「という」「ではなく」）と
   名詞に続く助詞は `trimEdges()` で落とす。「湯を注いで」の「で」のような活用語尾は、
   直前が漢字・カタカナのときだけ助詞とみなすことで切らない。
2. インサイトは 5 つの型に断片を差し込む。差し込んだ断片は必ず `「」` で囲む
   （名詞句とは限らないので、囲まないと接続が壊れる。囲ってあれば直す場所がすぐ分かる）。
   案ごとに使い始める断片をずらして、5 本が同じ言葉で埋まらないようにする。
3. `evidence` は、その探し方（`source`）に書いた回答をそのまま入れる。書いていなければ
   「見聞きした事実をここに書く」と促す。
4. 緊張は `craft.tensionPairs` の `templateJa` に差し込む。ただし
   **`needsVerbStem()` が真の型（「{X}したいのに」のように動詞の語幹が要る型）は使わない**。
   手元の断片は名詞句・述語なので流し込むと文が壊れるため、そういう型は
   「A。なのに、B。」という安全な枠に落とす。craft の 8 型のうち 4 型はそのまま使える。

### 4.2 `generateIdeas({ brief, insight, tension, patterns, teachers, kvGrammar, taglineDirections, count, makeId })`

型 1 つにつき 1 案。6 案を型の数だけ巡回させて作る（型が未選択なら 20 種すべてから順に）。

| 項目 | 作り方 |
|---|---|
| `oneLiner` | 6 つの型文のどれかに、緊張 / インサイト / 約束 / 対象 / 型の名前を差し込む。助詞が直に続くところは `quote()` で囲む（入れ子になるときは `『』`） |
| `twist` | `ふつうは{約束を言葉で説明して終わる}。この案は違う——{型の summaryJa}。そこで見る人の予想が一度外れる。` |
| `kvConcept` | **英語 1 文**。型の `kvSeedEn`（1 文）に、KV 文法の `promptSeedEn` の**最初の一節だけ**を足す。`promptSeedEn` は語句の羅列なので丸ごと足すと「見えるものの一文」でなくなる |
| `tagline` | `craft.taglineDirections` の `templateJa` から、書き手向けの注記（`（…）`）と言い換え（`／` 以降）を落として差し込む。15 文字を超えたら短い既定の型へ、それでも溢れたら断片そのものへ落とす |
| `why` | 採用インサイト + 型の `whenJa` + 先生の `timelessJa` |
| `risk` | 型の `risksJa`。無ければ既定の 6 つを巡回 |
| `scores` | `null`（採点は人がスライダーでやる） |

### 4.3 `variantIdea(idea, kind, { makeId })`

1 手だけ動かした新しいカードを作る。`kind` は `反転 / 極端化 / 媒体を変える / 主語を変える`。
日本語の一手（`jaMove`）を `oneLiner` の後ろと `twist` に、英語の一手（`en`）を `kvConcept` の後ろに足し、
`risk` はその手に固有のものに差し替える。`parentId` に元の案の id を残す。

### 4.4 採点

- `lensTotal(scores, criteria)` — 3 基準（1–5）を `weightPct` で重み付けして 0–100 に換算。
  `craft.cannesLens.criteria` は 40/30/30。データが無いときの既定は 60/20/20（`DEFAULT_LENS`）。
- `testScore(tests, ideaTests)` — 10 問を `weight` 付きで集計し `{ passed, count, pct }` を返す。
- `ensureOneChosen(list)` / `chosenOf(list)` / `ideaToCore(idea)` — 採用の管理と core への書き戻し。

---

## 5. AI の契約（`server/lib/ideaOps.js` / `api/studio/ai.js`）

どちらも `POST /api/studio/ai`、`effort: "high"`、構造化出力（再帰なし・
すべての object に `additionalProperties:false` と `required`）。

### `op: "insights"`

```jsonc
// 入力
{ op: "insights", brief, context, audience,
  answers: { "<insightSource id>": { q0: "…" } },
  sources: craft.insightSources,
  teachers: [cannesDeconstruction のエントリ] }

// 出力
{ insights: [{ text, source, evidence }] × 5,
  tensions: [{ text }] × 5 }
```

`source` は渡した `sources` の id のどれかに丸める。照合先が無い / 知らない id は空にして返す
（検証できない id を UI に流さない）。

### `op: "ideas"`

```jsonc
// 入力
{ op: "ideas", brief, insight, tension,
  patterns: [ideaPatterns のエントリ],
  teachers: [cannesDeconstruction のエントリ],
  kvGrammar: craft.kvGrammar,
  taglineDirections: craft.taglineDirections }

// 出力
{ ideas: [{ oneLiner, twist, kvConcept, tagline, why, risk,
            patterns: ["<型 id>"], scores: { idea, execution, impact } }] × 6 }
```

`patterns` は渡した型の id だけに絞る。`scores` は 1–5 の整数に丸める。

システムプロンプト（日本語）は次を求める:

- 良いアイデアの 4 条件 — **single-minded / true / new / brave**。1 つでも欠けたら別案にする。
- 既存キャンペーン・ブランド・作品の**再現を提案したら失格**。先生からは構造だけを借りる。
- `kvConcept` は英語 1 文で「画面に何が見えるか」だけ。一般名詞で書き、固有名詞・文字・ロゴを入れない。
- `tagline` は日本語 15 文字以内、英語なら 6 語以内。
- `scores` は自己採点。3 を「実務で通る最低線」とし、全案に 5 を付けない。

---

## 6. 下流への効き方

### `lib/prompt.js`（`compilePrompt`）

企画の結論は**方向ステージが空のときだけ穴を埋める**。上書きはしない。

| ブロック | 規則 |
|---|---|
| 1 成果物と意図 | `brief.oneLiner` が空なら `idea.core.oneLiner` を「The idea in one line:」に使う |
| 2 主題とシーン | `direction.subject` が空で `idea.core.kvConcept` があれば、それを主題文にする（文頭の大文字を小さくして `The image shows …` に続ける。全部大文字の語は触らない） |
| 7 文字の扱い | **タグラインは画像プロンプトに入れない。** `typography.intent === "integrated"` のときだけ、`typography.copy` が空なら `idea.core.tagline` をコピーに使う |

文字は Figma で載せるのが既定（DESIGN.md D5）なので、タグラインが画像に描かれるのは
ユーザーが明示的に「文字を画像に統合」を選んだときだけになる。

### `lib/figmaSpec.js`（`buildSpec`）

- 見出し（`Headline`）= `idea.core.tagline` → `brief.oneLiner` → 案件名
- サブ（`Sub`）= `idea.core.oneLiner` → `brief.promise` → `brief.insight`

### 画面

- `App.jsx` のコンテキストパネルに Idea セクション（`core.oneLiner` + タグライン）。
- `Direction.jsx` の主題欄に「企画から: &lt;kvConcept&gt;」のチップ。押すと主題に足す
  （押さなくても、主題が空ならプロンプト側で自動的に使われる）。

---

## 7. ファイル

| ファイル | 役割 |
|---|---|
| `studio/src/screens/Idea.jsx` | 画面。データの読み込みと AI 呼び出しはここに集約 |
| `studio/src/components/Deconte.jsx` | 先生（受賞作の分解）と型の選択。`JOINED` / `HAS_DECONSTRUCTION` を export |
| `studio/src/components/InsightMiner.jsx` | 探し方の問い → インサイト / 緊張の一覧と採用 |
| `studio/src/components/IdeaBoard.jsx` | アイデアカードの格子（編集・採点・変種・採用） |
| `studio/src/components/IdeaTests.jsx` | 10 問の検査と重み付き点 |
| `studio/src/components/KvConcept.jsx` | 結論（core）の表示と編集、次のステージへの導線 |
| `studio/src/lib/idea.js` | 決定的生成器と採点。データは引数で受け取る |
| `server/lib/ideaOps.js` | `insightsSchema/System`・`ideasSchema/System` |
| `api/studio/ai.js` | op `insights` / `ideas` の振り分けと正規化 |
| `tests/studio/idea.test.mjs` | 生成器（サンプルのブリーフで日本語の出力まで見る） |
| `tests/api/idea.test.mjs` | スキーマ契約（再帰なし・`additionalProperties:false`）と op の振り分け |
