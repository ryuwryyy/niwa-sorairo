/**
 * パイプラインの各ステージ。
 * 上流（戦略）→下流（Figma）へ一方向に流れ、検証結果だけが逆流して次の試行に効く。
 */
import fs from "node:fs";
import path from "node:path";

const prompt = name => fs.readFileSync(path.join("prompts", name), "utf8");
const jsonSchema = (props, required) => ({ type: "object", properties: props, required, additionalProperties: false });

/** 01-04: ペルソナ / ジャーニー / 感情 / 価値提供 */
export async function discovery({ astra, product }) {
  const out = {};
  for (const [key, file, schema] of [
    ["persona", "01-persona.md", jsonSchema({ personas: { type: "array", items: { type: "object" } } }, ["personas"])],
    ["journey", "02-journey.md", jsonSchema({ stages: { type: "array", items: { type: "object" } } }, ["stages"])],
    ["emotion", "03-emotion.md", jsonSchema({ curve: { type: "array", items: { type: "object" } } }, ["curve"])],
    ["value", "04-value-proposition.md", jsonSchema({ customerProfile: { type: "object" }, valueMap: { type: "object" } }, ["customerProfile", "valueMap"])]
  ]) {
    out[key] = await astra.json({
      system: prompt(file),
      user: `製品ブリーフ:\n${JSON.stringify(product, null, 2)}\n\nこれまでの成果物:\n${JSON.stringify(out, null, 2)}`,
      schema, schemaName: key
    });
  }
  return out;
}

/** 05: 画面ごとのUX仕様 */
export async function uxSpec({ astra, product, discovery }) {
  return astra.json({
    system: prompt("05-ux-spec.md"),
    user: `製品:\n${JSON.stringify(product)}\n\n戦略成果物:\n${JSON.stringify(discovery)}`,
    schema: jsonSchema({ screens: { type: "array", items: { type: "object" } } }, ["screens"]),
    schemaName: "ux_spec"
  });
}

/** 06: Images 2.5 でモックアップを1枚生成（方向性の探索） */
export async function mockup({ images, astra, product, screen, outDir, fixes = [] }) {
  const p = await astra.json({
    system: prompt("06-mockup-image.md"),
    user: `画面仕様:\n${JSON.stringify(screen)}\n\nデザイントークン:\n${JSON.stringify(product.designTokens)}` +
          (fixes.length ? `\n\n前回の指摘（必ず反映）:\n- ${fixes.join("\n- ")}` : ""),
    schema: jsonSchema({ prompt: { type: "string" } }, ["prompt"]),
    schemaName: "mockup_prompt"
  });
  const png = await images.generate({
    prompt: p.prompt,
    width: product.platform.viewport.width,
    height: product.platform.viewport.height
  });
  const file = path.join(outDir, `${screen.id}-${screen.slug}.png`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, png);
  return { file, prompt: p.prompt };
}

/**
 * 06b: 生成画像 → 構造化仕様（信頼度マーカー付き）
 * 画像を直接 Figma 構築へ渡さない。読み取れた値と読み取れなかった値を分けてから渡す。
 * ここを省くと、下流は「それらしい数字」で埋めた設計を作る。
 */
export async function extract({ astra, screen, mockupPath, toDataUrl }) {
  return astra.json({
    system: prompt("06b-extract.md"),
    user: `元のUX仕様:\n${JSON.stringify(screen)}`,
    images: [toDataUrl(mockupPath)],
    schema: jsonSchema({
      identity: { type: "object" },
      system: { type: "object" },
      components: { type: "array", items: { type: "object" } },
      layout: { type: "object" },
      divergence: { type: "array", items: { type: "object" } },
      confidence: { type: "object" }
    }, ["identity", "system", "components", "layout", "divergence", "confidence"]),
    schemaName: "extracted_spec"
  });
}

