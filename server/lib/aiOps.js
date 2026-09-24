/**
 * /api/studio/ai の各 op の「契約」— JSON Schema と日本語システムプロンプト。
 * ハンドラを薄く保つため、ここに分離してある（DESIGN.md 4.5 / 4.6 / 8 が仕様）。
 *
 * 構造化出力の制約: 再帰スキーマは使えない。すべての object に
 * additionalProperties:false と required を付ける。
 */

const S = { type: "string" };
const strArr = (min, max) => ({ type: "array", minItems: min, maxItems: max, items: S });
const obj = (props, required) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties: props,
});

/* ---------------- brief ---------------- */

// 再帰不可なので 3 階層を明示的に展開する。3 階層目の children は常に空配列。
const node3 = obj({ id: S, text: S, children: { type: "array", items: S, maxItems: 0 } }, ["id", "text", "children"]);
const node2 = obj({ id: S, text: S, children: { type: "array", items: node3 } }, ["id", "text", "children"]);
const node1 = obj({ id: S, text: S, children: { type: "array", items: node2 } }, ["id", "text", "children"]);

export const briefSchema = obj(
  {
    issueTree: { type: "array", minItems: 2, maxItems: 6, items: node1 },
    hypotheses: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: obj(
        {
          id: S,
          text: S,
          evidence: S,
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          chosen: { type: "boolean" },
        },
        ["id", "text", "evidence", "confidence", "chosen"],
      ),
    },
    hmw: strArr(3, 5),
    brief: obj(
      {
        problem: S,
        insight: S,
        audience: S,
        promise: S,
        tone: strArr(3, 5),
        oneLiner: S,
        lighthouse: S,
        successCriteria: strArr(2, 5),
      },
      ["problem", "insight", "audience", "promise", "tone", "oneLiner", "lighthouse", "successCriteria"],
    ),
  },
  ["issueTree", "hypotheses", "hmw", "brief"],
);

export const briefSystem = `あなたは戦略コンサルタント兼クリエイティブディレクターです。曖昧な依頼を、1画面で読める課題定義に変換してください。

作法:
- Issue Tree は MECE。第1階層は「誰の・何の・なぜ」を分解した2〜5本。深さは最大3階層まで。id は "1" "1a" "1a-1" のような短い文字列。
- 仮説思考: 仮説を3〜5本並べ、必ずちょうど1本だけ chosen:true にする。evidence には「なぜそう考えるか」を依頼文の事実に基づいて1〜2文で書く。confidence は 0-100 の整数。
- How Might We は3〜5本。1文ずつ、主語と動詞をはっきりさせる。
- brief.oneLiner は Get–To–By を日本語1文で:「〜を、〜に、〜によって」。
- brief.tone はトーン語3〜5個。短い単語（例: 静謐、誠実、余白）。
- brief.lighthouse は Art Thinking の灯台の問い。「到達点 B がまだ誰にも分かっていない問い」を疑問文で書く。答えが既に分かっている問いは不可。
- brief.successCriteria は測定可能な基準（数値・期限・観測方法のいずれかを含む）を2〜5本。
- ワークショップ回答（frames）が渡された場合は、その言葉を優先的に拾い、勝手に置き換えない。
- 出力はすべて日本語。前置き・言い訳・マークダウン記法は書かない。`;

/* ---------------- principles ---------------- */

export const principlesSchema = obj(
  {
    principles: strArr(3, 5),
    toneWords: strArr(3, 5),
    palette: { type: "array", minItems: 3, maxItems: 6, items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } },
    summaryJa: S,
  },
  ["principles", "toneWords", "palette", "summaryJa"],
);

