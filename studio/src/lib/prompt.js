/**
 * 決定的プロンプトコンパイラ（AI 無しでも動く）。
 *
 * ブリーフ + 参照(原理) + 方向(変数) → 叙述文の EN プロンプト + JA 解説 + ブロック配列。
 * Nano Banana（Gemini 2.5 Flash Image）はキーワード羅列より「情景を叙述する」指示に強いので、
 * 各ブロックは短い段落として編む。ブロックは UI で変数に紐づけてハイライトする。
 */
import vars from "../data/directionVars.json" with { type: "json" };

const byId = (list, id) => (list || []).find((x) => x.id === id) || null;
const pick = (list, ids) => (ids || []).map((id) => byId(list, id)).filter(Boolean);
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const joinNatural = (arr) => {
  const a = arr.filter(Boolean);
  if (a.length <= 1) return a.join("");
  return a.slice(0, -1).join(", ") + " and " + a.at(-1);
};

/** スライダー値 → 強度語。中央付近は言及しない */
export function intensity(value) {
  const d = Math.abs((Number(value) || 50) - 50);
  if (d <= 8) return null;
  if (d <= 22) return "slightly";
  if (d <= 38) return "clearly";
  return "strongly";
}

export function axisPhrase(axis, value) {
  const i = intensity(value);
  if (!i) return "";
  return `${i} ${value < 50 ? axis.left : axis.right}`;
}

/** hex → おおまかな色名（プロンプトで色を言葉でも伝える） */
export function colorName(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  if (l < 0.08) return "near-black";
  if (l > 0.94) return "near-white";
  if (s < 0.1) return l < 0.35 ? "charcoal gray" : l < 0.65 ? "mid gray" : "light gray";
  const light = l > 0.72 ? "pale " : l < 0.3 ? "deep " : "";
  const sat = s < 0.3 ? "muted " : "";
  const hue =
    h < 15 ? "red" : h < 40 ? "orange" : h < 65 ? "yellow" : h < 90 ? "yellow-green" :
    h < 150 ? "green" : h < 190 ? "teal" : h < 250 ? "blue" : h < 290 ? "violet" :
    h < 330 ? "magenta" : "red";
  return `${light}${sat}${hue}`.trim();
}

export function suggestAspect(deliverableId) {
  return byId(vars.deliverables, deliverableId)?.aspect || "1:1";
}

/**
 * @param {object} project store.emptyProject() の形
 * @param {object} opts { maxRefImages?: number }
 * @returns {{ en: string, ja: string, blocks: Array<{key,labelJa,en,ja}>, refIds: string[] }}
 */
