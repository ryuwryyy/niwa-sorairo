/**
 * 企画（Idea）ステージの決定的生成器 — AI キーが 1 つも無くても「型から」案が出る。
 *
 * 方針:
 * - Math.random() / Date.now() を使わない。同じ入力 → 同じ出力（テストできる）。
 * - データ（ideaPatterns.json / cannesDeconstruction.json / craft.json）は **引数**で受け取る。
 *   ここで import しないので、データが未着でもテストとビルドが壊れない。
 * - 出力は「下書き」。日本語として読める形に整えるところまでが責務で、磨くのは人と AI。
 *
 * 流れ: ブリーフ + ワーク回答 → mineInsights（インサイト5・緊張5）
 *       → 採用した1本 + 型 → generateIdeas（コアアイデア6）
 *       → variantIdea（反転 / 極端化 / 媒体 / 主語）で揺らす
 */

/* ---------- 文字列ユーティリティ ---------- */

export const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * 日本語を N 文字以内に切る。語の途中で切れると読めなくなるので、
 * N の手前にある句読点まで戻れるなら戻る。末尾の句読点と括弧の包みは落とす。
 */
export function clip(s, n = 28) {
  let t = clean(s);
  if (/^[「『（(][^「『（()）』」]*[」』）)]$/.test(t)) t = t.slice(1, -1);
  if (t.length <= n) return t.replace(/[。、．，,.\s]+$/, "");
  const head = t.slice(0, n);
  const cut = Math.max(...["、", "。", "，", "．", "・", " ", "——"].map((c) => head.lastIndexOf(c)));
  const out = cut >= Math.floor(n * 0.5) ? head.slice(0, cut) : head;
  return out.replace(/[。、．，,.\s]+$/, "");
}

/** 「〜は」「〜が」の主語として置ける形にする（末尾の助詞を落とす） */
export function subjectPhrase(s, n = 20) {
  return clip(s, n).replace(/[のはがをにでとへやもより、]+$/, "") || clip(s, n);
}

const stripPeriod = (s) => clean(s).replace(/[.\s]+$/, "");
// 文頭の大文字だけを小さくする（NASA のような全部大文字の語は触らない）
const lowerFirst = (s) => (/^[A-Z][^A-Z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** EN の 1 文に整える（先頭大文字・末尾ピリオド） */
export function enSentence(s) {
  const t = stripPeriod(s);
  return t ? `${upperFirst(t)}.` : "";
}

const firstOf = (v) => {
  if (Array.isArray(v)) return clean(v.find(Boolean));
  return clean(v);
};

/* ---------- 断片プール ---------- */

const SPLIT = /[、。，．,.\n\r\t／/・｜|「」『』（）()]+/;

// 句読点で割ると、前後にかかる語が端に残る。そのままだと文にしたとき宙に浮くので落とす。
const LEAD_NOISE = /^(という|そして|しかし|また|ただ|だから|つまり|なので|けれど|でも)/;
const TAIL_NOISE = /(ではなく|ではなくて|であり|けれども|けれど|しかし|なのに|のに|そして|または|ため|ので)$/;
// 末尾の助詞は落とす。ただし「湯を注いで」の「で」のような動詞の活用語尾を切らないよう、
// 直前が漢字・カタカナ（= 名詞の末尾）のときだけにする。
const TAIL_PARTICLE = /[一-鿿゠-ヿ][をにへとでのがはもや]$/;

/** 断片の端に残った接続語・助詞・句読点を落として、文に差し込める形にする */
export function trimEdges(s, min = 3) {
  let t = clean(s).replace(/^[〜~\-–—。、,.]+/, "").replace(/[〜~\-–—]+$/, "");
  const shorten = (next) => { if (next.length >= min) t = next; };
  shorten(t.replace(/[。、．，,.]+$/, ""));
  shorten(t.replace(LEAD_NOISE, ""));
  shorten(t.replace(TAIL_NOISE, ""));
  shorten(TAIL_PARTICLE.test(t) ? t.slice(0, -1) : t);
  return t.replace(/[。、．，,.]+$/, "");
}

/** 文の中に差し込むときの引用。中に「」があれば『』にして入れ子を避ける */
export function quote(s) {
  const t = clean(s);
  return /[「」]/.test(t) ? `『${t}』` : `「${t}」`;
}

/**
 * 文章（と入れ子のオブジェクト・配列）を、テンプレートに差し込める短い断片に割る。
 * @param {Array<any>} sources 文字列 / 配列 / オブジェクトの何でも
 * @returns {string[]} 重複を除いた断片
 */
export function fragments(sources = [], { min = 3, max = 34 } = {}) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    let t = trimEdges(raw, min);
    if (t.length > max) t = trimEdges(clip(t, max), min);
    if (t.length < min) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  const walk = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") { Object.values(v).forEach(walk); return; }
    for (const part of String(v).split(SPLIT)) push(part);
  };
  sources.forEach(walk);
  return out;
}

