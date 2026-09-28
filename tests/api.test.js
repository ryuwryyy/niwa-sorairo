// サーバー側(api/_jev-core.js / api/_analyze-core.js)のテスト。
// 上流(Jev・Claude)は fetch を差し替えて偽の応答を返すので、APIキーも課金も不要。
import { strategyFixture } from "./fixtures/strategy.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleJevRequest } from "../api/_jev-core.js";
import { handleAnalyzeRequest } from "../api/_analyze-core.js";
import { socialQuestions, DEFAULT_TOPICS } from "../research/src/lib/presets.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Jev の偽物: 質問の型ごとにそれらしい答えを返し、受けたリクエストを記録する */
function fakeJev() {
  const seen = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, headers: init.headers, body });
    if (body.state?.["投稿"] === "FAIL") return json({ error: "bad" }, 400);
    const answers = {};
    for (const [k, q] of Object.entries(body.questions)) {
      if (q.type === "noul") answers[k] = { type: "noul", noul: 0.8 };
      if (q.type === "choice") {
        const l = Object.keys(q.criteria);
        answers[k] = { type: "choice", choice: l[0], confidence: 0.9, probabilities: Object.fromEntries(l.map((x, i) => [x, i ? 0.1 / (l.length - 1) : 0.9])) };
      }
      if (q.type === "score") answers[k] = { type: "score", score: 2.2, confidence: 0.7, legend: {}, probabilities: {} };
    }
    return json({ model: "jev-1", answers, usage: { input_tokens: 10, output_tokens: 1 } });
  };
  return { fetch, seen };
}

const questions = socialQuestions({ context: "X", topicsText: DEFAULT_TOPICS });
const items = [1, 2, 3].map((i) => ({ id: `p${i}`, state: { "投稿": `投稿${i}` } }));

test("jev: キーが無ければ 501 no_key", async () => {
  const r = await handleJevRequest({}, {});
  assert.equal(r.status, 501);
  assert.equal(r.body.error.code, "no_key");
});

test("jev: 公式SDKの形で /v1/systemone に投げ、一部の失敗は件ごとに返す", async () => {
  const jev = fakeJev();
  const r = await handleJevRequest(
    JSON.stringify({ items: [...items, { id: "bad", state: { "投稿": "FAIL" } }], questions }),
    { TYPESAFE_API_KEY: "sk-test" }, jev.fetch,
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.results.length, 4);
  assert.equal(r.body.results[0].answers.topic.choice, "見た目・UI");
  assert.ok(r.body.results.find((x) => x.id === "bad").error);
  assert.equal(jev.seen[0].url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(jev.seen[0].headers.Authorization, "Bearer sk-test");
  assert.equal(jev.seen[0].body.model, "jev-latest");
  assert.equal(r.body.usage.input_tokens, 30);
});

test("jev: 入力検証で弾き、上流を呼ばない", async () => {
  const jev = fakeJev();
  const env = { TYPESAFE_API_KEY: "k" };
  assert.equal((await handleJevRequest({ items, questions: { "bad name": { type: "noul" } } }, env, jev.fetch)).status, 400);
  assert.equal((await handleJevRequest({ items: Array(26).fill({ state: "x" }), questions }, env, jev.fetch)).status, 400);
  assert.equal((await handleJevRequest({ items, questions: { a: { type: "score", criteria: ["x"] } } }, env, jev.fetch)).status, 400);
  assert.equal((await handleJevRequest({}, env, jev.fetch)).status, 400);
  assert.equal(jev.seen.length, 0);
});

test("jev: 401 はバッチ全体の失敗にする", async () => {
  const r = await handleJevRequest({ items, questions }, { TYPESAFE_API_KEY: "k" }, async () => json({ error: "nope" }, 401));
  assert.equal(r.status, 401);
});

/** Claude の偽物: 受けたリクエストを記録し、スキーマに合うJSONを返す */
function fakeClaude(result) {
  const seen = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const headers = Object.fromEntries(new Headers(init.headers));
    seen.push({ url: String(url), headers, body });
    return json({
      id: "msg_test", type: "message", role: "assistant", model: body.model, stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(result) }], usage: { input_tokens: 1, output_tokens: 1 },
    });
  };
  return { fetch, seen };
}

test("analyze: キーが無ければ 501 no_key", async () => {
  const r = await handleAnalyzeRequest({ task: "categories" }, {});
  assert.equal(r.status, 501);
});