export function compilePrompt(project, opts = {}) {
  const maxRefImages = opts.maxRefImages ?? 3;
  const { meta, consult, refs, direction: d } = project;
  const brief = consult.brief || {};
  const deliverable = byId(vars.deliverables, meta.deliverable) || vars.deliverables[0];
  const medium = byId(vars.medium, d.medium);
  const composition = byId(vars.composition, d.composition);
  const lighting = byId(vars.lighting, d.lighting);
  const camera = byId(vars.camera, d.camera);
  const techniques = pick(vars.technique, d.technique);
  const textures = pick(vars.texture, d.texture);
  const harmony = byId(vars.harmony, d.palette?.harmony);
  const moods = (d.mood || []).map((id) => byId(vars.moodWords, id) || { id, en: id, ja: id });
  const tones = (brief.tone || []).map((id) => byId(vars.moodWords, id) || { id, en: id, ja: id });
  const axes = vars.axes.map((a) => ({ a, v: d.axes?.[a.id] ?? a.default }));

  const blocks = [];

  // 1. 成果物と意図
  {
    const brand = clean(meta.brand);
    const one = clean(brief.oneLiner);
    const en = `A ${medium ? medium.en + " " : ""}${deliverable.en}${brand ? ` for ${brand}` : ""}.` +
      (one ? ` The idea in one line: ${one}` : "") +
      (brief.promise ? ` It should make the viewer feel: ${clean(brief.promise)}.` : "");
    blocks.push({ key: "deliverable", labelJa: "成果物と意図",
      en, ja: `${deliverable.ja}（${medium?.ja || "媒体未指定"}）。ブリーフの1行と約束を冒頭に置き、画像の目的を先に伝える。` });
  }

  // 2. 主題とシーン
  {
    const subject = clean(d.subject);
    const scene = clean(d.scene);
    const en = subject
      ? `The image shows ${subject}${scene ? `, ${scene}` : "."}${scene && !/[.!?]$/.test(scene) ? "." : ""}`
      : `The subject is left for you to decide from the idea above; choose one concrete, physical thing that embodies it${scene ? `, set in ${scene}.` : "."}`;
    blocks.push({ key: "subject", labelJa: "主題とシーン", en,
      ja: subject ? "主題と舞台。具体的な「モノ」を一つ決めると安定する。" : "主題が未入力。方向ステージで主題を決めると精度が上がる。" });
  }

  // 3. 構図
  {
    const ax = axes.filter(({ a }) => ["minimal_maximal", "quiet_loud"].includes(a.id)).map(({ a, v }) => axisPhrase(a, v)).filter(Boolean);
    const en = `Composition: ${composition ? composition.en : "clear focal hierarchy"}${ax.length ? `; ${ax.join("; ")}` : ""}.`;
    blocks.push({ key: "composition", labelJa: "構図", en,
      ja: `${composition?.ja || "構図未指定"}。「ミニマル↔マキシマル」「静か↔騒がしい」の軸を強度語に変換して添える。` });
  }

  // 4. 光とカメラ
  {
    const parts = [];
    if (lighting) parts.push(`Lighting: ${lighting.en}`);
    if (camera && camera.en) parts.push(`shot with a ${camera.en}`);
    const en = parts.length ? parts.join(", ") + "." : "";
    if (en) blocks.push({ key: "light", labelJa: "光とカメラ", en, ja: `${lighting?.ja || ""}${camera?.en ? ` / ${camera.ja}` : ""}。光源とレンズを明示すると写真的な説得力が出る。` });
  }

  // 5. 媒体・技法・質感
  {
    const ax = axes.filter(({ a }) => ["handmade_digital", "classic_future"].includes(a.id)).map(({ a, v }) => axisPhrase(a, v)).filter(Boolean);
    const parts = [];
    if (techniques.length) parts.push(`Rendered as ${joinNatural(techniques.map((t) => t.en))}`);
    if (textures.length) parts.push(`with visible ${joinNatural(textures.map((t) => t.en))}`);
    if (ax.length) parts.push(ax.join("; "));
    const en = parts.length ? parts.join(", ") + "." : "";
    if (en) blocks.push({ key: "craft", labelJa: "技法と質感", en, ja: `${techniques.map((t) => t.ja).join("・") || "技法未指定"}${textures.length ? ` / 質感: ${textures.map((t) => t.ja).join("・")}` : ""}。仕上げの手触りを決める。` });
  }

  // 6. 配色（60-30-10）
  {
    const colors = (d.palette?.colors || []).filter(Boolean).slice(0, 6);
    const warm = axisPhrase(byId(vars.axes, "warm_cool"), d.axes?.warm_cool ?? 50);
    let en = "";
    if (colors.length >= 3) {
      const [c1, c2, c3, ...rest] = colors;
      en = `Palette: ${colorName(c1)} (${c1}) as the dominant field (about 60%), ${colorName(c2)} (${c2}) as the secondary tone (30%), and ${colorName(c3)} (${c3}) as a small accent (10%)` +
        (rest.length ? `, with ${joinNatural(rest.map((c) => `${colorName(c)} (${c})`))} as supporting notes` : "") +
        `${harmony ? `, in a ${harmony.en} scheme` : ""}${warm ? `; ${warm}` : ""}.`;
    } else if (colors.length) {
      en = `Palette built around ${joinNatural(colors.map((c) => `${colorName(c)} (${c})`))}${harmony ? ` in a ${harmony.en} scheme` : ""}${warm ? `; ${warm}` : ""}.`;
    } else {
      en = `Palette: ${harmony ? `a ${harmony.en} scheme` : "a disciplined, limited palette"}${warm ? `; ${warm}` : ""}; one dominant color, one secondary, one small accent.`;
    }
    blocks.push({ key: "palette", labelJa: "配色", en, ja: "60-30-10（主・副・差し色）で役割を与える。色は hex と色名の両方で伝える。" });
  }

  // 7. 文字の扱い
  {
    const intent = byId(vars.typographyIntent, d.typography?.intent) || vars.typographyIntent[1];
    const zone = byId(vars.zones, d.typography?.zone) || vars.zones[0];
    const copy = clean(d.typography?.copy);
    let en = intent.en.replace("{zone}", zone.en).replace("{copy}", copy || "HEADLINE");
    if (intent.id === "integrated" && !copy) en = vars.typographyIntent[1].en.replace("{zone}", zone.en);
    blocks.push({ key: "typography", labelJa: "文字の扱い", en, ja: `${intent.ja}${intent.id === "headline_zone" ? `（${zone.ja}を空ける）` : ""}。文字は Figma で載せるのが既定。` });
  }

  // 8. ムード
  {
    const words = [...new Map([...tones, ...moods].map((m) => [m.id, m])).values()];
    const ax = axisPhrase(byId(vars.axes, "playful_serious"), d.axes?.playful_serious ?? 50);
    const en = words.length || ax
      ? `Mood: ${joinNatural(words.map((m) => m.en))}${ax ? `${words.length ? "; " : ""}${ax}` : ""}.`
      : "";
    if (en) blocks.push({ key: "mood", labelJa: "ムード", en, ja: `トーン語: ${words.map((m) => m.ja).join("・")}。ブリーフのトーンと方向のムードを統合。` });
  }

  // 9. 参照の使い方
  const refIds = [];
  {
    const board = [...(refs.board || [])].sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const lines = [];
    for (const r of board) {
      const role = byId(vars.roles, r.role) || vars.roles[5];
      const principles = (r.principles || []).map(clean).filter(Boolean);
      if (r.passPixels && refIds.length < maxRefImages && (r.blobKey || r.imageUrl)) {
        refIds.push(r.id);
        lines.push(`Reference image ${refIds.length} guides only the ${role.en}${principles.length ? ` (${principles.join("; ")})` : ""}; do not copy its subject or any text.`);
      } else if (principles.length) {
        lines.push(`For the ${role.en}, follow this principle: ${principles.join("; ")}.`);
      } else if (clean(r.notes)) {
        lines.push(`For the ${role.en}: ${clean(r.notes)}.`);
      }
    }
    if (lines.length) blocks.push({ key: "references", labelJa: "参照の使い方", en: lines.join(" "), ja: `参照は役割ごとに「何だけを見るか」を限定する。画像を渡すもの ${refIds.length} 枚、原理テキストのみ ${lines.length - refIds.length} 件。` });
  }

  // 10. 制約
  {
    const inc = (d.mustInclude || []).map(clean).filter(Boolean);
    const avoid = (d.mustAvoid || []).map(clean).filter(Boolean);
    const parts = [];
    if (inc.length) parts.push(`Must include: ${joinNatural(inc)}.`);
    if (avoid.length) parts.push(`Avoid: ${joinNatural(avoid)}.`);
    parts.push("No logos, brand marks, trademarks, watermarks, captions or signatures. Hands, faces and perspective must be anatomically and geometrically correct. Professional, print-ready finish with clean edges.");
    blocks.push({ key: "constraints", labelJa: "制約", en: parts.join(" "), ja: "必須要素・禁止要素に加え、商標・透かし・破綻を常に禁止する定型文。" });
  }

  const en = blocks.map((b) => b.en).filter(Boolean).join("\n\n");
  const ja = blocks.map((b) => `【${b.labelJa}】${b.ja}`).join("\n");
  return { en, ja, blocks, refIds };
}