export const principlesSystem = `あなたはアートディレクターです。渡された参照画像から「再利用できる原理」だけを言語化します。

厳守:
- principles は英語の平叙文で3〜5本。指定された役割（composition / palette / lighting / texture / typography / mood / subject）に関する技法だけを書く。
- ブランド名・キャンペーン名・作家名・商品名・実在の人物名を一切書かない。画像内の文字を書き写さない。
- 「この画像を再現せよ」ではなく「どうすれば同じ効果が出るか」を書く（例: "Anchor the subject on the lower-right third and leave the upper two-thirds as flat, uninterrupted ground."）。
- toneWords は英語の形容詞・名詞を3〜5語。
- palette は画像から読み取った代表色を #RRGGBB 形式で3〜6個。面積の大きい順に並べる。
- summaryJa は日本語1〜2文で、この参照を何に使えるかを述べる。`;

/* ---------------- prompt ---------------- */

export const promptSchema = obj(
  {
    en: S,
    ja: S,
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: obj({ key: S, labelJa: S, en: S, ja: S }, ["key", "labelJa", "en", "ja"]),
    },
  },
  ["en", "ja", "blocks"],
);

export const promptSystem = `あなたは Gemini (Nano Banana) 系画像モデル向けのプロンプトエンジニアです。決定論的コンパイラが編んだ下書きを受け取り、モデルが解釈しやすい叙述文へ磨きます。

規則（Google 公式ガイド準拠）:
- 単語の羅列にしない。情景を語る文章で書く。[主題]+[動作]+[場所/文脈]+[構図]+[スタイル] を連続した段落に編む。
- カメラ・レンズ・光・素材・仕上げの語を具体的に使う（例: 85mm, f/2.0, three-point softbox, raking light, uncoated cream paper）。
- ネガティブプロンプト構文は存在しない。避けたいことは「それが無い状態の描写」として肯定形で書く（"no cars" ではなく "a completely deserted street at dawn"）。
- ブランド名・商標・実在の作品名・作家名は書かない。
- 文字は typography の intent が integrated のときだけ画像に描かせる。それ以外は「見出しを後から載せるための静かな余白」を指示し、文字を描かせない。
- en は 230 words 以内。下書きの各ブロックの意図をすべて残す。制約文（no logos / trademarks / watermarks 等）はほぼそのまま維持する。
- blocks は入力の compiled.blocks と同じ key を同じ順で返す。labelJa も引き継ぐ。
- ja は「何をどう変えたか・なぜか」を日本語200文字以内で書く。
- 参照の原理テキストは、渡された役割の範囲でだけ本文に溶かし込む。`;

/* ---------------- critique ---------------- */

const score = { type: "integer", minimum: 1, maximum: 5 };

export const critiqueSchema = obj(
  {
    scores: obj(
      { concept: score, composition: score, hierarchy: score, color: score, craft: score, brand: score },
      ["concept", "composition", "hierarchy", "color", "craft", "brand"],
    ),
    total: { type: "integer", minimum: 6, maximum: 30 },
    notes: strArr(3, 6),
    revisions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: obj({ title: S, editInstruction: S, promptPatch: S }, ["title", "editInstruction", "promptPatch"]),
    },
  },
  ["scores", "total", "notes", "revisions"],
);

export const critiqueSystem = `あなたは広告賞の審査員です。生成画像をブリーフと突き合わせ、6基準×5点で採点します（DESIGN.md 8章のルーブリック）。

| 基準 | 問い | 5点の状態 |
| Concept | ブリーフの約束が一目で伝わるか | 1秒で主題と意図が読める |
| Composition | 視線誘導と余白 | 主役・脇役・余白が三層で成立 |
| Hierarchy | 見出しゾーン/情報の順序 | 文字を載せる場所が自然に空いている |
| Color | 60-30-10 と参照配色との整合 | 主・副・差し色が役割を持つ |
| Craft | 破綻（手・文字・パース）の無さ | 拡大しても破綻が無い |
| Brand fit | トーン語との一致 | トーン語3つ全部が感じ取れる |

厳守:
- 各スコアは1〜5の整数。3を「実務で通る最低線」とし、甘く付けない。total は6項目の合計。
- notes は日本語で3〜6本。褒め言葉だけで終わらせず、必ず「どこが・なぜ・何点分足りないか」を書く。
- revisions はちょうど3件。title は日本語の短い見出し。
- editInstruction は英語の命令文（image→image 編集用）。強い動詞で始め、変えるものと「同一に保つもの」を両方明示する。
- promptPatch は英語1文。次回の生成プロンプトに足す／差し替える文。
- 3件は互いに別方向の改善にする（同じ指摘を言い換えない）。`;