// 断片が 1 つも取れないときの受け皿（書き換え前提の言葉にする）
const FALLBACK_FRAGMENTS = [
  "言い出しにくい気持ち",
  "面倒だという感覚",
  "失敗したくない不安",
  "時間がないという言い訳",
  "誰にも見られていない安心",
];

/* ---------- テンプレート差し込み ---------- */

// {A} ｛A｝ <A> [A] ◯◯ ＿＿ 〜 のいずれも「空欄」とみなす
const PLACEHOLDER = /[{｛][^}｝]*[}｝]|<[^<>]+>|\[[^[\]]+\]|[◯○〇]{1,2}|[＿_]{2,}|〜+/g;

/**
 * テンプレートの空欄を断片で順に埋める。空欄が無いテンプレートはそのまま返す。
 * @param {string} template 「{A}なのに{B}」「〜したいのに、〜できない」など
 * @param {string[]} frags
 * @param {number} offset 何番目の断片から使うか（案ごとにずらして重複を避ける）
 */
export function fillTemplate(template, frags = [], offset = 0) {
  const t = clean(template);
  if (!t) return "";
  const pool = frags.length ? frags : FALLBACK_FRAGMENTS;
  let i = Math.max(0, Math.trunc(offset));
  return t.replace(PLACEHOLDER, () => {
    const v = pool[i % pool.length];
    i += 1;
    return v || "◯◯";
  });
}

/* ---------- id ---------- */

function idMaker(makeId, prefix) {
  let n = 0;
  return () => {
    n += 1;
    return typeof makeId === "function" ? String(makeId(n - 1)) : `${prefix}-${n}`;
  };
}

/* ---------- インサイトと緊張 ---------- */

/**
 * インサイトの型。差し込んだ断片は必ず「」で囲む。
 * 断片は名詞句のときも述語のときもあるので、囲まないと接続が壊れる。
 * 囲ってあれば「ここは差し込んだ生の言葉だ」と読めて、直す場所がすぐ分かる。
 */
const INSIGHT_FORMS = [
  ({ a, f }) => `${a}は「${f()}」と言う。けれど本当に効いているのは「${f()}」のほうだ。`,
  ({ a, f }) => `${a}が避けているのは「${f()}」ではなく、「${f()}」のほうだ。`,
  ({ a, f }) => `${a}にとって「${f()}」は、もう「${f()}」ではなく「${f()}」になっている。`,
  ({ a, p, f }) => `${a}が欲しいのは「${f()}」ではない。「${p}」だ。`,
  ({ a, f }) => `${a}が動かないのは知らないからではなく、「${f()}」からだ。`,
];

/**
 * 型（templateJa）が活用形の語幹を要求するかどうか。
 * 例: 「人は{X}したいのに」は {X} に動詞の語幹が要る。手元の断片は名詞句・述語なので、
 * こういう型に流し込むと文が壊れる。そのときは安全な枠（A。なのに、B。）に落とす。
 */
export function needsVerbStem(template) {
  return /[}｝＞>\]](したい|してしまう|できない|たい|する|して|のは)/.test(String(template || ""));
}

