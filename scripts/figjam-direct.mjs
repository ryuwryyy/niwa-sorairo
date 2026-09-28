#!/usr/bin/env node
// 「聴く」の書き出し(FigJamへ(コピー)の JSON)を、Claude Code から Figma の連携(use_figma)で FigJam に直接置くための
// JavaScript を作る。配置のロジックは figma-plugin/code.js をそのまま使うので、プラグインで置いたときと同じ見た目になる。
//
//   node scripts/figjam-direct.mjs payload.json --list                 部品の一覧と、それぞれのスクリプトの大きさ
//   node scripts/figjam-direct.mjs payload.json --part map --x 0 --y 0 > part.js
//
// use_figma の1回のコードは5万字までなので、大きなデータは部品(part)ごとに分けて順に置く。
// 各スクリプトは置いたノードの id と、次の部品を置く位置(bottom)を返す。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// 上限に収めるため、行頭の空白と行コメントだけ落とす(コードの意味は変えない)
const LIB = fs.readFileSync(path.join(here, "../figma-plugin/code.js"), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
export const MAX_CODE = 50000;

/** データの種類ごとの部品。call はプラグインの関数を呼ぶ式(x, y は置く位置) */
export function partsOf(data) {
  if (data.kind === "kiku/report-v1") {
    return [
      { name: "map", call: "[label(figma.currentPage, DATA.title, x, y, 56), placeQuadrant(DATA, x, y + 120)]", data: { title: data.title, posts: data.posts, quadrants: data.quadrants } },
      data.groups?.length && { name: "groups", call: "placeGroups(DATA.groups, x, y)", data: { groups: data.groups } },
      data.synthesis && { name: "synthesis", call: "placeSynthesis(DATA.synthesis, x, y)", data: { synthesis: data.synthesis } },
      data.strategy && { name: "strategy", call: "placeStrategy(DATA.strategy, x, y)", data: { strategy: data.strategy } },
    ].filter(Boolean);
  }
  if (data.kind === "kiku/listening-v1") {
    return [
      { name: "topics", call: "[label(figma.currentPage, DATA.title, x, y, 56)].concat(placeListening(DATA, x, y + 120).nodes)", data: { title: data.title, topics: data.topics } },
      data.strategy && { name: "strategy", call: "placeStrategy(DATA.strategy, x, y)", data: { strategy: data.strategy } },
    ].filter(Boolean);
  }
  if (data.kind === "kiku/v1") return [{ name: "all", call: "await placeData(DATA, x, y)", data }];
  throw new Error(`「聴く」の書き出しではありません(kind: ${data.kind})`);
}

/** use_figma に渡すコード。x, y を省くと、ページ上の既存ノードの右側に置く */
export function scriptFor(part, { x, y } = {}) {
  const pos = x == null
    ? `let x = 0, y = ${Number(y) || 0};
for (const n of figma.currentPage.children) x = Math.max(x, n.x + n.width + 400);`
    : `const x = ${Number(x)}, y = ${Number(y) || 0};`;
  return `${LIB}
const DATA = ${JSON.stringify(part.data)};
await figma.loadFontAsync({ family: "Inter", style: "Medium" });
${pos}
const out = ${part.call};
const nodes = [].concat(out).filter((n) => n && n.id);
let bottom = y, right = x;
for (const n of nodes) {
  if (typeof n.height === "number") bottom = Math.max(bottom, n.y + n.height);
  if (typeof n.width === "number") right = Math.max(right, n.x + n.width);
}
return { part: ${JSON.stringify(part.name)}, createdNodeIds: nodes.map((n) => n.id), x, bottom: Math.round(bottom), right: Math.round(right) };
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) { console.error("使い方: node scripts/figjam-direct.mjs payload.json (--list | --part 名前 [--x N --y N])"); process.exit(2); }
  const arg = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const parts = partsOf(data);
  if (rest.includes("--list")) {
    for (const p of parts) {
      const n = scriptFor(p, { x: 0, y: 0 }).length;
      console.log(`${p.name}\t${n}字${n > MAX_CODE ? "  ← 5万字を超えるので、データを減らす必要がある" : ""}`);
    }
    process.exit(0);
  }
  const part = parts.find((p) => p.name === arg("--part"));
  if (!part) { console.error(`部品がない: ${arg("--part")}(${parts.map((p) => p.name).join(", ")})`); process.exit(2); }
  const code = scriptFor(part, { x: arg("--x"), y: arg("--y") });
  if (code.length > MAX_CODE) { console.error(`コードが ${code.length} 字で、use_figma の上限(${MAX_CODE})を超える`); process.exit(1); }
  process.stdout.write(code);
}
