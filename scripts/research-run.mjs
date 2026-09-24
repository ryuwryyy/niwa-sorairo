#!/usr/bin/env node
// 「聴く」の深掘りレポートを、画面を開かずに本番の API(Vercel)で段階ごとに動かす。Claude Code から調べて FigJam に置くとき用。
// 画面と同じ部品(research/src/lib/)を使い、同じ順番・同じ関門で進む。本物の Brave・Jev・Claude を呼ぶので費用がかかる。
// テストや CI からは呼ばないこと。
//
//   node scripts/research-run.mjs collect  --out runs/ux --theme "サービスデザイン・デザイン・UX" --keywords "UX,サービスデザイン" --pages 3
//   node scripts/research-run.mjs screen   --out runs/ux --keep 100        ふるい分け(Jev)と声の質チェック。ここで止まる
//   node scripts/research-run.mjs directions --out runs/ux                 リサーチの方向の提案(Claude 1回)
//   node scripts/research-run.mjs extract  --out runs/ux                   インサイトを抽出する = カテゴリー(Claude 1回)とタグ(Jev)
//   node scripts/research-run.mjs groups   --out runs/ux --groups 4        件数の多い感情語グループから要約(Claude 1回ずつ)
//   node scripts/research-run.mjs synthesis --out runs/ux                  洞察とデコンテ(Claude 1回)
//   node scripts/research-run.mjs strategy --out runs/ux                   戦略シート(Claude 1回)
//   node scripts/research-run.mjs export   --out runs/ux                   payload.json(FigJam)と report.md
//
// API の場所は --base(既定は環境変数 RESEARCH_API_BASE、なければ https://teire-app.vercel.app)。
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_THEME, DEFAULT_KEYWORDS, screeningQuestions, tagQuestion, postState, selectTop, topTags, usefulness,
  coordinates, quadrantOf, QUADRANTS, FEELINGS, literalWords, dedupe, assessQuality, qualityText, toFigJamReport, toMarkdown,
} from "../research/src/lib/report.js";
import { applyRules, sourceQuestion, isPersonal, EXCLUDE_DEFAULTS } from "../research/src/lib/filters.js";
import { STRATEGY_MAX_POSTS } from "../research/src/lib/strategy.js";

const [stage, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const OUT = opt("out", "runs/latest");
const BASE = (opt("base", process.env.RESEARCH_API_BASE || "https://teire-app.vercel.app")).replace(/\/$/, "");
fs.mkdirSync(OUT, { recursive: true });
const statePath = path.join(OUT, "state.json");
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1));

// 画面用の部品は相対パス(/api/...)で fetch するので、ここで本番の場所を前に付ける
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => realFetch(typeof url === "string" && url.startsWith("/api/") ? `${BASE}${url}` : url, init);
const { collectWithBrave } = await import("../research/src/lib/brave.js");
const { classifyAll } = await import("../research/src/lib/jev.js");
const { analyze, forClaude } = await import("../research/src/lib/analyze.js");

const log = (...a) => console.error(...a);
const need = (key, hint) => { if (!state[key]) { log(`先に ${hint} を実行してください`); process.exit(2); } };
const progress = (done, total) => process.stderr.write(`\r  Jev ${done}/${total}`);

const groupsOf = (list) => Object.keys(FEELINGS)
  .map((label) => ({ label, rows: list.filter((r) => r.feeling === label).sort((a, b) => usefulness(b) - usefulness(a)) }))
  .filter((g) => g.rows.length)
  .sort((a, b) => b.rows.length - a.rows.length);

