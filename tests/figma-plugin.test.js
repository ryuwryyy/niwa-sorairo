// FigJam プラグイン(figma-plugin/code.js)を、Figma API の偽物の上で動かす。
// 実機の代わりにはならないが、例外なく配置が終わること・元投稿リンクが付くことを確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { toFigJamReport, coordinates, quadrantOf, FEELING_LABELS } from "../research/src/lib/report.js";
import { toFigJamListening } from "../research/src/lib/strategy.js";
import { strategyFixture } from "./fixtures/strategy.js";

const created = {};
const links = [];
let closed = null, uiError = null, handler = null;

const node = (type) => {
  created[type] = (created[type] || 0) + 1;
  const n = {
    type, id: `${type}${created[type]}`, x: 0, y: 0, width: 100, height: 100, children: [],
    resize(w, h) { this.width = w; this.height = h; },
    resizeWithoutConstraints(w, h) { this.width = w; this.height = h; },
    appendChild(c) { this.children.push(c); },
  };
  if (type === "STICKY" || type === "SHAPE_WITH_TEXT") {
    n.text = { characters: "", setRangeHyperlink(s, e, l) { if (!this.characters) throw new Error("empty"); links.push(l.value); } };
  }
  return n;
};

globalThis.__html__ = "";
globalThis.figma = {
  showUI() {},
  viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView() {} },
  currentPage: node("PAGE"),
  loadFontAsync: async () => {},
  createSticky: () => node("STICKY"),
  createSection: () => node("SECTION"),
  createText: () => node("TEXT"),
  createShapeWithText: () => node("SHAPE_WITH_TEXT"),
  createConnector: () => node("CONNECTOR"),
  createRectangle: () => node("RECT"),
  closePlugin: (m) => { closed = m; },
  ui: { set onmessage(f) { handler = f; }, postMessage: (m) => { uiError = m; } },
};

await import("../figma-plugin/code.js");

test("深掘りレポートを配置し、投稿カードに元リンクを付ける", async () => {
  const rows = Array.from({ length: 40 }, (_, i) => {
    const feeling = FEELING_LABELS[i % 10];
    const probs = Object.fromEntries(FEELING_LABELS.map((l) => [l, l === feeling ? 1 : 0]));
    const r = { id: `p${i}`, text: `投稿${i}`, url: `https://x.com/u/status/${i}`, feeling, feelingProbs: probs, intensity: i % 4, tags: ["情報設計"] };
    const coord = coordinates(r);
    return { ...r, coord, quadrant: quadrantOf(coord).id };
  });
  const groups = [{ label: "最高", rows: rows.slice(0, 3), analysis: { summary: "s", emotionArc: { trigger: "a", reaction: "b", afterglow: "c" }, insights: [{ text: "i", evidenceIds: [] }] } }];
  const synthesis = {
    headline: "h", quadrantReading: [], principles: ["p"],
    uxInsights: [{ insight: "u", why: "w", designImplication: "d", evidenceIds: [] }],
    deconte: [{ beat: "起", scene: "s", visual: "v", copyTone: "c", colorLight: "l", typography: "t", motionSound: "m" }],
  };
  await handler({ type: "import", data: toFigJamReport({ theme: "UX", rows, groups, synthesis }), affinity: true, flow: true });
  assert.equal(uiError, null);
  assert.equal(closed, "配置しました");
  assert.equal(links.length, 40 + 3); // 象限マップの全投稿 + グループの引用
});

test("インタビュー整理(kiku/v1)も配置できる", async () => {
  closed = null;
  await handler({
    type: "import", affinity: true, flow: true,
    data: {
      kind: "kiku/v1", title: "t",
      affinity: [{ category: "ペイン", color: "red", items: [{ text: "困った", speaker: "A", importance: 2 }] }],
      flow: { stages: [{ name: "導入", steps: [{ id: "s1", text: "登録" }, { id: "s2", text: "設定" }], pains: ["大変"] }], edges: [["s1", "s2"]] },
    },
  });
  assert.equal(uiError, null);
  assert.equal(closed, "配置しました");
});

test("深掘りレポートに戦略シート(ペルソナ〜ブリーフ)も配置する", async () => {
  closed = null; uiError = null;
  const before = created.SECTION || 0;
  const rows = [{ id: "p1", text: "t", url: null, feeling: "最高", tags: [], coord: { x: 0.5, y: 0.5 }, quadrant: "fever" }];
  await handler({ type: "import", data: toFigJamReport({ theme: "UX", rows, groups: [], synthesis: null, strategy: strategyFixture() }) });
  assert.equal(uiError, null);
  assert.equal(closed, "配置しました");
  // 象限マップ + コアアイデア・ペルソナ・感情マップ・課題仮説インサイト・解決策・トンマナとブリーフ
  assert.equal((created.SECTION || 0) - before, 1 + 6);
});

test("ソーシャルリスニング(kiku/listening-v1)を話題ごとに配置し、元リンクを付ける", async () => {
  closed = null; uiError = null;
  const linksBefore = links.length;
  const rows = ["使いやすさ", "料金", "使いやすさ"].map((topic, i) => ({
    id: `p${i}`, text: `投稿${i}`, url: `https://x.com/u/status/${i}`, relevant: 0.9, topic, sentiment: i ? "ネガティブ" : "ポジティブ", intent: "不満", severity: 2,
  }));
  const data = toFigJamListening({ title: "t", rows, topics: { "使いやすさ": "", "料金": "", "その他": "" }, strategy: strategyFixture() });
  assert.deepEqual(data.topics.map((t) => [t.topic, t.items.length]), [["使いやすさ", 2], ["料金", 1]]);
  await handler({ type: "import", data });
  assert.equal(uiError, null);
  assert.equal(closed, "配置しました");
  assert.equal(links.length - linksBefore, 3);
});