test("analyze: claude-opus-5・adaptive thinking・構造化出力・fallback で呼ぶ", async () => {
  const claude = fakeClaude({ categories: [{ label: "情報設計", description: "導線" }] });
  const r = await handleAnalyzeRequest(
    { task: "categories", posts: [{ id: "p1", text: "登録で迷った" }] },
    { ANTHROPIC_API_KEY: "sk-test" }, claude.fetch,
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.categories[0].label, "情報設計");
  const req = claude.seen[0];
  assert.match(req.url, /\/v1\/messages/);
  assert.equal(req.body.model, "claude-opus-5");
  assert.deepEqual(req.body.thinking, { type: "adaptive" });
  assert.equal(req.body.fallbacks, "default");
  assert.equal(req.body.output_config.format.type, "json_schema");
  assert.match(req.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.match(req.body.messages[0].content, /\[p1\] 登録で迷った/);
});

test("analyze: 未知のタスクや空の投稿は上流を呼ばずに 400", async () => {
  const claude = fakeClaude({});
  const env = { ANTHROPIC_API_KEY: "k" };
  assert.equal((await handleAnalyzeRequest({ task: "anything" }, env, claude.fetch)).status, 400);
  assert.equal((await handleAnalyzeRequest({ task: "group", posts: [] }, env, claude.fetch)).status, 400);
  assert.equal((await handleAnalyzeRequest({ task: "categories", posts: Array(151).fill({ id: "x", text: "y" }) }, env, claude.fetch)).status, 400);
  assert.equal(claude.seen.length, 0);
});

test("analyze: 戦略シート(strategy)は分析メモと投稿を渡し、スキーマに9項目を持つ", async () => {
  const claude = fakeClaude(strategyFixture());
  const r = await handleAnalyzeRequest(
    { task: "strategy", theme: "UX", notes: "好き: 迷わないのが好評", posts: [{ id: "p1", text: "登録で迷った", tags: ["手続き"], feeling: "悪い" }] },
    { ANTHROPIC_API_KEY: "k" }, claude.fetch,
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const req = claude.seen[0].body;
  assert.equal(req.output_config.effort, "high");
  assert.deepEqual(Object.keys(req.output_config.format.schema.properties),
    ["personas", "emotionMap", "hypotheses", "insights", "coreIdea", "problems", "solutions", "toneManner", "creativeBrief"]);
  assert.match(req.messages[0].content, /好き: 迷わないのが好評/);
  assert.match(req.messages[0].content, /\[p1\] \(手続き\) <悪い> 登録で迷った/);
  assert.equal(r.body.result.coreIdea.title, "(テスト)コア");
});

test("analyze: リサーチの方向(directions)は質の集計と今のワードを渡す", async () => {
  const claude = fakeClaude({ diagnosis: "d", gaps: [], directions: [] });
  const r = await handleAnalyzeRequest(
    { task: "directions", theme: "UX", keywords: ["UX", "デザイン"], quality: "判定: 低い(40/100)", posts: [{ id: "p1", text: "登録で迷った" }] },
    { ANTHROPIC_API_KEY: "k" }, claude.fetch,
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const req = claude.seen[0].body;
  assert.deepEqual(Object.keys(req.output_config.format.schema.properties), ["diagnosis", "gaps", "directions"]);
  assert.match(req.messages[0].content, /いま使っている検索ワード: UX \/ デザイン/);
  assert.match(req.messages[0].content, /判定: 低い\(40\/100\)/);
});

test("analyze: 拒否(refusal)は 422 にする", async () => {
  const fetch = async (url, init) => json({
    id: "m", type: "message", role: "assistant", model: "claude-opus-5", stop_reason: "refusal",
    content: [], usage: { input_tokens: 1, output_tokens: 0 },
  });
  const r = await handleAnalyzeRequest({ task: "categories", posts: [{ id: "p1", text: "x" }] }, { ANTHROPIC_API_KEY: "k" }, fetch);
  assert.equal(r.status, 422);
});

test("CORS: 許可した配信元(GitHub Pages)にだけ応える", async () => {
  const { applyCors } = await import("../api/_cors.js");
  const res = () => ({ h: {}, setHeader(k, v) { this.h[k] = v; } });
  const ok = res();
  applyCors({ headers: { origin: "https://ryuwryyy.github.io" } }, ok);
  assert.equal(ok.h["Access-Control-Allow-Origin"], "https://ryuwryyy.github.io");
  const ng = res();
  applyCors({ headers: { origin: "https://evil.example" } }, ng);
  assert.equal(ng.h["Access-Control-Allow-Origin"], undefined);
});
