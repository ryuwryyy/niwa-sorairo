// 深掘りレポート: 大量の投稿 → Jevでふるい分け → Claudeでカテゴリー → Jevでタグ
// → 感情語グループ → 4象限 → Claudeで要約・洞察・デコンテ

export const DEFAULT_THEME = "サービスデザイン・デザイン・UX";

export const DEFAULT_KEYWORDS = [
  "サービスデザイン", "デザイン", "UX", "UXデザイン", "UIデザイン", "ユーザー体験",
  "使いやすさ", "デザイン思考", "CX", "ユーザビリティ", "UXリサーチ", "アプリ 使いにくい",
];

/** X の最新検索URL / Instagram のハッシュタグURL / X API(recent search)のクエリ */
export const xSearchUrl = (kw) => `https://x.com/search?q=${encodeURIComponent(`${kw} lang:ja`)}&f=live`;
export const igTagUrl = (kw) => `https://www.instagram.com/explore/tags/${encodeURIComponent(kw.replace(/\s+/g, ""))}/`;
export const xApiQuery = (kws) =>
  `(${kws.map((k) => (/\s/.test(k) ? `"${k}"` : k)).join(" OR ")}) lang:ja -is:retweet -is:reply`;

// ---- 感情語 ----
// 選択肢の名前がそのまま「グループ名」になる。polarity は4象限の横軸に使う
export const FEELINGS = {
  "好き": { polarity: 1, desc: "好き、愛着がある、推している" },
  "いい": { polarity: 1, desc: "いい、良い、悪くない、好印象" },
  "最高": { polarity: 1, desc: "最高、神、完璧、これ以上ない" },
  "感動": { polarity: 1, desc: "感動した、心が動いた、泣けた、しびれた" },
  "やばい(良)": { polarity: 1, desc: "良い意味での「やばい」: すごすぎる、驚くほど良い" },
  "やばい(悪)": { polarity: -1, desc: "悪い意味での「やばい」: まずい、危うい、ひどい" },
  "悪い": { polarity: -1, desc: "悪い、微妙、いまいち、残念" },
  "嫌い": { polarity: -1, desc: "嫌い、苦手、受けつけない" },
  "最悪": { polarity: -1, desc: "最悪、ありえない、二度と使わない" },
  "くそ": { polarity: -1, desc: "くそ、クソ、ゴミ、強い罵倒を伴う怒り" },
  "該当なし": { polarity: 0, desc: "感情がほとんど表れていない、事実や告知だけ" },
};
export const FEELING_LABELS = Object.keys(FEELINGS);

// 本文に実際に出てくる言葉(表記ゆれ込み)。Jevの判定と並べて見せる
const LITERAL = {
  "好き": /好き|すき|スキ/, "いい": /いい|良い|よい|イイ/, "最高": /最高|神/, "感動": /感動/,
  "やばい": /やばい|ヤバい|ヤバイ|やば[すっ]/, "悪い": /悪い|わるい|微妙|いまいち/, "嫌い": /嫌い|きらい|キライ/,
  "最悪": /最悪/, "くそ": /くそ|クソ|糞/, "めっちゃ": /めっちゃ|めちゃ|超|すごく|とても/, "少し": /少し|ちょっと|やや|若干/,
};
export const literalWords = (text) => Object.keys(LITERAL).filter((w) => LITERAL[w].test(text));

export const INTENSITY = [
  "少し・やや(弱い)",
  "ふつう",
  "かなり",
  "めっちゃ・やばいほど強い",
];

// ---- Jevへの問い ----