/** craft.json の tensionPairs が未着のときに使う「〜なのに〜」の型 */
export const DEFAULT_TENSION_PAIRS = [
  { id: "want-cant", ja: "したいのに、できない", templateJa: "{A}したいのに、{B}。" },
  { id: "know-dont", ja: "知っているのに、変わらない", templateJa: "{A}と分かっているのに、{B}。" },
  { id: "seen-real", ja: "見え方と、本当のところ", templateJa: "まわりには{A}に見えて、本当は{B}。" },
  { id: "love-fear", ja: "好きなのに、こわい", templateJa: "{A}を求めながら、{B}を恐れている。" },
  { id: "have-empty", ja: "あるのに、足りない", templateJa: "{A}はもうあるのに、{B}だけが足りない。" },
];

/**
 * インサイト 5 本と緊張 5 本を、ブリーフ + ワーク回答から決定的に組み立てる。
 *
 * @param {object} o
 * @param {object} o.brief     consult.brief
 * @param {object} o.answers   { [insightSourceId]: { [key]: string } }（consult.frames の "insight_<id>" を集めたもの）
 * @param {Array}  o.sources   craft.insightSources
 * @param {Array}  o.tensionPairs craft.tensionPairs
 * @param {Function=} o.makeId (i) => string
 * @returns {{ insights: Array, tensions: Array }}
 */
export function mineInsights({ brief = {}, answers = {}, sources = [], tensionPairs = [], makeId } = {}) {
  const pool = [
    ...fragments([answers]),
    ...fragments([brief.insight, brief.problem, brief.oneLiner, brief.promise, brief.audience]),
  ];
  const frags = pool.length ? pool : FALLBACK_FRAGMENTS;
  const a = subjectPhrase(brief.audience || "対象の人", 20);
  const p = clip(brief.promise || "その先の状態", 20);

  const nextInsightId = idMaker(makeId, "insight");
  const nextTensionId = idMaker(makeId, "tension");

  const insights = INSIGHT_FORMS.map((form, i) => {
    // 案ごとに使い始める断片をずらして、5 本が同じ言葉で埋まらないようにする
    let cursor = i * 2;
    const f = () => frags[cursor++ % frags.length];
    const src = sources.length ? sources[i % sources.length] : null;
    const own = fragments([answers?.[src?.id], answers?.[`insight_${src?.id}`]]);
    return {
      id: nextInsightId(),
      text: form({ a, p, f }),
      source: src?.id || "",
      evidence: own.length ? own.slice(0, 3).join(" / ") : `${src?.ja || "観察"}：見聞きした事実をここに書く`,
      chosen: false,
    };
  });

  const pairs = tensionPairs.length ? tensionPairs : DEFAULT_TENSION_PAIRS;
  const tensions = Array.from({ length: 5 }, (_, i) => {
    const pair = pairs[i % pairs.length];
    const offset = i * 2 + 1;
    const tpl = pair?.templateJa || "";
    // 活用形が要る型は使わず、名詞句でも壊れない「〜。なのに、〜。」に落とす
    const safe = `${frags[offset % frags.length]}。なのに、${frags[(offset + 1) % frags.length]}。`;
    const filled = tpl && !needsVerbStem(tpl) ? clean(fillTemplate(tpl, frags, offset)) : "";
    return {
      id: nextTensionId(),
      text: filled ? (/[。！？.!?]$/.test(filled) ? filled : `${filled}。`) : safe,
      pair: pair?.id || "",
      chosen: false,
    };
  });

  return { insights, tensions };
}

/* ---------- コアアイデア ---------- */

// 助詞が直に続くところは「」で囲む（差し込むのが名詞句とは限らないため）
const IDEA_FORMS = [
  ({ t, pat }) => `${t}——この矛盾を、${pat}で解く。`,
  ({ ins, pat }) => `${pat}の型で、${quote(ins)}という本音に一枚で応える。`,
  ({ a, p, pat }) => `${a}に${quote(p)}を、${pat}で手渡す。`,
  ({ t, pat }) => `${quote(t)}を隠さず、そのまま画にする。${pat}。`,
  ({ ins, pat }) => `${quote(ins)}。それを一つのモノに託し、${pat}で見せる。`,
  ({ p, pat }) => `${quote(p)}——${pat}で、説明せずに伝える。`,
];

const DEFAULT_TAGLINES = [
  "{A}だけでいい。",
  "ただ、{A}。",
  "{A}のための、{B}。",
  "{A}は、待っている。",
  "{A}から、はじめる。",
  "{A}、それだけ。",
];