/* ---------- ガード ---------- */

const BUILTIN_TERMS = [
  "nike", "adidas", "apple", "coca-cola", "coca cola", "pepsi", "mcdonald", "ikea", "google", "disney", "marvel",
  "pokémon", "pokemon", "ghibli", "pixar", "netflix", "lego", "starbucks", "uniqlo", "muji", "toyota", "sony", "nintendo",
  "louis vuitton", "chanel", "gucci", "hermès", "hermes", "burberry",
];

/**
 * プロンプト内の権利リスク語を検出する。
 * @param {string} text
 * @param {string[]} extraTerms cannes.json のブランド名などを渡す
 * @returns {Array<{ level: "warn"|"block", term: string, message: string }>}
 */
export function guardPrompt(text, extraTerms = []) {
  const t = String(text || "");
  const lower = t.toLowerCase();
  const out = [];
  const seen = new Set();
  const flag = (level, term, message) => {
    const k = `${level}:${term.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ level, term, message });
  };

  for (const term of [...BUILTIN_TERMS, ...extraTerms.map((s) => String(s || "").trim()).filter((s) => s.length >= 3)]) {
    const re = new RegExp(`(^|[^a-z0-9])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(lower)) flag("warn", term, `ブランド/作品名「${term}」が含まれています。特定作品やロゴの再現指示になっていないか確認してください。`);
  }
  const styleOf = /\b(in the style of|inspired by|homage to|parody of)\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/g;
  let m;
  while ((m = styleOf.exec(t))) flag("warn", m[2], `「${m[1]} ${m[2]}」— 実在の作家・作品名を指定する表現は避け、技法や原理の言葉に置き換えてください。`);
  if (/\b(recreate|replicate|reproduce|copy)\b[^.]{0,60}\b(campaign|ad|advert|poster|logo)\b/i.test(t)) {
    flag("block", "recreate", "既存キャンペーン/ロゴの再現を求める文が含まれています。原理の言葉に書き換えてください。");
  }
  return out;
}