/* ---------------- figmaSpec ---------------- */

export const DEFAULT_COLOR_KEYS = [
  "primary",
  "secondary",
  "accent",
  "bg",
  "surface",
  "ink",
  "inkSoft",
  "line",
  "onPrimary",
];

export const DEFAULT_TOKENS = {
  color: {
    primary: "#1F3A5F",
    secondary: "#C9D6DF",
    accent: "#E76F51",
    bg: "#F7F5F0",
    surface: "#FFFFFF",
    ink: "#1B1B1B",
    inkSoft: "#5F5F5F",
    line: "#D9D4C7",
    onPrimary: "#FFFFFF",
  },
  type: {
    family: "Noto Sans JP",
    displayFamily: "Shippori Mincho",
    scale: { display: 56, h1: 40, h2: 28, h3: 20, body: 16, caption: 12 },
    lineHeight: 1.5,
  },
  space: [4, 8, 12, 16, 24, 32, 48, 64],
  radius: [0, 4, 8, 16, 999],
};

export const REQUIRED_COMPONENTS = ["Button", "Tag", "Card", "Hero", "Header"];

export const figmaSpecSystem = `あなたは Figma のデザインシステム設計者です。生成されたキービジュアルと抽出パレットから、プラグインが読み込む spec JSON を作ります。

出力は **JSON のみ**。前置き・説明・コードフェンス（\`\`\`）を一切書かない。最初の文字は { で、最後の文字は } にする。

spec の形（DESIGN.md 4.6 の契約。キー名・値の候補を変えない）:
{
  "version": 1,
  "name": "案件名",
  "tokens": {
    "color": { "primary","secondary","accent","bg","surface","ink","inkSoft","line","onPrimary" は必須。値は #RRGGBB },
    "type": { "family": "Noto Sans JP", "displayFamily": "Shippori Mincho",
              "scale": { "display","h1","h2","h3","body","caption" は px の数値 }, "lineHeight": 1.5 },
    "space": [4,8,12,16,24,32,48,64],
    "radius": [0,4,8,16,999]
  },
  "assets": [ { "id":"kv", "kind":"image", "width":1024, "height":1024 } ],
  "frames": [ { "id","name","width","height","children":[ node ] } ],
  "components": [ { "id","name","props":{ "PropName":["値",…] }, "variants":[ { "props":{…}, "node": node } ] } ]
}
node = { "type": "frame|text|rect|image|ellipse", "name",
  "layout": { "mode":"none|horizontal|vertical", "padding":[上,右,下,左], "gap", "align":"center|start|end|space_between", "counterAlign":"center|start|end" },
  "size": { "w","h","wMode":"fixed|hug|fill","hMode":"fixed|hug|fill" },
  "fill": "#hex" | "$color.primary" | { "asset":"kv", "scale":"fill|fit" },
  "stroke": { "color":"$color.line", "width":1 }, "radius", "opacity",
  "text": { "value","style":"display|h1|h2|h3|body|caption","color":"$color.ink","align":"left|center|right","family":"display|body" },
  "children": [ node ] }

必須コンポーネント（この5つは必ず含める）:
- Button: props { "Variant": ["Primary","Secondary","Ghost"], "Size": ["M","L"] } の全6バリアント。
- Tag: 小さなラベル。角丸大きめ。
- Card: 画像スロット（fill に { "asset":"kv", "scale":"fill" }）+ 見出し + 本文。
- Hero: KV フレーム。見出しゾーンを余白として確保する。
- Header: ロゴ枠 + ナビ + ボタン。

厳守:
- 色は必ず "$color.<key>" 参照で書く。生の #hex をノードの fill に直接書かない（tokens.color の中だけ #hex）。
- text.family は display（見出し・Shippori Mincho）と body（本文・Noto Sans JP）を使い分ける。
- text.value のプレースホルダは日本語で書く（例: 「見出しが入ります」「詳しく見る」「タグ」）。
- Auto Layout を使う（layout.mode を horizontal / vertical にし、padding と gap を tokens.space の値から選ぶ）。
- 下書き spec が渡された場合は、その構造を土台にして配置・トーンだけ調整する。キーを増やさない。`;

