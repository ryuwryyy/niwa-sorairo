#!/usr/bin/env node
/**
 * spec.json → Claude Code + Figma MCP（use_figma）用スクリプト生成器
 *
 *   node studio-figma-plugin/mcp/spec-to-use-figma.mjs <spec.json> <outDir> [--check]
 *
 * 出力（この順に use_figma へ 1 本ずつ渡す）:
 *   01-page-variables.js   ページ "Sorairo / <name>" と Variables（color/space/radius）
 *   02-styles.js           Paint Styles / Text Styles
 *   10-frame-<id>.js       版面（画像塗りはプレースホルダ色。imageTargets を返す）
 *   20-component-<id>.js   コンポーネント（バリアント → combineAsVariants → グリッド配置）
 *   assets/<assetId>.png   dataUrl を復号した画像。upload_assets で imageTargets の nodeIds に貼る
 *   README.md              実行手順
 *
 * 各スクリプトは自己完結（共通プレリュードを埋め込む）。use_figma の作法:
 *   - 最上位で await / return できる（async でラップされる）
 *   - figma.createImage は使えない → 画像は upload_assets（nodeIds）で後から貼る
 *   - ページ切替は setCurrentPageAsync のみ、1 スクリプト 1 回
 *   - HUG / FILL は appendChild の後に設定する
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const check = args.includes("--check");
const [specPath, outDir = "studio-figma-plugin/mcp/out"] = args.filter((a) => !a.startsWith("--"));
if (!specPath) {
  console.error("usage: spec-to-use-figma.mjs <spec.json> [outDir] [--check]");
  process.exit(2);
}

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
if (spec.version !== 1 || !spec.tokens?.color) throw new Error("spec の version/tokens が不正です");

const PAGE_NAME = `Sorairo / ${spec.name || "Untitled"}`;
const slug = (s) => String(s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

/* ---------- 使う text style の組み合わせ（style × family）を spec から集める ---------- */
const textCombos = new Set();
const walk = (n) => {
  if (!n) return;
  if (n.type === "text" && n.text) textCombos.add(`${n.text.style || "body"}-${n.text.family || "body"}`);
  (n.children || []).forEach(walk);
};
spec.frames?.forEach((f) => f.children?.forEach(walk));
spec.components?.forEach((c) => c.variants?.forEach((v) => walk(v.node)));