const DEFAULT_RISKS = [
  "説明を足したくなる。足した瞬間に強度が落ちる。",
  "型が目的になり、ブリーフの約束から離れる危険がある。",
  "1 秒で読めるか。読めないなら、まだアイデアではない。",
  "既視感の検査をしていない。似た表現が無いか必ず確かめる。",
  "美しいだけで、何も言っていない絵になりやすい。",
  "対象の人の言葉ではなく、作り手の言葉になっていないか。",
];

const DEFAULT_KV_SEED = "a single ordinary object placed alone in a wide, empty field of one color";

/**
 * タグラインの型から、書き手向けの注記を落とす。
 * craft.taglineDirections は「{動詞}。（二語以内の命令形）」「…／…」のように
 * 注記と言い換えを含むので、最初の型だけを残す。
 */
export function taglineTemplate(raw) {
  const first = clean(raw).split(/[／]/)[0];
  return first.replace(/[（(][^（()）]*[)）]/g, "").trim();
}

/** カンマ区切りの英語プロンプト種から、先頭の n 節だけを取る */
export function firstClauses(s, n = 1) {
  return clean(s).split(/,\s*/).filter(Boolean).slice(0, Math.max(1, n)).join(", ");
}

export const TAGLINE_MAX = 15;

/**
 * タグラインを 15 文字以内で作る。
 * craft の型で溢れたら、短い既定の型へ、それでも溢れたら断片そのものへ落とす。
 */
export function makeTagline(template, frags = [], i = 0) {
  const pool = frags.length ? frags : FALLBACK_FRAGMENTS.map((x) => clip(x, 8));
  const tries = [
    template,
    DEFAULT_TAGLINES[i % DEFAULT_TAGLINES.length],
    "{A}。",
  ].filter(Boolean);
  for (const tpl of tries) {
    const out = clean(fillTemplate(tpl, pool, i));
    if (out && out.length <= TAGLINE_MAX) return out;
  }
  return clip(pool[i % pool.length], TAGLINE_MAX);
}

/**
 * コアアイデアを型から 6 案。1 案 = 1 つの型（ideaPatterns）× 緊張 × インサイト。
 *
 * @param {object} o
 * @param {object} o.brief    consult.brief
 * @param {string} o.insight  採用したインサイト本文
 * @param {string} o.tension  採用した緊張本文
 * @param {Array}  o.patterns ideaPatterns のエントリ（採用した型、無ければ全件を渡す）
 * @param {Array}  o.teachers cannesDeconstruction のエントリ（先生）
 * @param {Array}  o.kvGrammar craft.kvGrammar
 * @param {Array}  o.taglineDirections craft.taglineDirections
 * @param {number=} o.count 既定 6
 * @param {Function=} o.makeId
 * @returns {Array} idea[]（store の project.idea.ideas の形）
 */