const HEX = /^#[0-9a-fA-F]{6}$/;

const pickHex = (v, fallback) => (typeof v === "string" && HEX.test(v) ? v : fallback);

/**
 * モデルが返した spec を最小限だけ検証し、既定値で埋める。
 * @returns {{ ok: boolean, spec: object|null, error?: string }}
 */
export function validateSpec(spec, { name = "Sorairo" } = {}) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return { ok: false, spec: null, error: "spec がオブジェクトではありません" };
  if (!Array.isArray(spec.components) || spec.components.length === 0) {
    return { ok: false, spec: null, error: "components が空です" };
  }

  const srcColor = spec.tokens?.color && typeof spec.tokens.color === "object" ? spec.tokens.color : {};
  const color = {};
  for (const k of DEFAULT_COLOR_KEYS) color[k] = pickHex(srcColor[k], DEFAULT_TOKENS.color[k]);

  const srcType = spec.tokens?.type && typeof spec.tokens.type === "object" ? spec.tokens.type : {};
  const srcScale = srcType.scale && typeof srcType.scale === "object" ? srcType.scale : {};
  const scale = {};
  for (const [k, v] of Object.entries(DEFAULT_TOKENS.type.scale)) {
    scale[k] = Number.isFinite(Number(srcScale[k])) && Number(srcScale[k]) > 0 ? Number(srcScale[k]) : v;
  }

  const nums = (v, fb) => (Array.isArray(v) && v.length && v.every((n) => Number.isFinite(Number(n))) ? v.map(Number) : fb);

  const names = new Set(spec.components.map((c) => String(c?.name || "")));
  const missing = REQUIRED_COMPONENTS.filter((n) => !names.has(n));

  const out = {
    version: 1,
    name: typeof spec.name === "string" && spec.name.trim() ? spec.name.trim() : name,
    tokens: {
      color,
      type: {
        family: typeof srcType.family === "string" && srcType.family ? srcType.family : DEFAULT_TOKENS.type.family,
        displayFamily:
          typeof srcType.displayFamily === "string" && srcType.displayFamily
            ? srcType.displayFamily
            : DEFAULT_TOKENS.type.displayFamily,
        scale,
        lineHeight: Number(srcType.lineHeight) > 0 ? Number(srcType.lineHeight) : DEFAULT_TOKENS.type.lineHeight,
      },
      space: nums(spec.tokens?.space, DEFAULT_TOKENS.space),
      radius: nums(spec.tokens?.radius, DEFAULT_TOKENS.radius),
    },
    assets: Array.isArray(spec.assets) ? spec.assets : [],
    frames: Array.isArray(spec.frames) ? spec.frames : [],
    components: spec.components.filter((c) => c && typeof c === "object" && c.name),
  };

  if (!out.components.length) return { ok: false, spec: null, error: "有効な components がありません" };
  return { ok: true, spec: out, ...(missing.length ? { warning: `不足コンポーネント: ${missing.join(", ")}` } : {}) };
}

export default {
  briefSchema,
  briefSystem,
  principlesSchema,
  principlesSystem,
  promptSchema,
  promptSystem,
  critiqueSchema,
  critiqueSystem,
  figmaSpecSystem,
  validateSpec,
  DEFAULT_TOKENS,
  REQUIRED_COMPONENTS,
};
