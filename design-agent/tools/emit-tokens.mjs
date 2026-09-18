/** 製品設定 → DTCG トークンファイル。Figma / Style Dictionary / Tokens Studio が直接読める。 */
import fs from "node:fs";
import { toDTCG, toFigmaVariablePlan } from "../src/tokens/dtcg.js";

const product = JSON.parse(fs.readFileSync("config/product.sahai.json", "utf8"));
const dtcg = toDTCG(product.designTokens);
fs.writeFileSync("artifacts/design.tokens.json", JSON.stringify(dtcg, null, 2));
const plan = toFigmaVariablePlan(dtcg);
fs.writeFileSync("artifacts/figma-variable-plan.json", JSON.stringify(plan, null, 2));
console.log(`✓ artifacts/design.tokens.json  (DTCG 2025.10)`);
console.log(`✓ artifacts/figma-variable-plan.json  ${plan.length} variables`);
console.log(`  color ${Object.keys(dtcg.color).length} / space ${Object.keys(dtcg.space).length} / radius ${Object.keys(dtcg.radius).length} / typography ${Object.keys(dtcg.typography).length}`);
