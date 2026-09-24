import test from "node:test";
import assert from "node:assert/strict";
import { compilePrompt, guardPrompt, colorName, suggestAspect, intensity, axisPhrase } from "../../studio/src/lib/prompt.js";

/** emptyProject() と同じ形の最小フィクスチャ（store.jsx は JSX なので import できない） */
function fixture(over = {}) {
  const base = {
    id: "p1",
    name: "テスト案件",
    meta: { client: "", brand: "TSUCHIYA TEA", deliverable: "kv", language: "ja" },
    consult: {
      context: "", audience: "", constraints: "", frames: {}, issueTree: [], hypotheses: [], hmw: [],
      brief: {
        problem: "", insight: "", audience: "", promise: "静かな3分間",
        tone: ["serene"], oneLiner: "作法を知らない人を、静かな3分間へ", lighthouse: "", successCriteria: [],
      },
    },
    refs: { board: [], cannesPicks: [], queries: {} },
    direction: {
      axes: { minimal_maximal: 18, warm_cool: 50, quiet_loud: 40, classic_future: 50, handmade_digital: 50, playful_serious: 50 },
      medium: "photo",
      technique: ["film_35"],
      composition: "negative_space",
      lighting: "soft_window",
      camera: "tele_85",
      texture: ["washi"],
      palette: { mode: "manual", colors: [], harmony: "analogous" },
      typography: { intent: "headline_zone", zone: "top", copy: "" },
      subject: "a single stoneware cup of pale green tea",
      scene: "in a quiet old Kyoto machiya",
      mood: ["wabi"],
      mustInclude: [], mustAvoid: [],
      aspect: "16:9", model: "", variants: 2, size: "1K",
    },
    prompt: { versions: [], activeId: null },
    gens: [],
    handoff: { selectedGenId: null, palette: [], tokens: null, spec: null, exportedAt: null },
  };
  return {
    ...base,
    ...over,
    meta: { ...base.meta, ...(over.meta || {}) },
    consult: { ...base.consult, ...(over.consult || {}) },
    refs: { ...base.refs, ...(over.refs || {}) },
    direction: { ...base.direction, ...(over.direction || {}) },
  };
}

const ref = (o) => ({
  id: o.id, source: o.source || "upload", title: "", thumbUrl: "", imageUrl: o.imageUrl ?? "https://example.com/a.jpg",
  pageUrl: "", blobKey: o.blobKey ?? null, width: 0, height: 0, author: "", license: "",
  role: o.role || "composition", weight: o.weight ?? 2, passPixels: o.passPixels ?? true,
  notes: o.notes || "", principles: o.principles || [], toneWords: [], palette: [],
});

