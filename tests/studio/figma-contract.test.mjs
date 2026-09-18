/**
 * 横断テスト: studio が作る spec を、Figma プラグイン側の検証器にそのまま通す。
 * プラグインがまだ無い環境では skip する（このテストは studio 側の契約適合の確認が目的）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildSpec, buildTokens } from "../../studio/src/lib/figmaSpec.js";

let pluginValidate = null;
try {
  ({ validateSpec: pluginValidate } = await import("../../figma-plugin/validate.js"));
} catch {
  pluginValidate = null;
}

const PROJECT = {
  name: "つちや茶舗 KV",
  meta: { brand: "TSUCHIYA TEA", deliverable: "kv", client: "つちや茶舗" },
  consult: {
    brief: {
      oneLiner: "作法を知らない人を、静かな3分間へ",
      promise: "湯を注いで、待つ。それだけでいい。",
      insight: "人が求めているのは何もしなくていい3分間である",
      problem: "作法が要りそうという思い込みで敬遠されている",
    },
  },
  direction: { aspect: "16:9", typography: { intent: "headline_zone", zone: "top", copy: "" } },
  handoff: { palette: [] },
};

const TOKENS = buildTokens({
  palette: [
    { hex: "#E8E3D8", share: 0.5 },
    { hex: "#6F7A63", share: 0.25 },
    { hex: "#2B2A26", share: 0.15 },
    { hex: "#B85C38", share: 0.1 },
  ],
});

test("buildSpec の出力が figma-plugin の検証器を通る", { skip: pluginValidate ? false : "figma-plugin/validate.js が無い" }, () => {
  for (const [label, opts] of [
    ["画像あり", { tokens: TOKENS, imageDataUrl: "data:image/png;base64,iVBORw0KGgo=", imageWidth: 1920, imageHeight: 1080 }],
    ["画像なし", { tokens: TOKENS }],
    ["トークン省略", {}],
  ]) {
    const r = pluginValidate(buildSpec(PROJECT, opts));
    assert.deepEqual(r.errors, [], `${label}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.ok, true, label);
  }
});

test("すべてのアスペクト比・見出しゾーンで検証を通る", { skip: pluginValidate ? false : "figma-plugin/validate.js が無い" }, () => {
  for (const aspect of ["1:1", "4:5", "2:3", "3:2", "9:16", "16:9", "21:9", "4:1", "1:8"]) {
    for (const zone of ["top", "bottom", "left", "right", "center"]) {
      const p = { ...PROJECT, direction: { aspect, typography: { intent: "headline_zone", zone, copy: "" } } };
      const r = pluginValidate(buildSpec(p, { tokens: TOKENS }));
      assert.deepEqual(r.errors, [], `${aspect}/${zone}: ${JSON.stringify(r.errors)}`);
    }
  }
});