export function screeningQuestions(theme) {
  return {
    usable: {
      type: "noul",
      instructions: `この投稿は「${theme}」について、具体的な体験・評価・気づき・感情を含み、デザインリサーチの材料として使えるか?`,
      criteria: {
        true: "実際に使った・見た・作った体験、理由のある評価、現場の気づきや悩み",
        false: "宣伝、求人、イベント告知、リンクだけ、ハッシュタグの羅列、無関係な話題",
      },
    },
    depth: {
      type: "score",
      instructions: "この投稿の中身の具体性は?",
      criteria: [
        "中身がない",
        "一言の感想だけ",
        "理由や状況がわかる",
        "具体的な場面と理由があり、設計の示唆に富む",
      ],
    },
    feeling: {
      type: "choice",
      instructions: "投稿者の気持ちに最も近い言葉はどれか?(本文にその単語がなくてもよい)",
      criteria: Object.fromEntries(FEELING_LABELS.map((l) => [l, FEELINGS[l].desc])),
    },
    intensity: {
      type: "score",
      instructions: "その気持ちの強さは?(「少し」から「めっちゃ」まで)",
      criteria: INTENSITY,
    },
  };
}

export const tagQuestion = (categories) => ({
  category: {
    type: "choice",
    instructions: "この投稿が主に語っている論点はどれか?",
    criteria: Object.fromEntries(categories.map((c) => [c.label, c.description || null])),
  },
});

export const postState = (p, theme) => ({ "調査テーマ": theme, "投稿": p.text });

// ---- ふるい分け ----

/** 使える度合い。usable の確率 × 具体性、強い感情を少し優遇 */
export const usefulness = (r) => r.usable * ((r.depth + 1) / 4) + 0.05 * r.intensity;

/**
 * 上位 n 件を選ぶ。1つの感情語が全体を占めないよう、グループあたり n の40%まで
 */
