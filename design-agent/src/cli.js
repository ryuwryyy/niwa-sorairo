#!/usr/bin/env node
import fs from "node:fs";
import { State } from "./state.js";
import { Orchestrator } from "./orchestrator.js";
import { Astra } from "./providers/astra.js";
import { Images25 } from "./providers/images25.js";
import { FigmaDriver } from "./providers/figma-mcp.js";

const args = process.argv.slice(2);
const cmd = args[0] ?? "help";
const flag = n => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };
const has = n => args.includes(n);

const configPath = flag("--config") ?? "config/product.sahai.json";
const product = JSON.parse(fs.readFileSync(configPath, "utf8"));
const statePath = flag("--state") ?? ".design-agent/state.json";
const state = new State(statePath);

const specPath = flag("--spec") ?? "artifacts/05-ux-spec.json";
const spec = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath, "utf8")) : { screens: product.screens };

if (cmd === "status") {
  const rows = state.summary(spec.screens.map(s => s.id));
  console.log(`${product.name} — run #${state.data.runs}`);
  for (const r of rows) console.log(`  ${r.status === "passed" ? "✓" : r.status === "escalated" ? "?" : "·"} ${r.id.padEnd(4)} ${r.status.padEnd(10)} 試行${r.attempts}`);
  const q = state.data.questions.filter(x => !x.answered);
  if (q.length) { console.log(`\n未回答の質問 ${q.length}件:`); q.forEach(x => console.log(`  [${x.screenId}] ${x.question}`)); }
  process.exit(0);
}

if (cmd === "run") {
  const figma = new FigmaDriver({
    mode: flag("--driver") ?? process.env.FIGMA_DRIVER ?? "emit",
    fileKey: flag("--file") ?? process.env.FIGMA_FILE_KEY,
    outDir: ".out"
  });
  await figma.connect();

  const orch = new Orchestrator({
    product, spec, state, figma,
    astra: new Astra({ effort: flag("--effort") ?? "high" }),
    images: new Images25({ model: flag("--image-model") ?? undefined }),
    tokens: fs.existsSync("artifacts/figma-tokens.json")
      ? JSON.parse(fs.readFileSync("artifacts/figma-tokens.json", "utf8")) : product.designTokens
  });

  if (has("--dry-run")) {
    console.log(`${product.name} — 実行計画`);
    console.log(`  ゴール: ${product.goal.statement}`);
    for (const g of product.goal.gates) console.log(`  ${g.id} ${g.name}: ${g.rule}（閾値 ${g.threshold}）`);
    console.log(`  画面 ${spec.screens.length}件を1枚ずつ、最大${product.goal.maxIterationsPerScreen}試行。${product.goal.escalateAfterFailedAttempts}回ごとに調査/質問へ切替。`);
    for (const s of spec.screens) console.log(`    - ${s.id} ${s.name}`);
    process.exit(0);
  }

  const only = flag("--only")?.split(",") ?? null;
  const r = await orch.run({ only });
  await figma.close();
  process.exit(r.done ? 0 : 1);
}

console.log(`design-agent — ${product.name}

  node src/cli.js run [--dry-run] [--only S1,S2] [--driver mcp|emit] [--file <figmaFileKey>]
  node src/cli.js status
  node src/verify.js --visual artifacts/visual-review.json

環境変数: OPENAI_API_KEY / ASTRA_MODEL(既定 gpt-6-astra) / IMAGE_MODEL(既定 gpt-image-2.5-sunburst)
          FIGMA_TOKEN / FIGMA_FILE_KEY / FIGMA_DRIVER`);
