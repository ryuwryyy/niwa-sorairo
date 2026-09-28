import test from "node:test";
import assert from "node:assert/strict";
import {
  assignRoles, COLOR_ROLES, contrastRatio, luminance, mix, rgbToHex, hexToRgb,
  kmeans, extractPalette, readableOn, setRole, pixelsFromRgba, rgbToHsl,
} from "../../studio/src/lib/palette.js";

const FIXTURE = [
  { hex: "#E8E3D8", share: 0.46 },   // 生成り（面積最大・明るい）
  { hex: "#6F7A63", share: 0.21 },   // 苔色
  { hex: "#2B2A26", share: 0.16 },   // 墨
  { hex: "#B85C38", share: 0.08 },   // 熾（小面積・鮮やか）
  { hex: "#C9C2B2", share: 0.06 },
  { hex: "#8FA3B8", share: 0.03 },
];

test("assignRoles: 9 つの役割がすべて hex で返る", () => {
  const c = assignRoles(FIXTURE);
  for (const k of COLOR_ROLES) {
    assert.ok(k in c, `${k} が無い`);
    assert.match(c[k], /^#[0-9A-F]{6}$/i, `${k} が hex ではない: ${c[k]}`);
  }
});

test("assignRoles: 文字と背景のコントラストが AA(4.5) を満たす", () => {
  const c = assignRoles(FIXTURE);
  assert.ok(contrastRatio(c.ink, c.bg) >= 4.5, `ink/bg = ${contrastRatio(c.ink, c.bg).toFixed(2)}`);
});

test("assignRoles: 極端な配色でも AA を満たすよう補正される", () => {
  for (const pal of [
    [{ hex: "#101010", share: 0.9 }, { hex: "#181818", share: 0.1 }],       // 全部暗い
    [{ hex: "#FDFDFD", share: 0.8 }, { hex: "#F5F5F5", share: 0.2 }],       // 全部明るい
    [{ hex: "#808080", share: 1 }],                                          // 単色グレー
  ]) {
    const c = assignRoles(pal);
    assert.ok(contrastRatio(c.ink, c.bg) >= 4.5, `ink/bg = ${contrastRatio(c.ink, c.bg).toFixed(2)} for ${JSON.stringify(pal)}`);
  }
});

test("assignRoles: onPrimary は primary の上で読める", () => {
  const c = assignRoles(FIXTURE);
  assert.ok(contrastRatio(c.onPrimary, c.primary) >= 4.5);
  assert.ok(["#FFFFFF", "#111111"].includes(c.onPrimary));
});

test("assignRoles: 空配列でも既定のトークンを返す", () => {
  const c = assignRoles([]);
  for (const k of COLOR_ROLES) assert.match(c[k], /^#[0-9A-F]{6}$/i);
  assert.ok(contrastRatio(c.ink, c.bg) >= 4.5);
});

test("assignRoles: 文字列配列も受け付ける", () => {
  const c = assignRoles(["#E8E3D8", "#2B2A26", "#B85C38"]);
  assert.match(c.bg, /^#[0-9A-F]{6}$/i);
});

test("setRole: primary を変えると onPrimary が追随する", () => {
  const c = assignRoles(FIXTURE);
  const next = setRole(c, "primary", "#101010");
  assert.equal(next.primary, "#101010");
  assert.equal(next.onPrimary, "#FFFFFF");
  assert.equal(setRole(c, "primary", "#FFF8E0").onPrimary, "#111111");
});

test("色の基本演算", () => {
  assert.deepEqual(hexToRgb("#FF8000"), { r: 255, g: 128, b: 0 });
  assert.deepEqual(hexToRgb("#f80"), { r: 255, g: 136, b: 0 });
  assert.equal(hexToRgb("zzz"), null);
  assert.equal(rgbToHex(255, 128, 0), "#FF8000");
  assert.equal(rgbToHex(-5, 300, 0), "#00FF00");
  assert.equal(mix("#000000", "#FFFFFF", 0.5), "#808080");
  assert.ok(luminance("#FFFFFF") > 0.99);
  assert.ok(luminance("#000000") < 0.01);
  assert.ok(Math.abs(contrastRatio("#FFFFFF", "#000000") - 21) < 0.01);
  assert.equal(readableOn("#000000"), "#FFFFFF");
  assert.equal(readableOn("#FFFFFF"), "#111111");
  assert.equal(Math.round(rgbToHsl(255, 0, 0).h), 0);
  assert.equal(rgbToHsl(128, 128, 128).s, 0);
});

test("kmeans: 分離した 3 クラスタを見つけ、share の合計が 1 になる", () => {
  const px = [];
  for (let i = 0; i < 60; i++) px.push([250, 248, 240]);
  for (let i = 0; i < 30; i++) px.push([110, 122, 99]);
  for (let i = 0; i < 10; i++) px.push([184, 92, 56]);
  const out = kmeans(px, { k: 3 });
  assert.equal(out.length, 3);
  assert.ok(Math.abs(out.reduce((a, c) => a + c.share, 0) - 1) < 1e-9);
  assert.ok(out[0].share > out[1].share);
  assert.ok(out[0].share > 0.5);
  // 決定的であること
  assert.deepEqual(kmeans(px, { k: 3 }).map((c) => c.hex), out.map((c) => c.hex));
});

test("kmeans: 画素が無いときは空配列", () => {
  assert.deepEqual(kmeans([], { k: 6 }), []);
});

test("extractPalette: 素の画素配列を渡せば document なしで動く", async () => {
  const px = [];
  for (let i = 0; i < 40; i++) px.push([232, 227, 216]);
  for (let i = 0; i < 20; i++) px.push([43, 42, 38]);
  const pal = await extractPalette(null, { k: 2, pixels: px });
  assert.equal(pal.length, 2);
  for (const p of pal) {
    assert.match(p.hex, /^#[0-9A-F]{6}$/);
    assert.ok(p.share > 0 && p.share <= 1);
  }
  assert.ok(pal[0].share >= pal[1].share);
});

test("pixelsFromRgba: 透明画素を落とす", () => {
  const data = new Uint8ClampedArray([1, 2, 3, 255, 9, 9, 9, 0, 4, 5, 6, 255]);
  assert.deepEqual(pixelsFromRgba(data), [[1, 2, 3], [4, 5, 6]]);
});