async function collect() {
  state.theme = opt("theme", state.theme || DEFAULT_THEME);
  state.keywords = (opt("keywords") ? opt("keywords").split(/[,、\n]/) : state.keywords || DEFAULT_KEYWORDS).map((k) => k.trim()).filter(Boolean);
  const o = {
    keywords: state.keywords, sites: (opt("sites", "x")).split(","), pages: Number(opt("pages", 3)),
    freshness: opt("freshness", ""), target: Number(opt("target", 1000)), replyAuthors: Number(opt("replies", 10)), excludeMarketing: true,
  };
  log(`Brave で収集: ${o.keywords.length}語 × ${o.sites.join("/")} × 最大${o.pages}ページ + 返信${o.replyAuthors}人`);
  const out = await collectWithBrave(o, { onProgress: (p) => process.stderr.write(`\r  ${p.label} · ${p.found}件 · ${p.queries}クエリ      `) });
  log(`\n収集 ${out.posts.length}件(${out.queries}クエリ)`);
  state.raw = out.posts;
  state.braveQueries = (state.braveQueries || 0) + out.queries;
  delete state.rows; delete state.categories; delete state.analyses; delete state.synthesis; delete state.strategy; delete state.directions;
  save();
}

async function screen() {
  need("raw", "collect");
  const keep = Number(opt("keep", 100));
  const { kept, excluded } = applyRules(state.raw.filter((p) => p.text.length >= 4), EXCLUDE_DEFAULTS);
  const posts = dedupe(kept).map((p, i) => ({ ...p, id: `p${i + 1}` }));
  log(`ルールで除外 ${excluded.length}件 → Jev でふるい分け ${posts.length}件`);
  const out = await classifyAll(posts.map((p) => ({ id: p.id, state: postState(p, state.theme) })),
    { ...screeningQuestions(state.theme), ...sourceQuestion() }, { onProgress: progress });
  log(`\nJev: ${out.stats.model} · 失敗 ${out.errors.size}件`);
  const all = posts.map((p) => {
    const a = out.answers.get(p.id);
    if (!a) return null;
    return {
      ...p, usable: a.usable.noul, depth: a.depth.score, feeling: a.feeling.choice, feelingConf: a.feeling.confidence,
      feelingProbs: a.feeling.probabilities, intensity: a.intensity.score, literal: literalWords(p.text),
      source: a.source?.choice || null, personal: isPersonal(a.source),
    };
  }).filter(Boolean);
  const jevExcluded = all.filter((r) => !r.personal);
  const rows = selectTop(all.filter((r) => r.personal), keep).map((r) => {
    const coord = coordinates(r);
    return { ...r, coord, quadrant: quadrantOf(coord).id, tags: [] };
  });
  Object.assign(state, {
    keep, screened: all, rows, ruleExcluded: excluded.length, jevExcluded: jevExcluded.length,
    excludedSamples: [...excluded.slice(0, 30).map((p) => ({ text: p.text, url: p.url, reasons: p.reasons })),
      ...jevExcluded.slice(0, 30).map((r) => ({ text: r.text, url: r.url, reasons: [`Jev: ${r.source}`] }))],
  });
  delete state.categories; delete state.analyses; delete state.synthesis; delete state.strategy; delete state.directions;
  state.quality = assessQuality({ screened: all, kept: rows, keep, ruleExcluded: excluded.length, jevExcluded: jevExcluded.length });
  save();
  console.log(qualityText(state.quality));
  log("\n声の質チェックで止まりました。次は extract(インサイトを抽出する)/ collect をワードを変えて / directions のどれか。");
}

async function directions() {
  need("rows", "screen");
  const sample = [...state.rows].sort((a, b) => usefulness(b) - usefulness(a)).slice(0, 60);
  state.directions = await analyze("directions", { theme: state.theme, keywords: state.keywords, quality: qualityText(state.quality), posts: forClaude(sample) });
  save();
  console.log(JSON.stringify(state.directions, null, 2));
}

async function extract() {
  need("rows", "screen");
  const cats = (await analyze("categories", { theme: state.theme, posts: forClaude(state.rows) })).categories;
  const out = await classifyAll(state.rows.map((r) => ({ id: r.id, state: postState(r, state.theme) })), tagQuestion(cats), { onProgress: progress });
  state.categories = cats;
  state.rows = state.rows.map((r) => { const a = out.answers.get(r.id); return a ? { ...r, tags: topTags(a.category.probabilities) } : r; });
  state.analyses = {};
  save();
  log("");
  console.log(cats.map((c) => `- ${c.label}(${state.rows.filter((r) => r.tags.includes(c.label)).length}件): ${c.description}`).join("\n"));
}

