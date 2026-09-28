import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSpec, buildTokens, validateSpec, toDtcg, frameSize, typeScale,
  SPACE_PRESETS, RADIUS_PRESETS, FONT_FAMILIES, TYPE_RATIOS,
} from "../../studio/src/lib/figmaSpec.js";

function project(over = {}) {
  return {
    name: "つちや茶舗 KV",
    meta: { client: "つちや茶舗", brand: "TSUCHIYA TEA", deliverable: "kv", language: "ja" },
    consult: {
      brief: {
        problem: "作法の思い込みで敬遠されている",
        insight: "求めているのは何もしなくていい3分間",
        audience: "京都の生活者",
        promise: "湯を注いで、待つ。",
        oneLiner: "作法を知らない人を、静かな3分間へ",
        tone: ["serene"],
        successCriteria: [],
        lighthouse: "",
      },
    },
    refs: { board: [] },
    direction: { aspect: "16:9", typography: { intent: "headline_zone", zone: "top", copy: "" } },
    handoff: { palette: [] },
    ...over,
  };
}

const TOKENS = buildTokens({
  palette: [
    { hex: "#E8E3D8", share: 0.46 },
    { hex: "#6F7A63", share: 0.21 },
    { hex: "#2B2A26", share: 0.16 },
    { hex: "#B85C38", share: 0.08 },
  ],
});
const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("frameSize: 短辺 1080、長辺は 2560 で頭打ち", () => {
  assert.deepEqual(frameSize("16:9"), { w: 1920, h: 1080 });
  assert.deepEqual(frameSize("4:5"), { w: 1080, h: 1350 });
  assert.deepEqual(frameSize("1:1"), { w: 1080, h: 1080 });
  assert.deepEqual(frameSize("9:16"), { w: 1080, h: 1920 });
  assert.deepEqual(frameSize("21:9"), { w: 2520, h: 1080 });
  assert.deepEqual(frameSize("8:1"), { w: 2560, h: 320 });
  assert.deepEqual(frameSize("unknown"), { w: 1920, h: 1080 });
});

test("typeScale: 6 段が単調増加する", () => {
  const s = typeScale(16, 1.25);
  assert.ok(s.caption < s.body && s.body < s.h3 && s.h3 < s.h2 && s.h2 < s.h1 && s.h1 < s.display);
  assert.equal(s.body, 16);
});

test("buildTokens: color / type / space / radius が揃う", () => {
  assert.ok(TOKENS.color.bg && TOKENS.color.ink && TOKENS.color.onPrimary);
  assert.equal(TOKENS.space.length, SPACE_PRESETS.normal.length);
  assert.equal(TOKENS.radius.length, RADIUS_PRESETS.soft.length);
  assert.ok(FONT_FAMILIES.includes(TOKENS.type.family));
  assert.ok(TYPE_RATIOS.includes(TOKENS.type.ratio));
  assert.deepEqual(buildTokens({ space: "airy" }).space, SPACE_PRESETS.airy);
});

test("buildSpec: version 1 で契約を満たす（画像あり）", () => {
  const spec = buildSpec(project(), { tokens: TOKENS, imageDataUrl: PNG, imageWidth: 1920, imageHeight: 1080 });
  assert.equal(spec.version, 1);
  const v = validateSpec(spec);
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
  assert.equal(spec.assets.length, 1);
  assert.equal(spec.assets[0].id, "kv");
});

test("buildSpec: 画像が無くても契約を満たす", () => {
  const spec = buildSpec(project(), { tokens: TOKENS });
  assert.deepEqual(validateSpec(spec).errors, []);
  assert.deepEqual(spec.assets, []);
  const json = JSON.stringify(spec);
  assert.doesNotMatch(json, /"asset"/, "assets が無いのに asset 参照が残っている");
});

test("buildSpec: tokens を渡さなくても組み立てられる", () => {
  assert.deepEqual(validateSpec(buildSpec(project())).errors, []);
});

test("buildSpec: すべての frame に width / height がある", () => {
  const spec = buildSpec(project(), { tokens: TOKENS, imageDataUrl: PNG });
  assert.ok(spec.frames.length >= 1);
  for (const f of spec.frames) {
    assert.ok(Number.isFinite(f.width) && f.width > 0, `${f.id} の width`);
    assert.ok(Number.isFinite(f.height) && f.height > 0, `${f.id} の height`);
    assert.ok(Array.isArray(f.children) && f.children.length);
  }
  assert.equal(spec.frames[0].width, 1920);
  assert.equal(spec.frames[0].height, 1080);
});