/* ---------- 共通プレリュード（各スクリプトに埋め込む） ---------- */
const PRELUDE = `
const TOKENS = ${JSON.stringify(spec.tokens)};
const PAGE_NAME = ${JSON.stringify(PAGE_NAME)};
const FALLBACK_FAMILY = "Inter";
const fontCache = new Map();
const report = { createdNodeIds: [], imageTargets: [], substitutions: [], warnings: [] };

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return { r: 0.5, g: 0.5, b: 0.5 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
async function ensurePage() {
  let page = figma.root.children.find((p) => p.name === PAGE_NAME);
  if (!page) { page = figma.createPage(); page.name = PAGE_NAME; }
  await figma.setCurrentPageAsync(page);
  return page;
}
async function varMap() { const m = {}; for (const v of await figma.variables.getLocalVariablesAsync()) m[v.name] = v; return m; }
async function textStyleMap() { const m = {}; for (const s of await figma.getLocalTextStylesAsync()) m[s.name] = s; return m; }
function paintFor(fill, vars) {
  if (!fill) return null;
  if (typeof fill === "string" && fill.startsWith("$color.")) {
    const key = fill.slice(7); const hex = TOKENS.color[key];
    if (!hex) { report.warnings.push("unknown token " + fill); return null; }
    const base = { type: "SOLID", color: hexToRgb(hex) };
    const v = vars["color/" + key];
    return v ? figma.variables.setBoundVariableForPaint(base, "color", v) : base;
  }
  if (typeof fill === "string") return { type: "SOLID", color: hexToRgb(fill) };
  return null; // 画像塗りは upload_assets で後から貼る
}
async function loadFont(family, style) {
  const key = family + "/" + style;
  if (fontCache.has(key)) return fontCache.get(key);
  const tries = [{ family, style }, { family, style: style === "Bold" ? "Medium" : "Regular" }, { family, style: "Regular" }, { family: FALLBACK_FAMILY, style: style === "Bold" ? "Bold" : "Regular" }];
  for (const f of tries) {
    try { await figma.loadFontAsync(f); if (f.family !== family || f.style !== style) report.substitutions.push(family + " " + style + " -> " + f.family + " " + f.style); fontCache.set(key, f); return f; } catch (e) { /* next */ }
  }
  throw new Error("フォントを読み込めません: " + key);
}
function familyFor(kind) { return kind === "display" ? (TOKENS.type.displayFamily || TOKENS.type.family) : TOKENS.type.family; }
function weightFor(style) { return ["display", "h1", "h2", "h3"].includes(style) ? "Bold" : "Regular"; }
function bindFloat(node, field, value, kind, vars) {
  const i = (TOKENS[kind] || []).indexOf(value);
  const v = i >= 0 ? vars[kind + "/" + i] : null;
  if (v) { try { node.setBoundVariable(field, v); } catch (e) { report.warnings.push(field + ": " + e.message); } }
}
function applyLayout(frame, layout, vars) {
  if (!layout || layout.mode === "none") return;
  frame.layoutMode = layout.mode === "horizontal" ? "HORIZONTAL" : "VERTICAL";
  const p = layout.padding || [0, 0, 0, 0];
  frame.paddingTop = p[0]; frame.paddingRight = p[1]; frame.paddingBottom = p[2]; frame.paddingLeft = p[3];
  frame.itemSpacing = layout.gap || 0;
  const A = { start: "MIN", center: "CENTER", end: "MAX", space_between: "SPACE_BETWEEN" };
  frame.primaryAxisAlignItems = A[layout.align] || "MIN";
  frame.counterAxisAlignItems = layout.counterAlign === "center" ? "CENTER" : layout.counterAlign === "end" ? "MAX" : "MIN";
  frame.primaryAxisSizingMode = "AUTO"; frame.counterAxisSizingMode = "AUTO";
  bindFloat(frame, "paddingTop", p[0], "space", vars); bindFloat(frame, "paddingRight", p[1], "space", vars);
  bindFloat(frame, "paddingBottom", p[2], "space", vars); bindFloat(frame, "paddingLeft", p[3], "space", vars);
  bindFloat(frame, "itemSpacing", layout.gap || 0, "space", vars);
}
function applyBox(node, spec, vars) {
  if (spec.fill !== undefined && spec.fill !== null) {
    const paint = paintFor(spec.fill, vars);
    if (paint) node.fills = [paint];
    else if (typeof spec.fill === "object" && spec.fill.asset) {
      node.fills = [{ type: "SOLID", color: hexToRgb(TOKENS.color.secondary || "#cccccc") }];
      report.imageTargets.push({ ref: node, assetId: spec.fill.asset, scale: spec.fill.scale || "fill" });
    }
  } else if (node.type !== "TEXT") node.fills = [];
  if (spec.stroke) { const sp = paintFor(spec.stroke.color, vars); if (sp) { node.strokes = [sp]; node.strokeWeight = spec.stroke.width || 1; node.strokeAlign = "INSIDE"; } }
  if (spec.radius != null && "cornerRadius" in node) {
    node.cornerRadius = spec.radius;
    for (const c of ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]) bindFloat(node, c, spec.radius, "radius", vars);
  }
  if (spec.opacity != null) node.opacity = spec.opacity;
  if (spec.name) node.name = spec.name;
}
function applySizing(node, size, parentAuto) {
  const s = size || {};
  const isText = node.type === "TEXT";
  const isAuto = "layoutMode" in node && node.layoutMode !== "NONE";
  if (s.w != null || s.h != null) node.resize(Math.max(1, s.w != null ? s.w : node.width), Math.max(1, s.h != null ? s.h : node.height));
  if (parentAuto) {
    node.layoutSizingHorizontal = s.wMode === "fill" ? "FILL" : (s.wMode === "hug" && (isAuto || isText)) ? "HUG" : "FIXED";
    node.layoutSizingVertical = s.hMode === "fill" ? "FILL" : (s.hMode === "hug" && (isAuto || isText)) ? "HUG" : "FIXED";
  } else if (isAuto) {
    const primaryIsH = node.layoutMode === "HORIZONTAL";
    const wm = s.wMode === "hug" ? "AUTO" : "FIXED", hm = s.hMode === "hug" ? "AUTO" : "FIXED";
    node.primaryAxisSizingMode = primaryIsH ? wm : hm; node.counterAxisSizingMode = primaryIsH ? hm : wm;
  }
  if (isText) node.textAutoResize = s.wMode === "hug" ? "WIDTH_AND_HEIGHT" : "HEIGHT";
}
async function buildText(spec, vars, styles) {
  const t = spec.text || {}; const node = figma.createText();
  const f = await loadFont(familyFor(t.family), weightFor(t.style));
  node.fontName = f; node.characters = String(t.value || "");
  node.fontSize = TOKENS.type.scale[t.style] || TOKENS.type.scale.body || 16;
  node.lineHeight = { value: (TOKENS.type.lineHeight || 1.5) * 100, unit: "PERCENT" };
  node.textAlignHorizontal = t.align === "center" ? "CENTER" : t.align === "right" ? "RIGHT" : "LEFT";
  const paint = paintFor(t.color || "$color.ink", vars); if (paint) node.fills = [paint];
  const st = styles["Sorairo/" + (t.style || "body") + "-" + (t.family || "body")];
  if (st) { try { await node.setTextStyleIdAsync(st.id); } catch (e) { report.warnings.push("textStyle: " + e.message); } }
  node.name = spec.name || "Text";
  return node;
}
async function buildNode(spec, parent, vars, styles) {
  let node;
  if (spec.type === "text") node = await buildText(spec, vars, styles);
  else if (spec.type === "ellipse") { node = figma.createEllipse(); applyBox(node, spec, vars); }
  else if (spec.type === "rect" || spec.type === "image") { node = figma.createRectangle(); applyBox(node, spec, vars); }
  else { node = figma.createFrame(); applyLayout(node, spec.layout, vars); applyBox(node, spec, vars); }
  const parentAuto = !!parent && "layoutMode" in parent && parent.layoutMode !== "NONE";
  if (parent) parent.appendChild(node);
  applySizing(node, spec.size, parentAuto);
  report.createdNodeIds.push(node.id);
  if (spec.children && spec.children.length && "appendChild" in node) for (const c of spec.children) await buildNode(c, node, vars, styles);
  return node;
}
function finish(extra) {
  report.imageTargets = report.imageTargets.map((t) => ({ nodeId: t.ref.id, assetId: t.assetId, scale: t.scale }));
  return Object.assign(report, extra || {});
}
function nextY(page, gap) {
  let bottom = 0; for (const c of page.children) bottom = Math.max(bottom, c.y + c.height);
  return page.children.length ? bottom + (gap == null ? 120 : gap) : 0;
}
`;

