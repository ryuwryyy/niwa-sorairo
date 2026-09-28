/**
 * 企画（Idea）ステージのサーバ側 — server/lib/ideaOps.js のスキーマ契約と、
 * api/studio/ai.js の op "insights" / "ideas" の振り分け。
 *
 * Claude の構造化出力は再帰スキーマを受け付けず、object には
 * additionalProperties:false と required が要る（server/lib/claude.js の注記）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import aiHandler from "../../api/studio/ai.js";
import { insightsSchema, insightsSystem, ideasSchema, ideasSystem } from "../../server/lib/ideaOps.js";

/* ---------------- 共通のシム ---------------- */

const realFetch = globalThis.fetch;
const calls = [];

function fakeRes() {
  return {
    code: 0,
    payload: null,
    status(c) { this.code = c; return this; },
    json(o) { this.payload = o; return this; },
    end() { return this; },
    setHeader() {},
  };
}

function mockFetch(responder) {
  calls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    const r = responder(String(url), calls.length, body);
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: { get: () => null },
      text: async () => (typeof r.text === "string" ? r.text : JSON.stringify(r.json ?? {})),
    };
  };
}

const claudeOk = (payload) => ({
  status: 200,
  json: {
    model: "claude-opus-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) }],
    usage: {},
  },
});

const call = async (handler, req) => {
  const res = fakeRes();
  await handler({ query: {}, ...req }, res);
  return res;
};