test("buildSpec: 各 component は props とその全組み合わせの variants を持つ", () => {
  const spec = buildSpec(project(), { tokens: TOKENS, imageDataUrl: PNG });
  const ids = spec.components.map((c) => c.id);
  for (const id of ["button", "tag", "card", "hero", "header"]) assert.ok(ids.includes(id), `${id} が無い`);
  for (const c of spec.components) {
    const keys = Object.keys(c.props);
    assert.ok(keys.length > 0, `${c.id} に props が無い`);
    const combos = keys.reduce((n, k) => n * c.props[k].length, 1);
    assert.equal(c.variants.length, combos, `${c.id} の variants 数`);
    for (const v of c.variants) {
      assert.ok(v.node, `${c.id} の variant に node が無い`);
      for (const k of keys) assert.ok(c.props[k].includes(v.props[k]), `${c.id}: ${k}=${v.props[k]}`);
    }
  }
  const button = spec.components.find((c) => c.id === "button");
  assert.equal(button.variants.length, 6);
});

test("buildSpec: $color.* の参照はすべてトークンに存在する", () => {
  const spec = buildSpec(project(), { tokens: TOKENS, imageDataUrl: PNG });
  const refs = JSON.stringify(spec).match(/\$color\.[a-zA-Z]+/g) || [];
  assert.ok(refs.length > 10, "$color 参照が少なすぎる");
  for (const r of new Set(refs)) {
    assert.ok(r.slice(7) in spec.tokens.color, `${r} がトークンに無い`);
  }
});

test("buildSpec: 見出しゾーンの位置が direction.typography.zone に従う", () => {
  const top = buildSpec(project(), { tokens: TOKENS });
  assert.equal(top.frames[0].children[0].layout.align, "start");
  const bottom = buildSpec(project({ direction: { aspect: "16:9", typography: { zone: "bottom" } } }), { tokens: TOKENS });
  assert.equal(bottom.frames[0].children[0].layout.align, "end");
  const left = buildSpec(project({ direction: { aspect: "16:9", typography: { zone: "left" } } }), { tokens: TOKENS });
  assert.equal(left.frames[0].children[0].layout.mode, "horizontal");
});

test("buildSpec: ブリーフの 1 行が見出しに入る", () => {
  const spec = buildSpec(project(), { tokens: TOKENS });
  assert.match(JSON.stringify(spec.frames[0]), /作法を知らない人を、静かな3分間へ/);
});

test("validateSpec: 壊れた spec を検出する", () => {
  const spec = buildSpec(project(), { tokens: TOKENS });
  assert.equal(validateSpec({ ...spec, version: 2 }).ok, false);
  assert.equal(validateSpec({ ...spec, frames: [] }).ok, false);
  assert.equal(validateSpec({ ...spec, components: [] }).ok, false);
  assert.equal(validateSpec(null).ok, false);

  const badRef = JSON.parse(JSON.stringify(spec));
  badRef.components[0].variants[0].node.fill = "$color.nope";
  assert.equal(validateSpec(badRef).ok, false);

  const badVariant = JSON.parse(JSON.stringify(spec));
  badVariant.components[0].variants[0].props.Variant = "Nope";
  assert.equal(validateSpec(badVariant).ok, false);

  const badAsset = JSON.parse(JSON.stringify(spec));
  badAsset.frames[0].children[0].fill = { asset: "missing", scale: "fill" };
  assert.equal(validateSpec(badAsset).ok, false);
});

test("toDtcg: W3C Design Tokens 形式で出る", () => {
  const d = toDtcg(TOKENS, "テスト");
  assert.equal(d.color.primary.$type, "color");
  assert.match(d.color.primary.$value, /^#[0-9A-F]{6}$/i);
  assert.equal(d.fontSize.body.$type, "dimension");
  assert.match(d.fontSize.body.$value, /px$/);
  assert.equal(d.fontFamily.display.$type, "fontFamily");
  assert.equal(d.lineHeight.base.$type, "number");
  assert.equal(Object.keys(d.spacing).length, TOKENS.space.length);
  assert.equal(Object.keys(d.radius).length, TOKENS.radius.length);
});