/* ---------- 01: ページと Variables ---------- */
const s01 = `${PRELUDE}
const page = await ensurePage();
let col = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === "Sorairo");
if (!col) { col = figma.variables.createVariableCollection("Sorairo"); col.renameMode(col.modes[0].modeId, "Default"); }
const modeId = col.modes[0].modeId;
const existing = await varMap();
let created = 0;
for (const [k, hex] of Object.entries(TOKENS.color)) {
  const name = "color/" + k; let v = existing[name];
  if (!v) { v = figma.variables.createVariable(name, col, "COLOR"); created++; }
  v.scopes = ["ALL_FILLS", "STROKE_COLOR"];
  v.setValueForMode(modeId, Object.assign(hexToRgb(hex), { a: 1 }));
}
(TOKENS.space || []).forEach((n, i) => {
  const name = "space/" + i; let v = existing[name];
  if (!v) { v = figma.variables.createVariable(name, col, "FLOAT"); created++; }
  v.scopes = ["GAP", "WIDTH_HEIGHT"]; v.setValueForMode(modeId, n);
});
(TOKENS.radius || []).forEach((n, i) => {
  const name = "radius/" + i; let v = existing[name];
  if (!v) { v = figma.variables.createVariable(name, col, "FLOAT"); created++; }
  v.scopes = ["CORNER_RADIUS"]; v.setValueForMode(modeId, n);
});
return { pageId: page.id, collectionId: col.id, created, total: col.variableIds.length };
`;

