#!/usr/bin/env node
/**
 * 検証ステージ単体実行。Figma から採取した監査データを 3 ゲートにかける。
 *   node src/verify.js [--visual visual-review.json]
 * G3 は視覚モデルの採点結果を JSON で受け取る。渡されない場合は G1/G2 のみ判定し、
 * G3 は pending として全体を未完了扱いにする（勝手に通さない）。
 */
import fs from "node:fs";
import { gateSpecCoverage, gateTokenFidelity, gateVisualReview, evaluate } from "./gate.js";
import { toDTCG, checkScale } from "./tokens/dtcg.js";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const product = JSON.parse(fs.readFileSync(arg("--config", "config/product.sahai.json"), "utf8"));
const spec = JSON.parse(fs.readFileSync(arg("--spec", "artifacts/05-ux-spec.json"), "utf8"));
const audit = JSON.parse(fs.readFileSync(arg("--audit", "artifacts/figma-audit.json"), "utf8"));
const out = arg("--out", "artifacts/gate-report.json");

const vi = process.argv.indexOf("--visual");
const visual = vi > -1 ? JSON.parse(fs.readFileSync(process.argv[vi + 1], "utf8")) : null;

let allPass = true;
const report = [];

for (const sc of spec.screens) {
  const a = audit.screens[sc.id];
  if (!a) { console.log(`✗ ${sc.id} — Figma 上に存在しません`); allPass = false; continue; }

  if (a.space == null || a.radius == null) {
    console.log(`✗ ${sc.id} ${sc.name} — 監査データが不完全（余白・角丸が未測定）。G2 は判定できません。`);
    allPass = false; report.push({ screen: sc.id, pass: false, reason: "audit-incomplete" });
    continue;
  }
  const dtcg = toDTCG(product.designTokens);
  const gates = [
    gateSpecCoverage(sc.mustHave, a.specIds),
    gateTokenFidelity({
      color: a.color,
      space: { ...a.space, offScale: checkScale(dtcg, a.space.used ?? [], "space").offScale },
      radius: { ...a.radius, offScale: checkScale(dtcg, a.radius.used ?? [], "radius").offScale },
      fonts: a.fonts
    }, product.designTokens)
  ];
  if (visual?.[sc.id]) gates.push(gateVisualReview(visual[sc.id]));

  const r = evaluate(gates);
  const complete = r.pass && Boolean(visual?.[sc.id]);
  allPass &&= complete;

  const mark = complete ? "✓" : r.pass ? "…" : "✗";
  const g3 = visual?.[sc.id] ? `G3 ${visual[sc.id].score.toFixed(1)}/5` : "G3 pending";
  const c = gates[1].counts;
  console.log(`${mark} ${sc.id} ${sc.name.padEnd(9, "　")} G1 ${(gates[0].score * 100).toFixed(0)}%  G2 ${(gates[1].score * 100).toFixed(0)}% (色 ${c.color} 余白 ${c.space} 角丸 ${c.radius})  ${g3}`);
  for (const f of r.fixes) console.log(`    → ${f}`);
  report.push({ screen: sc.id, pass: complete, gates });
}

if (audit._status) console.log(`\n監査データ: ${audit._status}`);
console.log(allPass ? "\nGOAL REACHED — 全画面が3ゲートを通過" : "\nNOT DONE — 未通過の画面があります");

fs.writeFileSync(out, JSON.stringify({ allPass, report }, null, 2));
process.exit(allPass ? 0 : 1);
