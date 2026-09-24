/**
 * spec.json の検証まわり。
 *
 * - studio-figma-plugin/samples/sample-spec.json が DESIGN.md §4.6 を満たすこと
 * - validate.js と code.js の検証ロジックが 1 バイトも違わないこと
 * - 壊れた spec でちゃんと日本語のエラーが出ること
 * - manifest.json が Figma のマニフェスト仕様どおりであること
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateSpec } from "../../studio-figma-plugin/validate.js";

const root = new URL("../../", import.meta.url);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, root)), "utf8");
const sample = JSON.parse(read("studio-figma-plugin/samples/sample-spec.json"));

/** 深いコピー（テストごとに sample を壊さないため） */
const clone = (v) => JSON.parse(JSON.stringify(v));

test("サンプル spec は §4.6 の契約を満たす", () => {
  const result = validateSpec(sample);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.ok, true);
});

test("サンプル spec の中身（プラグインと Web アプリが合わせる基準）", () => {
  assert.equal(sample.version, 1);
  assert.equal(Object.keys(sample.tokens.color).length, 9);
  for (const key of ["primary", "secondary", "accent", "bg", "surface", "ink", "inkSoft", "line", "onPrimary"]) {
    assert.ok(sample.tokens.color[key], `tokens.color.${key} が無い`);
  }
  for (const key of ["display", "h1", "h2", "h3", "body", "caption"]) {
    assert.equal(typeof sample.tokens.type.scale[key], "number");
  }
  assert.equal(sample.tokens.space.length, 8);
  assert.equal(sample.tokens.radius.length, 5);

  assert.equal(sample.assets.length, 1);
  assert.equal(sample.assets[0].id, "kv");
  assert.match(sample.assets[0].dataUrl, /^data:image\/png;base64,/);

  assert.equal(sample.frames.length, 1);
  assert.equal(sample.frames[0].width, 1920);
  assert.equal(sample.frames[0].height, 1080);

  const names = sample.components.map((c) => c.name);
  assert.deepEqual(names, ["Button", "Tag", "Card", "Hero", "Header"]);
  const button = sample.components[0];
  assert.deepEqual(button.props, { Variant: ["Primary", "Secondary", "Ghost"], Size: ["M", "L"] });
  assert.equal(button.variants.length, 6);
  assert.equal(sample.components.reduce((n, c) => n + c.variants.length, 0), 14);
});

test("KV フレームの見出し・サブ・ブランドが上 1/3 に置かれる", () => {
  const canvas = sample.frames[0].children[0];
  const zone = canvas.children[0];
  assert.equal(canvas.layout.mode, "vertical");
  assert.equal(canvas.layout.align, "start"); // 上詰め = 上 1/3 に入る
  assert.deepEqual(canvas.fill, { asset: "kv", scale: "fill" });
  assert.deepEqual(zone.children.map((n) => n.name), ["Headline", "Sub", "Brand"]);
  assert.deepEqual(zone.children.map((n) => n.text.style), ["display", "h3", "caption"]);
  // 見出しゾーンの高さ（padding + 行の高さ）がフレームの 1/3 に収まること
  const lh = sample.tokens.type.lineHeight;
  const height =
    zone.layout.padding[0] +
    zone.layout.padding[2] +
    zone.layout.gap * 2 +
    zone.children.reduce((h, n) => h + sample.tokens.type.scale[n.text.style] * lh, 0);
  assert.ok(height < sample.frames[0].height / 3, `見出しゾーンが高すぎる: ${height}`);
});

test("validate.js と code.js の検証ロジックが同一", () => {
  const BEGIN = "// ===== SORAIRO_VALIDATOR_BEGIN =====";
  const END = "// ===== SORAIRO_VALIDATOR_END =====";
  const extract = (src, label) => {
    const from = src.indexOf(BEGIN);
    const to = src.indexOf(END);
    assert.ok(from >= 0, `${label} に ${BEGIN} が無い`);
    assert.ok(to > from, `${label} に ${END} が無い`);
    return src.slice(from, to + END.length);
  };
  const a = extract(read("studio-figma-plugin/validate.js"), "validate.js");
  const b = extract(read("studio-figma-plugin/code.js"), "code.js");
  assert.equal(a, b, "validate.js と code.js の検証ブロックがずれています（両方に同じ内容を置くこと）");
  assert.ok(a.includes("function validateSpec(spec)"));
});

test("version が 1 でないと落ちる", () => {
  const spec = clone(sample);
  spec.version = 2;
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("version は 1")), r.errors.join(" / "));
});

test("spec がオブジェクトでないと落ちる", () => {
  for (const bad of [null, "spec", 42, [1, 2]]) {
    const r = validateSpec(bad);
    assert.equal(r.ok, false);
  }
  assert.deepEqual(validateSpec(null).errors, ["spec がオブジェクトではありません。"]);
});

test("tokens.color が無い / 壊れていると落ちる", () => {
  const noColor = clone(sample);
  delete noColor.tokens.color;
  assert.ok(validateSpec(noColor).errors.some((e) => e.includes("tokens.color")));

  const badHex = clone(sample);
  badHex.tokens.color.primary = "rgb(1,2,3)";
  assert.ok(validateSpec(badHex).errors.some((e) => e.includes("tokens.color.primary")));

  const empty = clone(sample);
  empty.tokens.color = {};
  assert.ok(validateSpec(empty).errors.some((e) => e.includes("tokens.color が空")));
});

test("space / radius が配列でないと落ちる", () => {
  const spec = clone(sample);
  spec.tokens.space = 16;
  spec.tokens.radius = [];
  const r = validateSpec(spec);
  assert.ok(r.errors.some((e) => e.includes("tokens.space は配列")));
  assert.ok(r.errors.some((e) => e.includes("tokens.radius が空")));
});

