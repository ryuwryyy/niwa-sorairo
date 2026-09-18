import test from "node:test";
import assert from "node:assert/strict";
import { callClaude, imageBlock, extractJson } from "../../server/lib/claude.js";

const realFetch = globalThis.fetch;
const calls = [];

function mockFetch(responder) {
  calls.length = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const r = responder(body, calls.length);
    return {
      status: r.status ?? 200,
      headers: new Map(),
      text: async () => JSON.stringify(r.json ?? {}),
    };
  };
}

const ok = (text) => ({
  status: 200,
  json: {
    id: "msg_1",
    model: "claude-opus-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 20 },
  },
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("リクエストボディの形（model 既定 / thinking adaptive / output_config.format）", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.STUDIO_CLAUDE_MODEL;
  const schema = { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" } } };
  mockFetch(() => ok('{"a":"b"}'));

  const r = await callClaude({
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    schema,
    effort: "high",
    maxTokens: 1234,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0].init.headers["x-api-key"], "test-key");
  assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
  assert.equal(calls[0].init.headers["content-type"], "application/json");

  assert.deepEqual(calls[0].body, {
    model: "claude-opus-5",
    max_tokens: 1234,
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema } },
  });
  assert.equal("temperature" in calls[0].body, false);
  assert.equal("budget_tokens" in calls[0].body.thinking, false);

  assert.deepEqual(r.json, { a: "b" });
  assert.equal(r.stop_reason, "end_turn");
  assert.equal(r.model, "claude-opus-5");
  assert.deepEqual(r.usage, { input_tokens: 10, output_tokens: 20 });
});

test("STUDIO_CLAUDE_MODEL と model 引数が効く。schema 無しなら format を送らない", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.STUDIO_CLAUDE_MODEL = "claude-opus-5-env";
  mockFetch(() => ok("前置き\n```json\n{\"x\":1}\n```"));

  const r = await callClaude({ system: "s", messages: [{ role: "user", content: "hi" }], effort: "medium" });
  assert.equal(calls[0].body.model, "claude-opus-5-env");
  assert.deepEqual(calls[0].body.output_config, { effort: "medium" });
  assert.deepEqual(r.json, { x: 1 });

  await callClaude({ system: "s", messages: [{ role: "user", content: "hi" }], model: "claude-sonnet-5" });
  assert.equal(calls[1].body.model, "claude-sonnet-5");
  delete process.env.STUDIO_CLAUDE_MODEL;
});

test("400 で output_config/format が拒否されたら format を外して 1 回だけ再送する", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.STUDIO_CLAUDE_MODEL;
  mockFetch((body, n) => {
    if (n === 1) {
      assert.ok(body.output_config.format, "1回目は format 付き");
      return { status: 400, json: { error: { message: "output_config.format: unsupported field" } } };
    }
    assert.equal(body.output_config.format, undefined, "2回目は format 無し");
    return ok('{"fallback":true}');
  });

  const r = await callClaude({
    system: "s",
    messages: [{ role: "user", content: "hi" }],
    schema: { type: "object", additionalProperties: false, required: [], properties: {} },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(r.json, { fallback: true });
});

test("refusal はエラーとして日本語で伝える", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  mockFetch(() => ({
    status: 200,
    json: { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "危険な依頼です" }, content: [] },
  }));

  await assert.rejects(
    () => callClaude({ system: "s", messages: [{ role: "user", content: "hi" }] }),
    (e) => {
      assert.match(e.message, /モデルが回答を拒否しました: 危険な依頼です/);
      assert.equal(e.status, 422);
      return true;
    },
  );
});

test("429 / 529 / 5xx は .status 付きの Error になる", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  for (const status of [429, 529, 500]) {
    mockFetch(() => ({ status, json: { error: { message: `upstream ${status}` } } }));
    await assert.rejects(
      () => callClaude({ system: "s", messages: [{ role: "user", content: "hi" }] }),
      (e) => e.status === status,
    );
  }
});

test("ANTHROPIC_API_KEY が無ければ status 500 のエラー", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(
    () => callClaude({ system: "s", messages: [{ role: "user", content: "hi" }] }),
    (e) => e.status === 500 && /ANTHROPIC_API_KEY is not configured/.test(e.message),
  );
  process.env.ANTHROPIC_API_KEY = saved;
});

test("imageBlock は base64 と url の両方を作れる", () => {
  assert.deepEqual(imageBlock({ base64: "AAA", mime: "image/png" }), {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: "AAA" },
  });
  assert.deepEqual(imageBlock({ url: "https://example.com/a.png" }), {
    type: "image",
    source: { type: "url", url: "https://example.com/a.png" },
  });
  assert.throws(() => imageBlock({}));
});

test("extractJson はフェンス・前置き・文字列内の括弧に耐える", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('はい。\n{"a":"}"}\nでした'), { a: "}" });
  assert.deepEqual(extractJson("前置き [1,2,3] 後書き"), [1, 2, 3]);
  assert.equal(extractJson("JSON はありません"), null);
});
