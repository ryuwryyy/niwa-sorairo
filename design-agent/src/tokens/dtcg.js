/**
 * W3C Design Tokens Community Group (DTCG) 形式の入出力。
 *
 * なぜ独自JSONをやめたか:
 *   DTCG は 2025-10-28 に最初の安定版（2025.10）が出ており、
 *   Adobe / Figma / Google / Microsoft / Shopify / Salesforce など40社超が支持。
 *   Figma・Penpot・Sketch・Tokens Studio・Style Dictionary・Terrazzo が
 *   いずれもこの形を読み書きする。独自形式で持つ理由がもう無い。
 *
 * 形: JSONツリーの葉が { "$type": ..., "$value": ... }。
 *     拡張子 .tokens.json / media type application/design-tokens+json。
 *     dimension の $value は { value, unit } のオブジェクト。
 */

export function toDTCG(designTokens) {
  const out = { $description: "差配 / Sahai design tokens", color: {}, space: {}, radius: {}, typography: {} };

  for (const [name, def] of Object.entries(designTokens.color)) {
    out.color[name] = { $type: "color", $value: def.hex, $description: def.role };
  }
  for (const n of designTokens.space.scale) {
    out.space[String(n)] = { $type: "dimension", $value: { value: n, unit: "px" } };
  }
  for (const [k, v] of Object.entries(designTokens.radius)) {
    out.radius[k] = { $type: "dimension", $value: { value: v, unit: "px" } };
  }
  for (const s of designTokens.type.scale) {
    out.typography[s.name] = {
      $type: "typography",
      $value: {
        fontFamily: designTokens.type.family[s.family],
        fontSize: { value: s.size, unit: "px" },
        lineHeight: { value: s.lineHeight, unit: "px" },
        fontWeight: s.weight
      },
      $description: s.use
    };
  }
  return out;
}

/** DTCG → Figma Variables 作成用の平坦な指示リスト */
export function toFigmaVariablePlan(dtcg) {
  const plan = [];
  for (const [name, t] of Object.entries(dtcg.color ?? {}))
    plan.push({ name: `color/${name}`, type: "COLOR", value: t.$value, scopes: scopesFor("color", name) });
  for (const [name, t] of Object.entries(dtcg.space ?? {}))
    plan.push({ name: `space/${name}`, type: "FLOAT", value: t.$value.value, scopes: ["GAP", "WIDTH_HEIGHT"] });
  for (const [name, t] of Object.entries(dtcg.radius ?? {}))
    plan.push({ name: `radius/${name}`, type: "FLOAT", value: t.$value.value, scopes: ["CORNER_RADIUS"] });
  return plan;
}

function scopesFor(kind, name) {
  if (kind !== "color") return ["ALL_SCOPES"];
  if (/^ink/.test(name)) return ["TEXT_FILL"];
  if (/hairline|line|border/.test(name)) return ["STROKE_COLOR"];
  if (/soft|canvas|surface/.test(name)) return ["FRAME_FILL", "SHAPE_FILL"];
  return ["FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR"];
}

/** 余白・角丸がスケール上にあるか検査する。G2 の offScale 判定に使う。 */
export function checkScale(dtcg, used, group) {
  const scale = Object.values(dtcg[group] ?? {}).map(t => t.$value.value);
  return { scale, offScale: [...new Set(used)].filter(v => v !== 0 && !scale.includes(v)).sort((a, b) => a - b) };
}