export function generateIdeas({
  brief = {},
  insight = "",
  tension = "",
  patterns = [],
  teachers = [],
  kvGrammar = [],
  taglineDirections = [],
  count = 6,
  makeId,
} = {}) {
  const pats = patterns.length ? patterns : [{ id: "", ja: "まっすぐ言う", summaryJa: "余計な仕掛けを足さず、約束を一つのモノで言い切る" }];
  const nextId = idMaker(makeId, "idea");

  const a = subjectPhrase(brief.audience || "対象の人", 18);
  const p = clip(brief.promise || brief.oneLiner || "その先の状態", 22);
  const ins = trimEdges(clip(insight || brief.insight || brief.problem || "人の本音", 34));
  const t = trimEdges(clip(tension || brief.problem || "したいのに、できない", 34));
  const normal = brief.promise ? `${clip(brief.promise, 18)}と言葉で説明して終わる` : "商品をきれいに見せて終わる";
  // タグラインは 15 文字以内に収める必要があるので、短い断片だけを使う
  const tagFrags = [
    ...new Set(fragments([brief.promise, brief.oneLiner, brief.insight, insight, tension]).map((x) => clip(x, 8))),
  ].filter((x) => x.length >= 2);

  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    const pat = pats[i % pats.length] || {};
    const patJa = clip(pat.ja || "型", 20);
    const grammar = kvGrammar.length ? kvGrammar[i % kvGrammar.length] : null;
    const tdir = taglineDirections.length ? taglineDirections[i % taglineDirections.length] : null;
    const teacher = teachers.length ? teachers[i % teachers.length] : null;

    // 型の kvSeedEn（1 文）に、KV 文法の最初の一節だけを足す。
    // promptSeedEn は語句の羅列なので、丸ごと足すと「見えるものの一文」でなくなる。
    const seed = clean(pat.kvSeedEn) || DEFAULT_KV_SEED;
    const gseed = firstClauses(grammar?.promptSeedEn, 1);
    const kvConcept = enSentence(gseed ? `${stripPeriod(seed)}, ${lowerFirst(stripPeriod(gseed))}` : seed);

    const tagline = makeTagline(taglineTemplate(tdir?.templateJa), tagFrags, i);

    return {
      id: nextId(),
      oneLiner: IDEA_FORMS[i % IDEA_FORMS.length]({ a, p, t, ins, pat: patJa }),
      twist: `ふつうは${normal}。この案は違う——${clip(pat.summaryJa || pat.whenJa || patJa, 44)}。そこで見る人の予想が一度外れる。`,
      kvConcept,
      tagline,
      why: [
        `${quote(ins)}——この本音にまっすぐ効く。`,
        pat.whenJa ? `${clip(pat.whenJa, 46)}という条件に合う。` : "",
        teacher?.timelessJa ? `先生の学び: ${clip(teacher.timelessJa, 44)}。` : "",
      ].filter(Boolean).join(" "),
      risk: firstOf(pat.risksJa) || DEFAULT_RISKS[i % DEFAULT_RISKS.length],
      patterns: pat.id ? [pat.id] : [],
      scores: null,
      tests: {},
      chosen: false,
      source: "template",
    };
  });
}

/* ---------- 変種（SCAMPER 風） ---------- */

export const VARIANT_KINDS = [
  {
    id: "反転",
    ja: "反転",
    hintJa: "主役と背景を入れ替える",
    jaMove: "主役と背景を入れ替え、いちばん語らせたいものを「余白」の側に置く。",
    en: "with the expected relationship reversed, so what was the background becomes the subject",
    riskJa: "反転が伝わらないと、ただの分かりにくい絵になる。1 秒で読めるか確かめる。",
  },
  {
    id: "極端化",
    ja: "極端化",
    hintJa: "やりすぎまで押す",
    jaMove: "同じ発想を、やりすぎと言われる規模まで押し上げる。",
    en: "pushed to an extreme scale, so one small detail fills the entire frame",
    riskJa: "誇張は一点だけに絞る。二点以上やると、うるさいだけになる。",
  },
  {
    id: "媒体を変える",
    ja: "媒体を変える",
    hintJa: "広告らしくない面に置く",
    jaMove: "同じ発想を、広告らしくない面（日用品・道具・生活の表面）に置き換える。",
    en: "staged on an ordinary everyday surface instead of a studio set",
    riskJa: "置き場所が奇抜なだけで、中身が前と同じになっていないか確かめる。",
  },
  {
    id: "主語を変える",
    ja: "主語を変える",
    hintJa: "語り手を人からモノへ",
    jaMove: "語り手を人からモノへ移し、モノの側から同じ話をさせる。",
    en: "seen from the point of view of the object rather than the person",
    riskJa: "擬人化に寄りすぎると幼く見える。モノの視点は構図で示し、顔は付けない。",
  },
];

/**
 * 既存の案を 1 手だけ動かして別の案にする（決定的）。
 * @param {object} idea もとの案
 * @param {string} kindId VARIANT_KINDS の id
 * @param {object=} o { makeId }
 * @returns {object|null} 新しい案
 */