async function groups() {
  need("categories", "extract");
  const n = Number(opt("groups", 4));
  const only = opt("group");
  const targets = groupsOf(state.rows).filter((g) => g.rows.length >= 2 && (!only || g.label === only)).slice(0, only ? 1 : n);
  for (const g of targets) {
    log(`要約: ${g.label}(${g.rows.length}件)`);
    state.analyses[g.label] = await analyze("group", { theme: state.theme, group: g.label, posts: forClaude(g.rows) });
    save();
  }
  console.log(targets.map((g) => `- ${g.label}: ${state.analyses[g.label].summary}`).join("\n"));
}

async function synthesis() {
  need("categories", "extract");
  const groupsList = groupsOf(state.rows).map((g) => ({ label: g.label, count: g.rows.length, summary: state.analyses?.[g.label]?.summary || "" }));
  const quadrants = QUADRANTS.map((q) => ({ name: q.name, count: state.rows.filter((r) => r.quadrant === q.id).length }));
  const sample = [...state.rows].sort((a, b) => usefulness(b) - usefulness(a)).slice(0, 60);
  state.synthesis = await analyze("synthesis", { theme: state.theme, groups: groupsList, quadrants, posts: forClaude(sample) });
  save();
  console.log(state.synthesis.headline);
}

async function strategy() {
  need("categories", "extract");
  const notes = [
    state.synthesis && `全体: ${state.synthesis.headline}`,
    ...groupsOf(state.rows).filter((g) => state.analyses?.[g.label]).map((g) => `${g.label}(${g.rows.length}件): ${state.analyses[g.label].summary}`),
    ...QUADRANTS.map((q) => `${q.name}: ${state.rows.filter((r) => r.quadrant === q.id).length}件`),
  ].filter(Boolean).join("\n");
  state.strategy = await analyze("strategy", {
    theme: state.theme, notes, posts: forClaude([...state.rows].sort((a, b) => usefulness(b) - usefulness(a)).slice(0, STRATEGY_MAX_POSTS)),
  });
  save();
  console.log(`${state.strategy.coreIdea.title} — ${state.strategy.coreIdea.statement}`);
}

function exportAll() {
  need("rows", "screen");
  const gs = groupsOf(state.rows).map((g) => ({ ...g, analysis: state.analyses?.[g.label] }));
  const stats = {
    total: state.screened.length, usable: state.screened.filter((r) => r.usable >= 0.5 && r.personal).length,
    ruleExcluded: state.ruleExcluded, jevExcluded: state.jevExcluded,
  };
  const payload = toFigJamReport({ theme: state.theme, rows: state.rows, groups: gs, synthesis: state.synthesis, strategy: state.strategy });
  fs.writeFileSync(path.join(OUT, "payload.json"), JSON.stringify(payload));
  fs.writeFileSync(path.join(OUT, "report.md"), toMarkdown({ theme: state.theme, rows: state.rows, categories: state.categories, groups: gs, synthesis: state.synthesis, stats, strategy: state.strategy }));
  console.log(`${path.join(OUT, "payload.json")} と ${path.join(OUT, "report.md")} を書き出しました`);
}

const STAGES = { collect, screen, directions, extract, groups, synthesis, strategy, export: exportAll };
if (!STAGES[stage]) { log(`段階を指定してください: ${Object.keys(STAGES).join(" / ")}`); process.exit(2); }
try {
  await STAGES[stage]();
} catch (e) {
  log(`\n失敗: ${e.message}${/fetch failed|ECONN|ENOTFOUND/.test(String(e.cause || e.message)) ? `(${BASE} に届かない。ネットワーク許可を確認)` : ""}`);
  process.exit(1);
}