let savedKey;
test.beforeEach(() => {
  savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "K";
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

/* ---------------- スキーマの契約 ---------------- */

/** すべての object ノードを歩き、同じ参照に戻ってきたら再帰とみなす */
function walkSchema(node, fn, seen = new Set(), path = "$", depth = 0) {
  if (!node || typeof node !== "object") return;
  assert.ok(depth < 20, `${path}: スキーマが深すぎます（再帰の疑い）`);
  assert.equal(seen.has(node), false, `${path}: 同じスキーマ節点が再び現れました（再帰は使えません）`);
  const next = new Set(seen).add(node);
  fn(node, path);
  for (const [k, v] of Object.entries(node.properties || {})) walkSchema(v, fn, next, `${path}.${k}`, depth + 1);
  if (node.items) walkSchema(node.items, fn, next, `${path}[]`, depth + 1);
  for (const key of ["anyOf", "oneOf", "allOf", "$ref", "$defs", "definitions"]) {
    assert.equal(key in node, false, `${path}: ${key} は使えません`);
  }
}

for (const [name, schema] of [["insights", insightsSchema], ["ideas", ideasSchema]]) {
  test(`${name}Schema: object には additionalProperties:false と required が付く / 再帰が無い`, () => {
    walkSchema(schema, (n, path) => {
      if (n.type !== "object") return;
      assert.equal(n.additionalProperties, false, `${path}: additionalProperties:false がありません`);
      assert.ok(Array.isArray(n.required), `${path}: required がありません`);
      const props = Object.keys(n.properties || {});
      assert.ok(props.length, `${path}: properties が空です`);
      assert.deepEqual([...n.required].sort(), [...props].sort(), `${path}: required が properties と一致しません`);
    });
  });

  test(`${name}Schema: JSON として往復できる（関数や循環参照が無い）`, () => {
    assert.deepEqual(JSON.parse(JSON.stringify(schema)), schema);
  });
}

test("insightsSchema: インサイト 5 本・緊張 5 本をちょうどで縛る", () => {
  const { insights, tensions } = insightsSchema.properties;
  assert.equal(insights.minItems, 5);
  assert.equal(insights.maxItems, 5);
  assert.deepEqual(Object.keys(insights.items.properties), ["text", "source", "evidence"]);
  assert.equal(tensions.minItems, 5);
  assert.equal(tensions.maxItems, 5);
});

test("ideasSchema: アイデア 6 案、スコアは 1〜5 の整数", () => {
  const ideas = ideasSchema.properties.ideas;
  assert.equal(ideas.minItems, 6);
  assert.equal(ideas.maxItems, 6);
  const props = ideas.items.properties;
  for (const k of ["oneLiner", "twist", "kvConcept", "tagline", "why", "risk", "patterns", "scores"]) {
    assert.ok(k in props, `${k} がありません`);
  }
  for (const k of ["idea", "execution", "impact"]) {
    assert.deepEqual(props.scores.properties[k], { type: "integer", minimum: 1, maximum: 5 });
  }
  assert.equal(props.patterns.maxItems, 3);
});

test("システムプロンプト: 日本語で、作品の再現を禁じている", () => {
  for (const [name, sys] of [["insights", insightsSystem], ["ideas", ideasSystem]]) {
    assert.ok(sys.length > 200, `${name} のシステムプロンプトが短すぎます`);
    assert.match(sys, /[ぁ-んァ-ヶ一-龠]/, `${name} が日本語でない`);
    assert.match(sys, /キャンペーン名|ブランド名|再現|なぞ/, `${name} に権利の歯止めが無い`);
  }
  assert.match(ideasSystem, /single-minded|Single-minded/i);
  assert.match(ideasSystem, /kvConcept/);
  assert.match(ideasSystem, /15 文字以内/);
});

/* ---------------- ハンドラの振り分け ---------------- */

const INSIGHTS_PAYLOAD = {
  insights: [
    { text: "本音 1", source: "human_truth", evidence: "根拠 1" },
    { text: "本音 2", source: "brand_truth", evidence: "根拠 2" },
    { text: "本音 3", source: "しらない源", evidence: "根拠 3" },
    { text: "本音 4", source: "", evidence: "根拠 4" },
    { text: "本音 5", source: "human_truth", evidence: "根拠 5" },
  ],
  tensions: [{ text: "緊張 1" }, { text: "緊張 2" }, { text: "緊張 3" }, { text: "緊張 4" }, { text: "緊張 5" }],
};

test("ai insights: 構造化出力で呼び、未知の source を落とす", async () => {
  mockFetch(() => claudeOk(INSIGHTS_PAYLOAD));
  const res = await call(aiHandler, {
    method: "POST",
    body: {
      op: "insights",
      brief: { problem: "p", insight: "i" },
      answers: { human_truth: { q0: "急須を持っていない" } },
      sources: [{ id: "human_truth", ja: "人間の真実" }, { id: "brand_truth", ja: "ブランドの真実" }],
      teachers: [{ id: "x", coreIdeaJa: "コア" }],
    },
  });

  assert.equal(res.code, 200);
  assert.equal(res.payload.insights.length, 5);
  assert.equal(res.payload.tensions.length, 5);
  assert.deepEqual(res.payload.insights.map((x) => x.source), ["human_truth", "brand_truth", "", "", "human_truth"]);

  const sent = calls[0].body;
  assert.equal(sent.output_config.effort, "high");
  assert.equal(sent.output_config.format.type, "json_schema");
  assert.deepEqual(sent.output_config.format.schema, insightsSchema);
  assert.equal(sent.system, insightsSystem);
  // 渡した材料が本文に載る
  const text = sent.messages[0].content[0].text;
  assert.match(text, /急須を持っていない/);
  assert.match(text, /human_truth/);
});

const IDEAS_PAYLOAD = {
  ideas: Array.from({ length: 6 }, (_, i) => ({
    oneLiner: `案 ${i + 1}`,
    twist: "ふつうは〜。この案は〜",
    kvConcept: "A single worn cup on a bare counter.",
    tagline: "待つだけ。",
    why: "効く理由",
    risk: "危うさ",
    patterns: i === 0 ? ["make_invisible_visible", "でっちあげ"] : [],
    scores: { idea: 4, execution: 3, impact: 9 },
  })),
};

test("ai ideas: 6 案を返し、未知の型 id を落とし、スコアを 1〜5 に丸める", async () => {
  mockFetch(() => claudeOk(IDEAS_PAYLOAD));
  const res = await call(aiHandler, {
    method: "POST",
    body: {
      op: "ideas",
      brief: { promise: "静かな3分間" },
      insight: "本音",
      tension: "緊張",
      patterns: [{ id: "make_invisible_visible", ja: "見えないものを見せる" }],
      teachers: [],
      kvGrammar: [{ id: "single_object_hero", ja: "一物の主役" }],
      taglineDirections: [{ id: "truth_stated", ja: "真実を言い切る" }],
    },
  });

  assert.equal(res.code, 200);
  assert.equal(res.payload.ideas.length, 6);
  assert.deepEqual(res.payload.ideas[0].patterns, ["make_invisible_visible"]);
  assert.deepEqual(res.payload.ideas[1].patterns, []);
  assert.deepEqual(res.payload.ideas[0].scores, { idea: 4, execution: 3, impact: 5 });
  assert.equal(res.payload.ideas[0].kvConcept, "A single worn cup on a bare counter.");

  const sent = calls[0].body;
  assert.equal(sent.system, ideasSystem);
  assert.equal(sent.output_config.effort, "high");
  assert.deepEqual(sent.output_config.format.schema, ideasSchema);
  const text = sent.messages[0].content[0].text;
  assert.match(text, /make_invisible_visible/);
  assert.match(text, /single_object_hero/);
});

test("ai insights/ideas: JSON が取れないときは 502", async () => {
  mockFetch(() => claudeOk("ごめんなさい、JSON ではありません"));
  let res = await call(aiHandler, { method: "POST", body: { op: "insights", brief: {} } });
  assert.equal(res.code, 502);
  assert.match(res.payload.error.message, /インサイト/);

  mockFetch(() => claudeOk("これも JSON ではありません"));
  res = await call(aiHandler, { method: "POST", body: { op: "ideas", brief: {} } });
  assert.equal(res.code, 502);
  assert.match(res.payload.error.message, /アイデア/);
});

test("ai insights: キー未設定は 500、上流エラーはその status で返す", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  let res = await call(aiHandler, { method: "POST", body: { op: "insights" } });
  assert.equal(res.code, 500);

  process.env.ANTHROPIC_API_KEY = "K";
  mockFetch(() => ({ status: 429, json: { error: { message: "rate limited" } } }));
  res = await call(aiHandler, { method: "POST", body: { op: "ideas", brief: {} } });
  assert.equal(res.code, 429);
  assert.match(res.payload.error.message, /rate limited/);
});

test("ai: 材料が空でも落ちない（型・先生・回答なし）", async () => {
  mockFetch(() => claudeOk(INSIGHTS_PAYLOAD));
  const res = await call(aiHandler, { method: "POST", body: { op: "insights" } });
  assert.equal(res.code, 200);
  assert.equal(res.payload.insights.length, 5);
  // 照合する先が無いので、検証できない source は空にする（未検証の id を UI に流さない）
  assert.ok(res.payload.insights.every((x) => x.source === ""));
});