export function variantIdea(idea, kindId, { makeId } = {}) {
  if (!idea) return null;
  const v = VARIANT_KINDS.find((k) => k.id === kindId) || VARIANT_KINDS[0];
  const base = clip(idea.oneLiner, 60);
  return {
    id: typeof makeId === "function" ? String(makeId(0)) : `${idea.id || "idea"}-${v.id}`,
    oneLiner: `${base}——${v.jaMove}`,
    twist: v.jaMove,
    kvConcept: enSentence(`${stripPeriod(idea.kvConcept) || DEFAULT_KV_SEED}, ${v.en}`),
    tagline: idea.tagline || "",
    why: `${v.ja}の変種。効く理由は元の案のまま、見え方だけを一手ずらす。${clean(idea.why)}`.trim(),
    risk: v.riskJa,
    patterns: [...(idea.patterns || [])],
    scores: null,
    tests: {},
    chosen: false,
    source: `variant:${v.id}`,
    parentId: idea.id || null,
  };
}

/* ---------- 採点 ---------- */

/** craft.cannesLens.criteria が未着のときの既定（Idea / Execution / Impact） */
export const DEFAULT_LENS = [
  { id: "idea", ja: "アイデア", weightPct: 60, questionJa: "一言で言えるか。新しいか。" },
  { id: "execution", ja: "実行", weightPct: 20, questionJa: "その一言が、手触りまで作り込まれているか。" },
  { id: "impact", ja: "効果", weightPct: 20, questionJa: "人・文化・事業のどれかを動かしたか。" },
];

const clamp5 = (v) => Math.max(0, Math.min(5, Number(v) || 0));

/**
 * 3 基準（1–5）を weightPct で重み付けして 100 点に換算する。
 * @param {object} scores { idea, execution, impact }
 * @param {Array=} criteria craft.cannesLens.criteria
 * @returns {number} 0–100 の整数
 */
export function lensTotal(scores, criteria = []) {
  const list = (criteria && criteria.length ? criteria : DEFAULT_LENS).slice(0, 3);
  const fallbackKeys = ["idea", "execution", "impact"];
  const weights = list.map((c) => Number(c?.weightPct) || 0);
  const sumW = weights.reduce((a, b) => a + b, 0) || 100;
  let total = 0;
  list.forEach((c, i) => {
    const key = scores && Object.prototype.hasOwnProperty.call(scores, c?.id) ? c.id : fallbackKeys[i];
    total += (clamp5(scores?.[key]) / 5) * ((weights[i] || 0) / sumW) * 100;
  });
  return Math.round(total);
}

/**
 * 10 問のチェックリストを weight で重み付けして 100 点に換算する。
 * @param {object} tests { [testId]: boolean }
 * @param {Array} ideaTests craft.ideaTests
 * @returns {{ passed: number, count: number, pct: number }}
 */
export function testScore(tests = {}, ideaTests = []) {
  const list = Array.isArray(ideaTests) ? ideaTests : [];
  if (!list.length) return { passed: 0, count: 0, pct: 0 };
  const sumW = list.reduce((a, t) => a + (Number(t?.weight) || 1), 0);
  let got = 0;
  let passed = 0;
  for (const t of list) {
    if (tests?.[t?.id]) {
      got += Number(t?.weight) || 1;
      passed += 1;
    }
  }
  return { passed, count: list.length, pct: Math.round((got / (sumW || 1)) * 100) };
}

/* ---------- 選択と書き戻し ---------- */

/** 配列のうちちょうど 1 本を chosen にする（既に選ばれていればそれを保つ） */
export function ensureOneChosen(list = []) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return arr;
  const i = arr.findIndex((x) => x?.chosen);
  const pick = i >= 0 ? i : 0;
  return arr.map((x, j) => ({ ...x, chosen: j === pick }));
}

export const chosenOf = (list = []) => (Array.isArray(list) ? list.find((x) => x?.chosen) || null : null);

/** 採用した案 → project.idea.core */
export function ideaToCore(idea) {
  return {
    oneLiner: clean(idea?.oneLiner),
    kvConcept: clean(idea?.kvConcept),
    tagline: clean(idea?.tagline),
    rationale: clean(idea?.why),
  };
}

export default {
  mineInsights,
  generateIdeas,
  variantIdea,
  lensTotal,
  testScore,
  ensureOneChosen,
  chosenOf,
  ideaToCore,
  fillTemplate,
  taglineTemplate,
  makeTagline,
  needsVerbStem,
  subjectPhrase,
  trimEdges,
  quote,
  clip,
  enSentence,
  fragments,
  VARIANT_KINDS,
  DEFAULT_LENS,
  DEFAULT_TENSION_PAIRS,
};
