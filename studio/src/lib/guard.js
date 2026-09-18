/**
 * プロンプトの権利ガード。`guardPrompt` に cannes.json のブランド名を足して呼ぶ薄いラッパ。
 * DESIGN.md B6 / §6「特定作品・ロゴ・商標の再現を指示しない」。
 */
import cannes from "../data/cannes.json" with { type: "json" };
import { guardPrompt } from "./prompt.js";

let cached = null;

/** cannes.json のブランド名（「A / B」は分割し、短すぎる語は落とす） */
export function cannesBrands() {
  if (cached) return cached;
  const set = new Set();
  for (const c of cannes) {
    for (const part of String(c.brand || "").split(/\s*[/／・]\s*/)) {
      const t = part.trim();
      if (t.length >= 4) set.add(t);
    }
  }
  cached = [...set];
  return cached;
}

/**
 * @param {string} text EN プロンプト
 * @param {string[]} extraTerms 追加で見張りたい語（案件のブランド名など）
 * @returns {{ items: Array<{level,term,message}>, warns: number, blocks: number, blocked: boolean }}
 */
export function guard(text, extraTerms = []) {
  const items = guardPrompt(text, [...cannesBrands(), ...(extraTerms || [])]);
  const blocks = items.filter((i) => i.level === "block").length;
  return { items, warns: items.length - blocks, blocks, blocked: blocks > 0 };
}

export default guard;