test("未定義の $color 参照と存在しない asset を検出する", () => {
  const spec = clone(sample);
  spec.frames[0].children[0].children[0].fill = "$color.nope";
  spec.components[0].variants[0].node.children[0].text.color = "$color.alsoNope";
  spec.frames[0].children[0].fill = { asset: "missing", scale: "fill" };
  const r = validateSpec(spec);
  assert.ok(r.errors.some((e) => e.includes("$color.nope")), r.errors.join(" / "));
  assert.ok(r.errors.some((e) => e.includes("$color.alsoNope")));
  assert.ok(r.errors.some((e) => e.includes('asset "missing"')));
});

test("ノードの型・レイアウト値・サイズ指定を検査する", () => {
  const spec = clone(sample);
  spec.frames[0].children[0].type = "polygon";
  spec.frames[0].children[0].layout.mode = "grid";
  spec.frames[0].children[0].layout.align = "middle";
  spec.frames[0].children[0].size = { wMode: "fixed" };
  const r = validateSpec(spec);
  assert.ok(r.errors.some((e) => e.includes('.type "polygon"')));
  assert.ok(r.errors.some((e) => e.includes('.layout.mode "grid"')));
  assert.ok(r.errors.some((e) => e.includes('.layout.align "middle"')));
  assert.ok(r.errors.some((e) => e.includes("wMode が \"fixed\" なら w が必要")));
});

test("text ノードには text、image ノードには asset が要る", () => {
  const spec = clone(sample);
  delete spec.frames[0].children[0].children[0].children[0].text;
  const r = validateSpec(spec);
  assert.ok(r.errors.some((e) => e.includes('type "text" には text')), r.errors.join(" / "));

  const spec2 = clone(sample);
  const card = spec2.components[2].variants[0].node;
  card.children[0].fill = "$color.secondary";
  assert.ok(validateSpec(spec2).errors.some((e) => e.includes('type "image" には fill')));
});

test("scale に無い text.style を検出する", () => {
  const spec = clone(sample);
  spec.frames[0].children[0].children[0].children[0].text.style = "mega";
  assert.ok(validateSpec(spec).errors.some((e) => e.includes('text.style "mega"')));
});

test("バリアントの props が宣言と合わないと落ちる", () => {
  const undeclared = clone(sample);
  undeclared.components[0].variants[0].props.Variant = "Danger";
  assert.ok(validateSpec(undeclared).errors.some((e) => e.includes('Variant="Danger"')));

  const missing = clone(sample);
  delete missing.components[0].variants[0].props.Size;
  assert.ok(validateSpec(missing).errors.some((e) => e.includes('props に "Size" がありません')));

  const dup = clone(sample);
  dup.components[0].variants[1].props = { Variant: "Primary", Size: "M" };
  assert.ok(validateSpec(dup).errors.some((e) => e.includes("重複")));

  const badName = clone(sample);
  badName.components[0].props["Size=X"] = ["a"];
  assert.ok(validateSpec(badName).errors.some((e) => e.includes("= と , は使えません")));
});

test("組み合わせが足りないバリアントは警告（エラーではない）", () => {
  const spec = clone(sample);
  spec.components[0].variants.pop(); // 6 → 5
  const r = validateSpec(spec);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("組み合わせは 6 通り")), r.warnings.join(" / "));
});

test("frames も components も無いと落ちる", () => {
  const r = validateSpec({ version: 1, tokens: sample.tokens, frames: [], components: [] });
  assert.ok(r.errors.some((e) => e.includes("生成するものがありません")));
});

test("manifest.json が Figma のマニフェスト仕様どおり", () => {
  const manifest = JSON.parse(read("studio-figma-plugin/manifest.json"));
  assert.equal(manifest.name, "Sorairo Studio Importer");
  assert.equal(manifest.id, "sorairo-studio-importer");
  assert.equal(manifest.api, "1.0.0");
  assert.equal(manifest.main, "code.js");
  assert.equal(manifest.ui, "ui.html");
  assert.deepEqual(manifest.editorType, ["figma"]);
  assert.equal(manifest.documentAccess, "dynamic-page");
  assert.deepEqual(manifest.networkAccess, { allowedDomains: ["none"] });
  // main / ui が実在すること
  assert.ok(read("studio-figma-plugin/code.js").length > 0);
  assert.ok(read("studio-figma-plugin/ui.html").includes("pluginMessage"));
});

test("ui.html は外部リソースを読み込まない", () => {
  const html = read("studio-figma-plugin/ui.html");
  assert.equal(/<script[^>]+src=/i.test(html), false, "外部 script を読んでいる");
  assert.equal(/<link[^>]+href=/i.test(html), false, "外部 stylesheet を読んでいる");
  assert.equal(/https?:\/\//.test(html.replace(/xmlns="[^"]*"/g, "")), false, "外部 URL がある");
  assert.ok(html.includes('parent.postMessage({'));
});

test("ui.html の中の JavaScript が構文エラーを起こさない", async () => {
  const { Script } = await import("node:vm");
  const html = read("studio-figma-plugin/ui.html");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Script(scripts[0], { filename: "ui.html" }));
  // UI が扱うメッセージの種類（code.js が送るもの）を網羅していること
  for (const type of ["progress", "error", "done"]) {
    assert.ok(scripts[0].includes(`"${type}"`), `${type} を処理していない`);
  }
  for (const id of ["optVariables", "optStyles", "optComponents", "optFrames", "pageName"]) {
    assert.ok(html.includes(`id="${id}"`), `${id} が無い`);
  }
});