/** 07: Figma へ実ノードとして構築 */
export async function figmaBuild({ astra, figma, product, screen, tokens, extracted = null, fixes = [] }) {
  const plan = await astra.json({
    system: prompt("07-figma-build.md"),
    user: `画面仕様:\n${JSON.stringify(screen)}\n\n利用可能なトークン変数:\n${JSON.stringify(tokens)}` +
          (extracted ? `\n\nモックアップから抽出した仕様（信頼度マーカー付き。❓は自分で埋めず仕様側を優先）:\n${JSON.stringify(extracted)}` : "") +
          `\n\nビューポート: ${JSON.stringify(product.platform.viewport)}` +
          (fixes.length ? `\n\n前回の指摘（必ず直す）:\n- ${fixes.join("\n- ")}` : ""),
    schema: jsonSchema({ code: { type: "string" }, description: { type: "string" } }, ["code", "description"]),
    schemaName: "figma_plugin_code"
  });
  return figma.run(plan.code, plan.description);
}

/** 08: 監査データ採取（G1/G2 の入力） */
export async function audit({ figma, screenNodeId }) {
  return figma.run(AUDIT_SCRIPT.replace("__NODE__", JSON.stringify(screenNodeId)), "collect gate audit data");
}

/** 08: 視覚レビュー（G3 の入力） */
export async function visualReview({ astra, screen, figmaShotUrl, mockupUrl }) {
  return astra.json({
    system: prompt("08-verify.md"),
    user: `画面仕様:\n${JSON.stringify(screen)}\n1枚目=Figmaの実装、2枚目=目標モックアップ。`,
    images: [figmaShotUrl, mockupUrl].filter(Boolean),
    schema: jsonSchema({
      score: { type: "number" },
      sections: { type: "array", items: jsonSchema({
        name: { type: "string" }, score: { type: "number" }, note: { type: "string" }
      }, ["name", "score", "note"]) },
      issues: { type: "array", items: jsonSchema({
        severity: { type: "string", enum: ["blocker", "minor"] },
        where: { type: "string" }, what: { type: "string" }, fix: { type: "string" }
      }, ["severity", "where", "what", "fix"]) }
    }, ["score", "sections", "issues"]),
    schemaName: "visual_review"
  });
}

export const AUDIT_SCRIPT = `
const S = await figma.getNodeByIdAsync(__NODE__);
const hex = c => '#' + [c.r,c.g,c.b].map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('').toUpperCase();
const SPACE_FIELDS = ['itemSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','counterAxisSpacing'];
const RADIUS_FIELDS = ['topLeftRadius','topRightRadius','bottomRightRadius','bottomLeftRadius'];

const all = [S, ...S.findAll(() => true)];
const specIds = [], strayColors = [], fonts = new Set();
const spaceUsed = [], radiusUsed = [];
let cSlots = 0, cBound = 0, sSlots = 0, sBound = 0, rSlots = 0, rBound = 0;

for (const n of all) {
  if (/^s\\d-/.test(n.name)) specIds.push(n.name);
  const bv = n.boundVariables || {};

  for (const key of ['fills','strokes']) {
    const arr = n[key];
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      if (p.type !== 'SOLID') continue;
      cSlots++;
      if (p.boundVariables && p.boundVariables.color) cBound++; else strayColors.push(hex(p.color));
    }
  }

  if (n.layoutMode && n.layoutMode !== 'NONE') {
    for (const f of SPACE_FIELDS) {
      if (typeof n[f] !== 'number') continue;
      if (f === 'counterAxisSpacing' && n.layoutWrap !== 'WRAP') continue;
      sSlots++; if (bv[f]) sBound++; spaceUsed.push(n[f]);
    }
  }
  if ('topLeftRadius' in n) {
    for (const f of RADIUS_FIELDS) {
      if (typeof n[f] !== 'number' || n[f] === 0) continue;
      rSlots++; if (bv[f]) rBound++; radiusUsed.push(n[f]);
    }
  }
  if (n.type === 'TEXT' && n.fontName !== figma.mixed) fonts.add(n.fontName.family);
}

return {
  nodeCount: all.length,
  specIds: [...new Set(specIds)].sort(),
  fonts: [...fonts],
  color:  { slots: cSlots, bound: cBound, stray: [...new Set(strayColors)] },
  space:  { slots: sSlots, bound: sBound, used: [...new Set(spaceUsed)].sort((a,b)=>a-b) },
  radius: { slots: rSlots, bound: rBound, used: [...new Set(radiusUsed)].sort((a,b)=>a-b) }
};
`;