test("compilePrompt: 3 色以上で 60-30-10 の文が出る", () => {
  const p = fixture({ direction: { palette: { mode: "manual", colors: ["#E8E3D8", "#6F7A63", "#B85C38"], harmony: "analogous" } } });
  const { en, blocks } = compilePrompt(p);
  assert.match(en, /about 60%/);
  assert.match(en, /30%/);
  assert.match(en, /small accent \(10%\)/);
  assert.match(en, /#E8E3D8/);
  assert.match(en, /analogous scheme/);
  assert.ok(blocks.some((b) => b.key === "palette"));
});

test("compilePrompt: 色が 3 色未満のときは 60-30-10 を書かない", () => {
  const p = fixture({ direction: { palette: { mode: "manual", colors: ["#E8E3D8"], harmony: "analogous" } } });
  const { en } = compilePrompt(p);
  assert.doesNotMatch(en, /about 60%/);
  assert.match(en, /Palette built around/);
});

test("compilePrompt: 見出しゾーンの文が出て、文字を描かせない", () => {
  const { en, blocks } = compilePrompt(fixture());
  assert.match(en, /upper third/);
  assert.match(en, /do not render any text/i);
  assert.ok(blocks.some((b) => b.key === "typography"));
});

test("compilePrompt: 文字ゾーンを下部にすると lower third になる", () => {
  const p = fixture({ direction: { typography: { intent: "headline_zone", zone: "bottom", copy: "" } } });
  assert.match(compilePrompt(p).en, /lower third/);
});

test("compilePrompt: 参照は重み順に並び、maxRefImages で打ち切られる", () => {
  const p = fixture({
    refs: {
      board: [
        ref({ id: "a", weight: 1 }),
        ref({ id: "b", weight: 3 }),
        ref({ id: "c", weight: 2 }),
        ref({ id: "d", weight: 3 }),
      ],
      cannesPicks: [], queries: {},
    },
  });
  const all = compilePrompt(p, { maxRefImages: 4 });
  assert.deepEqual(all.refIds, ["b", "d", "c", "a"]);

  const capped = compilePrompt(p, { maxRefImages: 2 });
  assert.deepEqual(capped.refIds, ["b", "d"]);
  assert.match(capped.en, /Reference image 1 guides only the/);
  assert.match(capped.en, /Reference image 2 guides only the/);
  assert.doesNotMatch(capped.en, /Reference image 3/);
});

test("compilePrompt: passPixels でない参照は原理テキストとして入る", () => {
  const p = fixture({
    refs: {
      board: [ref({ id: "x", passPixels: false, imageUrl: "", role: "palette", principles: ["low-chroma palette"] })],
      cannesPicks: [], queries: {},
    },
  });
  const r = compilePrompt(p);
  assert.deepEqual(r.refIds, []);
  assert.match(r.en, /For the color palette, follow this principle: low-chroma palette\./);
});

test("compilePrompt: 画像データが無い参照は画像として送らない", () => {
  const p = fixture({
    refs: { board: [ref({ id: "y", passPixels: true, imageUrl: "", blobKey: null, principles: ["soft light"] })], cannesPicks: [], queries: {} },
  });
  assert.deepEqual(compilePrompt(p).refIds, []);
});

test("compilePrompt: 制約の定型文が必ず入る", () => {
  const { en } = compilePrompt(fixture({ direction: { mustInclude: ["one cup only"], mustAvoid: ["people"] } }));
  assert.match(en, /Must include: one cup only\./);
  assert.match(en, /Avoid: people\./);
  assert.match(en, /No logos, brand marks, trademarks, watermarks, captions or signatures\./);
});

test("compilePrompt: ブロックは 10 種の key を使い、en を連結したものが本文になる", () => {
  const r = compilePrompt(fixture({ direction: { palette: { mode: "manual", colors: ["#111111", "#222222", "#333333"], harmony: "mono" } } }));
  const keys = r.blocks.map((b) => b.key);
  for (const k of ["deliverable", "subject", "composition", "light", "craft", "palette", "typography", "mood", "constraints"]) {
    assert.ok(keys.includes(k), `block ${k} が無い`);
  }
  assert.equal(r.en, r.blocks.map((b) => b.en).filter(Boolean).join("\n\n"));
  assert.ok(r.ja.includes("【配色】"));
});

/* ---------- 企画（Idea）ステージとの連結 ---------- */

const withIdea = (core, over = {}) => fixture({ ...over, idea: { core: { oneLiner: "", kvConcept: "", tagline: "", rationale: "", ...core } } });

test("compilePrompt: 方向の主題が空なら企画の KV コンセプトを主題にする", () => {
  const p = withIdea(
    { kvConcept: "A single unglazed cup of pale tea seen from directly above." },
    { direction: { subject: "", scene: "" } },
  );
  const { en, blocks } = compilePrompt(p);
  assert.match(en, /The image shows a single unglazed cup of pale tea seen from directly above\./);
  assert.ok(blocks.find((b) => b.key === "subject").ja.includes("企画"));
});

test("compilePrompt: 方向の主題があれば企画の KV コンセプトは使わない", () => {
  const p = withIdea({ kvConcept: "A single unglazed cup of pale tea." });
  const { en } = compilePrompt(p);
  assert.match(en, /The image shows a single stoneware cup of pale green tea/);
  assert.doesNotMatch(en, /unglazed/);
});

test("compilePrompt: 企画の KV コンセプトにもシーンが続く", () => {
  const p = withIdea({ kvConcept: "A worn wooden counter." }, { direction: { subject: "", scene: "in a quiet old Kyoto machiya" } });
  assert.match(compilePrompt(p).en, /The image shows a worn wooden counter, in a quiet old Kyoto machiya\./);
});

test("compilePrompt: ブリーフの1行が空なら企画のコアアイデアを冒頭に置く", () => {
  const p = withIdea({ oneLiner: "待っている 3 分間のほうを主役にする。" }, {
    consult: { brief: { problem: "", insight: "", audience: "", promise: "", tone: [], oneLiner: "", lighthouse: "", successCriteria: [] } },
  });
  assert.match(compilePrompt(p).en, /The idea in one line: 待っている 3 分間のほうを主役にする。/);
});

test("compilePrompt: タグラインは画像プロンプトに入らない（既定の文字方針）", () => {
  for (const intent of ["headline_zone", "none"]) {
    const p = withIdea({ tagline: "待つ。それでいい。" }, { direction: { typography: { intent, zone: "top", copy: "" } } });
    assert.doesNotMatch(compilePrompt(p).en, /待つ。それでいい。/, `${intent} でタグラインが漏れている`);
  }
});

test("compilePrompt: 文字を画像に統合するときだけタグラインがコピーになる", () => {
  const p = withIdea({ tagline: "待つ。それでいい。" }, { direction: { typography: { intent: "integrated", zone: "top", copy: "" } } });
  const { en, blocks } = compilePrompt(p);
  assert.match(en, /Integrate the headline "待つ。それでいい。"/);
  assert.ok(blocks.find((b) => b.key === "typography").ja.includes("企画のタグライン"));

  // 方向ステージで文字を書いていれば、そちらが優先される
  const manual = withIdea({ tagline: "待つ。それでいい。" }, { direction: { typography: { intent: "integrated", zone: "top", copy: "SLOW" } } });
  assert.match(compilePrompt(manual).en, /Integrate the headline "SLOW"/);
  assert.doesNotMatch(compilePrompt(manual).en, /待つ。それでいい。/);
});

test("compilePrompt: idea が無い案件（旧バージョン）でも落ちない", () => {
  const p = fixture();
  delete p.idea;
  assert.ok(compilePrompt(p).en.length > 0);
});

test("guardPrompt: 実在ブランド名を警告する", () => {
  const w = guardPrompt("a photorealistic nike sneaker on concrete");
  assert.ok(w.some((x) => x.level === "warn" && x.term === "nike"));
});

test("guardPrompt: extraTerms（カンヌのブランド名）も検出する", () => {
  const w = guardPrompt("a poster referencing Mercado Livre pitch markings", ["Mercado Livre"]);
  assert.ok(w.some((x) => x.term === "Mercado Livre"));
});

test("guardPrompt: 「in the style of X」を警告する", () => {
  const w = guardPrompt("Render it in the style of Hayao Miyazaki, soft and warm.");
  assert.ok(w.some((x) => x.level === "warn" && /Miyazaki/.test(x.term)));
});

test("guardPrompt: キャンペーンの再現指示は block", () => {
  const w = guardPrompt("Recreate the campaign poster exactly as it was published.");
  assert.ok(w.some((x) => x.level === "block"));
});

test("guardPrompt: 問題の無い文では何も出ない", () => {
  assert.deepEqual(guardPrompt("A quiet still life of a stoneware cup on worn wood, soft window light."), []);
});

test("colorName / suggestAspect / intensity", () => {
  assert.equal(colorName("#FFFFFF"), "near-white");
  assert.equal(colorName("#000000"), "near-black");
  assert.match(colorName("#B85C38"), /orange|red/);
  assert.equal(colorName("nope"), "");
  assert.equal(suggestAspect("kv"), "16:9");
  assert.equal(suggestAspect("poster"), "2:3");
  assert.equal(suggestAspect("unknown-id"), "1:1");
  assert.equal(intensity(50), null);
  assert.equal(intensity(5), "strongly");
  assert.equal(axisPhrase({ left: "L", right: "R" }, 50), "");
  assert.equal(axisPhrase({ left: "L", right: "R" }, 0), "strongly L");
  assert.equal(axisPhrase({ left: "L", right: "R" }, 100), "strongly R");
});