/* ---------- 02: Styles ---------- */
const s02 = `${PRELUDE}
const page = await ensurePage();
const vars = await varMap();
const paints = {}; for (const s of await figma.getLocalPaintStylesAsync()) paints[s.name] = s;
const texts = await textStyleMap();
let createdPaint = 0, createdText = 0;
for (const [k] of Object.entries(TOKENS.color)) {
  const name = "Sorairo/" + k;
  let s = paints[name]; if (!s) { s = figma.createPaintStyle(); s.name = name; createdPaint++; }
  s.paints = [paintFor("$color." + k, vars)];
}
const combos = ${JSON.stringify([...textCombos])};
for (const combo of combos) {
  const [style, family] = combo.split("-");
  const name = "Sorairo/" + combo;
  let s = texts[name]; if (!s) { s = figma.createTextStyle(); s.name = name; createdText++; }
  const f = await loadFont(familyFor(family), weightFor(style));
  s.fontName = f;
  s.fontSize = TOKENS.type.scale[style] || TOKENS.type.scale.body || 16;
  s.lineHeight = { value: (TOKENS.type.lineHeight || 1.5) * 100, unit: "PERCENT" };
  s.description = "Sorairo Studio " + style + " / " + family;
}
return finish({ createdPaint, createdText, combos });
`;

/* ---------- 10: frames ---------- */
const frameScripts = (spec.frames || []).map((f) => {
  const code = `${PRELUDE}
const page = await ensurePage();
const vars = await varMap();
const styles = await textStyleMap();
const FRAME = ${JSON.stringify(f)};
const frame = figma.createFrame();
frame.name = FRAME.name || FRAME.id;
frame.resize(FRAME.width, FRAME.height);
frame.clipsContent = true;
frame.fills = [{ type: "SOLID", color: hexToRgb(TOKENS.color.bg || "#ffffff") }];
frame.x = 0; frame.y = nextY(page);
page.appendChild(frame);
report.createdNodeIds.push(frame.id);
for (const c of FRAME.children || []) await buildNode(c, frame, vars, styles);
return finish({ frameId: frame.id, name: frame.name });
`;
  return { file: `10-frame-${slug(f.id)}.js`, code };
});