export function selectTop(rows, n) {
  const cap = Math.max(5, Math.ceil(n * 0.4));
  const perGroup = new Map();
  const out = [];
  for (const r of [...rows].filter((r) => r.usable >= 0.5 && r.feeling !== "該当なし").sort((a, b) => usefulness(b) - usefulness(a))) {
    const c = perGroup.get(r.feeling) || 0;
    if (c >= cap) continue;
    perGroup.set(r.feeling, c + 1);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

/** choice の確率から上位タグ(確率0.25以上、最大2つ。最低1つ) */
export function topTags(probabilities) {
  const sorted = Object.entries(probabilities || {}).sort((a, b) => b[1] - a[1]);
  const tags = sorted.filter(([, p], i) => i === 0 || p >= 0.25).slice(0, 2).map(([l]) => l);
  return tags;
}

// ---- 4象限 ----

/** 横軸: 感情語の確率 × 極性の合計(-1..1)、縦軸: 強さ(0..1) */
export function coordinates(r) {
  let x = 0, mass = 0;
  for (const [label, p] of Object.entries(r.feelingProbs || {})) {
    const pol = FEELINGS[label]?.polarity ?? 0;
    if (pol !== 0) { x += p * pol; mass += p; }
  }
  return { x: mass ? x / mass : 0, y: r.intensity / 3 };
}

export const QUADRANTS = [
  { id: "fever", name: "熱狂", hint: "好意 × 強い", test: (c) => c.x >= 0 && c.y >= 0.5 },
  { id: "like", name: "好感", hint: "好意 × 弱い", test: (c) => c.x >= 0 && c.y < 0.5 },
  { id: "friction", name: "違和感", hint: "嫌悪 × 弱い", test: (c) => c.x < 0 && c.y < 0.5 },
  { id: "reject", name: "拒絶", hint: "嫌悪 × 強い", test: (c) => c.x < 0 && c.y >= 0.5 },
];
export const quadrantOf = (c) => QUADRANTS.find((q) => q.test(c));

// ---- 書き出し ----

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function toFigJamReport({ theme, rows, groups, synthesis }) {
  return {
    kind: "kiku/report-v1",
    title: `${theme} — SNSの声`,
    posts: rows.map((r) => ({
      id: r.id, text: clip(r.text, 140), url: r.url || null, feeling: r.feeling, tags: r.tags,
      x: r.coord.x, y: r.coord.y, quadrant: r.quadrant,
    })),
    quadrants: QUADRANTS.map((q) => ({ id: q.id, name: q.name, hint: q.hint, reading: synthesis?.quadrantReading?.find((x) => x.quadrant.includes(q.name))?.reading || "" })),
    groups: groups.map((g) => ({
      label: g.label, count: g.rows.length, summary: g.analysis?.summary || "",
      arc: g.analysis?.emotionArc || null, insights: (g.analysis?.insights || []).map((i) => i.text),
      quotes: g.rows.slice(0, 5).map((r) => ({ text: clip(r.text, 100), url: r.url || null })),
    })),
    synthesis: synthesis || null,
  };
}

export function toMarkdown({ theme, rows, categories, groups, synthesis, stats }) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cite = (ids) => (ids || []).map((id) => byId.get(id)).filter(Boolean)
    .map((r) => (r.url ? `[${r.id}](${r.url})` : r.id)).join(" ");
  const L = [];
  L.push(`# ${theme} — SNSの声の深掘り`, "");
  if (stats) L.push(`収集 ${stats.total}件 → 使える投稿 ${stats.usable}件 → 分析対象 ${rows.length}件`, "");
  if (synthesis) L.push(`> ${synthesis.headline}`, "");
  if (categories?.length) {
    L.push("## カテゴリー", ...categories.map((c) => `- **${c.label}** — ${c.description}(${rows.filter((r) => r.tags?.includes(c.label)).length}件)`), "");
  }
  L.push("## 感情語グループ");
  for (const g of groups) {
    L.push("", `### ${g.label}(${g.rows.length}件)`);
    if (g.analysis) {
      L.push(g.analysis.summary, "", `感情の動き: ${g.analysis.emotionArc.trigger} → ${g.analysis.emotionArc.reaction} → ${g.analysis.emotionArc.afterglow}`, "");
      L.push(...g.analysis.insights.map((i) => `- ${i.text} ${cite(i.evidenceIds)}`));
    }
    L.push("", ...g.rows.slice(0, 5).map((r) => `> ${r.text.replace(/\n/g, " ")}${r.url ? ` — [元の投稿](${r.url})` : ""}`));
  }
  L.push("", "## 4象限");
  for (const q of QUADRANTS) {
    const n = rows.filter((r) => r.quadrant === q.id).length;
    const reading = synthesis?.quadrantReading?.find((x) => x.quadrant.includes(q.name))?.reading;
    L.push(`- **${q.name}**(${q.hint}): ${n}件${reading ? ` — ${reading}` : ""}`);
  }
  if (synthesis) {
    L.push("", "## 一段深いUI/UXの洞察");
    synthesis.uxInsights.forEach((u, i) => L.push("", `### ${i + 1}. ${u.insight}`, `- なぜ: ${u.why}`, `- 設計への示唆: ${u.designImplication}`, `- 根拠: ${cite(u.evidenceIds)}`));
    L.push("", "## デコンテ(アートディレクション)", "", "| ビート | 場面 | 画づくり | 言葉・トーン | 色と光 | 書体 | 動き・音 |", "|---|---|---|---|---|---|---|");
    synthesis.deconte.forEach((d) => L.push(`| ${[d.beat, d.scene, d.visual, d.copyTone, d.colorLight, d.typography, d.motionSound].map((s) => s.replace(/\|/g, "／")).join(" | ")} |`));
    L.push("", "## デザイン原則", ...synthesis.principles.map((p) => `- ${p}`));
  }
  return L.join("\n");
}

/** 貼り付け: 1行(または空行区切り)1投稿。行内の https://… は元リンクとして取り出す */
export function parsePastedPosts(text) {
  const t = String(text).trim();
  if (!t) return [];
  const parts = /\n\s*\n/.test(t) ? t.split(/\n\s*\n+/) : t.split(/\n/);
  return parts.map((p) => {
    const url = (p.match(/https?:\/\/\S+/) || [null])[0];
    return { text: p.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim(), url };
  }).filter((p) => p.text.length >= 4);
}

/** 本文が同じ投稿(リポストやコピペ)をまとめる */
export function dedupe(posts) {
  const seen = new Set();
  return posts.filter((p) => {
    const k = p.text.replace(/\s|[#＃]\S+/g, "").slice(0, 80);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
