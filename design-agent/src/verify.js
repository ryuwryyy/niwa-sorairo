#!/usr/bin/env node
/**
 * 検証ステージ単体実行。Figma から採取した監査データを 3 ゲートにかける。
 *   node src/verify.js [--visual visual-review.json]
 * G3 は視覚モデルの採点結果を JSON で受け取る。渡されない場合は G1/G2 のみ判定し、
 * G3 は pending として全体を未完了扱いにする（勝手に通さない）。
 */
import fs from "node:fs";
import { gateSpecCoverage, gateTokenFidelity, gateVisualReview, evaluate } from "./gate.js";

const product = JSON.parse(fs.readFileSync("config/product.sahai.json", "utf8"));
const spec = JSON.parse(fs.readFileSync("artifacts/05-ux-spec.json", "utf8"));
const audit = JSON.parse(fs.readFileSync("artifacts/figma-audit.json", "utf8"));

const vi = process.argv.indexOf("--visual");
const visual = vi > -1 ? JSON.parse(fs.readFileSync(process.argv[vi + 1], "utf8")) : null;

let allPass = true;
const report = [];

for (const sc of spec.screens) {
  const a = audit.screens[sc.id];
  if (!a) { console.log(`✗ ${sc.id} — Figma 上に存在しません`); allPass = false; continue; }

  const gates = [
    gateSpecCoverage(sc.mustHave, a.specIds),
    gateTokenFidelity({ colors: a.strayColors, fonts: a.fonts }, product.designTokens)
  ];
  if (visual?.[sc.id]) gates.push(gateVisualReview(visual[sc.id]));

  const r = evaluate(gates);
  const complete = r.pass && Boolean(visual?.[sc.id]);
  allPass &&= complete;

  const mark = complete ? "✓" : r.pass ? "…" : "✗";
  const g3 = visual?.[sc.id] ? `G3 ${visual[sc.id].score.toFixed(1)}/5` : "G3 pending";
  console.log(`${mark} ${sc.id} ${sc.name.padEnd(9, "　")} G1 ${(gates[0].score * 100).toFixed(0)}%  G2 ${(gates[1].score * 100).toFixed(0)}% (bound ${a.boundPaints}/${a.totalPaints})  ${g3}`);
  for (const f of r.fixes) console.log(`    → ${f}`);
  report.push({ screen: sc.id, pass: complete, gates });
}

const totalPaints = Object.values(audit.screens).reduce((n, s) => n + s.totalPaints, 0);
const bound = Object.values(audit.screens).reduce((n, s) => n + s.boundPaints, 0);
console.log(`\nトークン束縛率: ${bound}/${totalPaints} (${((bound / totalPaints) * 100).toFixed(1)}%)`);
console.log(allPass ? "\nGOAL REACHED — 全画面が3ゲートを通過" : "\nNOT DONE — 未通過の画面があります");

fs.writeFileSync("artifacts/gate-report.json", JSON.stringify({ allPass, report }, null, 2));
process.exit(allPass ? 0 : 1);