/* ---------- 20: components ---------- */
const componentScripts = (spec.components || []).map((c) => {
  const code = `${PRELUDE}
const page = await ensurePage();
const vars = await varMap();
const styles = await textStyleMap();
const COMP = ${JSON.stringify(c)};
const y0 = nextY(page);
const comps = [];
for (const v of COMP.variants) {
  const spec = v.node;
  const comp = figma.createComponent();
  applyLayout(comp, spec.layout, vars);
  applyBox(comp, spec, vars);
  page.appendChild(comp);
  applySizing(comp, spec.size, false);
  for (const ch of spec.children || []) await buildNode(ch, comp, vars, styles);
  comp.name = Object.entries(v.props || {}).map(([k, val]) => k + "=" + val).join(", ");
  comps.push(comp);
  report.createdNodeIds.push(comp.id);
}
const set = figma.combineAsVariants(comps, page);
set.name = COMP.name;
set.description = "Sorairo Studio component. props: " + JSON.stringify(COMP.props || {});
const keys = Object.keys(COMP.props || {});
const cols = keys[0] ? COMP.props[keys[0]] : [""];
const rows = keys[1] ? COMP.props[keys[1]] : [""];
const GAP = 40;
const colW = [], rowH = [];
const place = [];
for (const child of set.children) {
  const props = Object.fromEntries(child.name.split(", ").map((s) => s.split("=")));
  const ci = Math.max(0, cols.indexOf(props[keys[0]]));
  const ri = keys[1] ? Math.max(0, rows.indexOf(props[keys[1]])) : 0;
  colW[ci] = Math.max(colW[ci] || 0, child.width); rowH[ri] = Math.max(rowH[ri] || 0, child.height);
  place.push([child, ci, ri]);
}
const xs = [GAP], ys = [GAP];
for (let i = 1; i < cols.length; i++) xs[i] = xs[i - 1] + (colW[i - 1] || 0) + GAP;
for (let i = 1; i < rows.length; i++) ys[i] = ys[i - 1] + (rowH[i - 1] || 0) + GAP;
for (const [child, ci, ri] of place) { child.x = xs[ci]; child.y = ys[ri]; }
const totalW = xs[cols.length - 1] + (colW[cols.length - 1] || 0) + GAP;
const totalH = ys[rows.length - 1] + (rowH[rows.length - 1] || 0) + GAP;
set.resizeWithoutConstraints(totalW, totalH);
set.x = 0; set.y = y0;
report.createdNodeIds.push(set.id);
return finish({ componentSetId: set.id, name: set.name, variants: set.children.length });
`;
  return { file: `20-component-${slug(c.id)}.js`, code };
});

/* ---------- 書き出し ---------- */
fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });
const files = [
  { file: "01-page-variables.js", code: s01 },
  { file: "02-styles.js", code: s02 },
  ...frameScripts,
  ...componentScripts,
];
for (const f of files) fs.writeFileSync(path.join(outDir, f.file), f.code.trimStart());

const assets = [];
for (const a of spec.assets || []) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(a.dataUrl || "");
  if (!m) continue;
  const ext = m[1] === "image/jpeg" ? "jpg" : m[1] === "image/webp" ? "webp" : "png";
  const file = path.join(outDir, "assets", `${slug(a.id)}.${ext}`);
  fs.writeFileSync(file, Buffer.from(m[2], "base64"));
  assets.push({ id: a.id, mime: m[1], file, width: a.width, height: a.height });
}
fs.writeFileSync(path.join(outDir, "assets.json"), JSON.stringify(assets, null, 2));

fs.writeFileSync(path.join(outDir, "README.md"), `# use_figma スクリプト（${PAGE_NAME}）

生成元: ${path.basename(specPath)} / ${new Date().toISOString()}

1. \`figma-use\` スキルを読んでから、以下を **この順に 1 本ずつ** \`use_figma\` に渡す（fileKey は対象ファイル）。
${files.map((f) => `   - \`${f.file}\``).join("\n")}
2. 版面・コンポーネントのスクリプトは \`imageTargets: [{ nodeId, assetId, scale }]\` を返す。
   \`assets/<assetId>.*\` を \`upload_assets\`（\`nodeIds\` に nodeId、\`scaleMode\` に FILL/FIT）で貼る。
3. \`get_metadata\` / \`get_screenshot\` で確認する（docs/studio/figma-flow.md §3-3）。

各スクリプトは自己完結で、Variables / Styles は名前で再利用する（2 回流しても壊れない）。
`);

if (check) {
  // use_figma は async 関数でラップするので、同じ形で構文検査する
  for (const f of files) {
    try { new Function("figma", `return (async () => {\n${f.code}\n})()`); }
    catch (e) { console.error(`${f.file}: ${e.message}`); process.exitCode = 1; }
  }
}
console.log(`wrote ${files.length} scripts + ${assets.length} assets to ${outDir}`);
