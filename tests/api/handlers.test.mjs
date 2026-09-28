/**
 * api/studio/*.js を devApi のシム（res.status().json() / res.setHeader / res.send）で直接叩く。
 */
import test from "node:test";
import assert from "node:assert/strict";
import dnsPromises from "node:dns/promises";
import aiHandler from "../../api/studio/ai.js";
import generateHandler from "../../api/studio/generate.js";
import imageHandler from "../../api/studio/image.js";
import statusHandler from "../../api/studio/status.js";
import searchHandler from "../../api/studio/search.js";
import { validateSpec, DEFAULT_TOKENS, REQUIRED_COMPONENTS } from "../../server/lib/aiOps.js";

const realFetch = globalThis.fetch;
const calls = [];

function fakeRes() {
  return {
    code: 0,
    payload: null,
    headers: {},
    ended: false,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.code = c;
      return this;
    },
    json(o) {
      this.payload = o;
      this.ended = true;
      return this;
    },
    send(b) {
      this.payload = b;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function mockFetch(responder) {
  calls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), init, body });
    const r = responder(String(url), calls.length, body);
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: { get: (k) => r.headers?.[String(k).toLowerCase()] ?? null },
      text: async () => (typeof r.text === "string" ? r.text : JSON.stringify(r.json ?? {})),
      body: r.bytes
        ? {
            getReader: () => {
              let done = false;
              return {
                read: async () => (done ? { done: true } : ((done = true), { done: false, value: new Uint8Array(r.bytes) })),
                cancel: async () => {},
              };
            },
          }
        : null,
      arrayBuffer: async () => Buffer.from(r.bytes || []),
    };
  };
}

const ENV = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GEMINI_IMAGE_MODEL",
  "STUDIO_CLAUDE_MODEL",
  "PINTEREST_ACCESS_TOKEN",
  "ADOBE_STOCK_API_KEY",
  "GOOGLE_CSE_KEY",
  "GOOGLE_CSE_CX",
  "BRAVE_SEARCH_API_KEY",
  "BRAVE_API_KEY",
  "VERCEL",
];
const saved = {};
const realLookup = dnsPromises.lookup;

test.beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // ネットワーク非依存にする（safeFetch は呼び出し時に dnsPromises.lookup を読む）
  dnsPromises.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
  dnsPromises.lookup = realLookup;
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

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

/* ---------------- status ---------------- */

test("status: キーの有無だけを返し、値は返さない", async () => {
  process.env.ANTHROPIC_API_KEY = "secret-anthropic";
  process.env.GOOGLE_CSE_KEY = "secret-cse";
  const res = await call(statusHandler, { method: "GET" });
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload, {
    claude: true,
    gemini: false,
    pinterest: false,
    adobe: false,
    cse: false, // CX が無いので false
    brave: false,
    geminiModel: "gemini-3.1-flash-image",
    claudeModel: "claude-opus-5",
  });
  assert.equal(JSON.stringify(res.payload).includes("secret"), false);
});

test("status: CSE は KEY と CX の両方が要る / モデル既定が反映される", async () => {
  process.env.GOOGLE_CSE_KEY = "K";
  process.env.GOOGLE_CSE_CX = "CX";
  process.env.BRAVE_SEARCH_API_KEY = "BK";
  process.env.GEMINI_IMAGE_MODEL = "gemini-3-pro-image";
  process.env.STUDIO_CLAUDE_MODEL = "claude-opus-5";
  const res = await call(statusHandler, { method: "GET" });
  assert.equal(res.payload.cse, true);
  assert.equal(res.payload.brave, true);
  assert.equal(res.payload.geminiModel, "gemini-3-pro-image");
});

test("status: POST は 405", async () => {
  const res = await call(statusHandler, { method: "POST" });
  assert.equal(res.code, 405);
  assert.deepEqual(res.payload, { error: { message: "Method Not Allowed" } });
});

/* ---------------- ai ---------------- */

test("ai: GET は 405、キー未設定は 500、未知の op は 400", async () => {
  let res = await call(aiHandler, { method: "GET" });
  assert.equal(res.code, 405);

  res = await call(aiHandler, { method: "POST", body: { op: "brief" } });
  assert.equal(res.code, 500);
  assert.match(res.payload.error.message, /ANTHROPIC_API_KEY is not configured/);

  process.env.ANTHROPIC_API_KEY = "K";
  res = await call(aiHandler, { method: "POST", body: { op: "nope" } });
  assert.equal(res.code, 400);
  assert.match(res.payload.error.message, /unknown op/);
});

test("ai brief: 契約どおりの形を返し、chosen をちょうど1本に補正する", async () => {
  process.env.ANTHROPIC_API_KEY = "K";
  const model = {
    issueTree: [{ id: "1", text: "誰に", children: [{ id: "1a", text: "既存客", children: [] }] }],
    hypotheses: [
      { id: "h1", text: "A", evidence: "e", confidence: 70, chosen: true },
      { id: "h2", text: "B", evidence: "e", confidence: 40, chosen: true },
      { id: "h3", text: "C", evidence: "e", confidence: 20, chosen: false },
    ],
    hmw: ["HMW 1", "HMW 2", "HMW 3"],
    brief: {
      problem: "p",
      insight: "i",
      audience: "a",
      promise: "pr",
      tone: ["静謐", "誠実", "余白"],
      oneLiner: "〜を、〜に、〜によって",
      lighthouse: "問い？",
      successCriteria: ["3ヶ月で+10%", "指名検索2倍"],
    },
  };
  mockFetch(() => claudeOk(model));

  const res = await call(aiHandler, {
    method: "POST",
    body: { op: "brief", context: "文脈", audience: "対象", constraints: "制約", deliverable: "kv", frames: { f1: { a: "b" } } },
  });
  assert.equal(res.code, 200);
  assert.equal(res.payload.hypotheses.filter((h) => h.chosen).length, 1);
  assert.equal(res.payload.hypotheses[0].chosen, true);
  assert.equal(res.payload.brief.oneLiner, "〜を、〜に、〜によって");

  // effort=high / 構造化出力 / frames が本文に入っている
  assert.equal(calls[0].body.output_config.effort, "high");
  assert.equal(calls[0].body.output_config.format.type, "json_schema");
  assert.deepEqual(calls[0].body.thinking, { type: "adaptive" });
  assert.match(calls[0].body.messages[0].content[0].text, /ワークショップ回答/);
});

test("ai principles: Adobe Stock 素材は規約上 400 で拒否する", async () => {
  process.env.ANTHROPIC_API_KEY = "K";
  mockFetch(() => claudeOk({}));
  const res = await call(aiHandler, {
    method: "POST",
    body: { op: "principles", source: "adobe", role: "palette", image: { base64: "AAA", mime: "image/png" } },
  });
  assert.equal(res.code, 400);
  assert.match(res.payload.error.message, /Adobe Stock 素材は利用規約により AI 解析に使えません/);
  assert.equal(calls.length, 0);
});

test("ai principles: 画像を base64 ブロックで渡し effort=medium", async () => {
  process.env.ANTHROPIC_API_KEY = "K";
  const out = { principles: ["a", "b", "c"], toneWords: ["x", "y", "z"], palette: ["#112233", "#445566", "#778899"], summaryJa: "説明" };
  mockFetch(() => claudeOk(out));
  const res = await call(aiHandler, {
    method: "POST",
    body: { op: "principles", source: "upload", role: "composition", image: { base64: "AAA", mime: "image/png" } },
  });
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload, out);
  assert.deepEqual(calls[0].body.messages[0].content[0], {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: "AAA" },
  });
  assert.equal(calls[0].body.output_config.effort, "medium");
});

test("ai critique: total をスコアの合計に補正する", async () => {
  process.env.ANTHROPIC_API_KEY = "K";
  mockFetch(() =>
    claudeOk({
      scores: { concept: 4, composition: 3, hierarchy: 3, color: 4, craft: 2, brand: 3 },
      total: 99, // わざと不整合
      notes: ["a", "b", "c"],
      revisions: [
        { title: "t1", editInstruction: "Relight …", promptPatch: "…" },
        { title: "t2", editInstruction: "Replace …", promptPatch: "…" },
        { title: "t3", editInstruction: "Remove …", promptPatch: "…" },
      ],
    }),
  );
  const res = await call(aiHandler, {
    method: "POST",
    body: { op: "critique", image: { base64: "AAA", mime: "image/jpeg" }, brief: {}, prompt: "p", direction: {} },
  });
  assert.equal(res.code, 200);
  assert.equal(res.payload.total, 19);
  assert.equal(res.payload.revisions.length, 3);
  assert.equal(calls[0].body.output_config.effort, "high");
});

test("ai figmaSpec: 構造化出力を使わず本文の JSON を検証・既定値で補完する", async () => {
  process.env.ANTHROPIC_API_KEY = "K";
  const spec = {
    version: 1,
    name: "案件",
    tokens: { color: { primary: "#102030" } },
    components: REQUIRED_COMPONENTS.map((name) => ({ id: name.toLowerCase(), name, props: {}, variants: [] })),
  };
  mockFetch(() => claudeOk("```json\n" + JSON.stringify(spec) + "\n```"));

  const res = await call(aiHandler, {
    method: "POST",
    body: { op: "figmaSpec", palette: ["#102030"], brief: {}, deliverable: "kv" },
  });
  assert.equal(res.code, 200);
  assert.equal(calls[0].body.output_config.format, undefined, "figmaSpec は構造化出力を使わない");
  assert.equal(res.payload.spec.version, 1);
  assert.equal(res.payload.spec.tokens.color.primary, "#102030");
  assert.equal(res.payload.spec.tokens.color.accent, DEFAULT_TOKENS.color.accent, "欠けた色は既定値");
  assert.equal(res.payload.spec.tokens.type.family, "Noto Sans JP");
  assert.equal(res.payload.spec.tokens.type.displayFamily, "Shippori Mincho");
  assert.equal(res.payload.warning, undefined);
});

test("ai figmaSpec: spec が不正なら下書きをそのまま返し warning を付ける", async () => {
  process.env.ANTHROPIC_API_KEY = "K";
  mockFetch(() => claudeOk("すみません、JSON を作れませんでした。"));
  const draft = { version: 1, name: "下書き", tokens: {}, components: [{ id: "b", name: "Button" }] };
  const res = await call(aiHandler, { method: "POST", body: { op: "figmaSpec", palette: [], spec: draft } });
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload.spec, draft);
  assert.match(res.payload.warning, /下書き/);
});

test("ai: 巨大な base64 は 413 で弾く", async () => {
  process.env.ANTHROPIC_API_KEY = "K";
  mockFetch(() => claudeOk({}));
  const res = await call(aiHandler, {
    method: "POST",
    body: { op: "principles", source: "upload", role: "mood", image: { base64: "A".repeat(6_000_001), mime: "image/png" } },
  });
  assert.equal(res.code, 413);
  assert.equal(calls.length, 0);
});

test("ai: Claude が拒否したら 422 で日本語メッセージを返す", async () => {
  process.env.ANTHROPIC_API_KEY = "K";
  mockFetch(() => ({
    status: 200,
    json: { stop_reason: "refusal", stop_details: { explanation: "その依頼には応じられません" }, content: [] },
  }));
  const res = await call(aiHandler, { method: "POST", body: { op: "brief", context: "x" } });
  assert.equal(res.code, 422);
  assert.match(res.payload.error.message, /モデルが回答を拒否しました/);
});

test("validateSpec: components が無ければ失敗", () => {
  assert.equal(validateSpec({ version: 1, tokens: {} }).ok, false);
  assert.equal(validateSpec(null).ok, false);
  const v = validateSpec({ version: 1, components: [{ id: "b", name: "Button" }] });
  assert.equal(v.ok, true);
  assert.match(v.warning, /Tag/); // 不足コンポーネントを警告
});

/* ---------------- generate ---------------- */

const geminiOk = { status: 200, json: { candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: "IMG" } }] } }] } };

test("generate: GET は 405、キー未設定は 500", async () => {
  let res = await call(generateHandler, { method: "GET" });
  assert.equal(res.code, 405);
  res = await call(generateHandler, { method: "POST", body: { prompt: "x" } });
  assert.equal(res.code, 500);
  assert.match(res.payload.error.message, /GEMINI_API_KEY is not configured/);
});

test("generate: 入力検証（prompt 空 / 長すぎ / refs 多すぎ / aspect / model / n）", async () => {
  process.env.GEMINI_API_KEY = "GK";
  mockFetch(() => geminiOk);
  const bad = async (body) => (await call(generateHandler, { method: "POST", body })).code;

  assert.equal(await bad({ prompt: "  " }), 400);
  assert.equal(await bad({ prompt: "x".repeat(6001) }), 400);
  assert.equal(await bad({ prompt: "x", refs: Array.from({ length: 15 }, () => ({ base64: "A" })) }), 400);
  assert.equal(await bad({ prompt: "x", refs: [{ base64: "A".repeat(6_000_001) }] }), 413);
  assert.equal(await bad({ prompt: "x", aspect: "7:3" }), 400);
  assert.equal(await bad({ prompt: "x", model: "evil-model" }), 400);
  assert.equal(await bad({ prompt: "x", n: 9 }), 400);
  assert.equal(calls.length, 0);
});

test("generate: 正常系は { images, model } を返す", async () => {
  process.env.GEMINI_API_KEY = "GK";
  mockFetch(() => geminiOk);
  const res = await call(generateHandler, {
    method: "POST",
    body: { prompt: "A quiet poster", refs: [{ base64: "R1", mime: "image/png", role: "palette" }], aspect: "2:3", n: 1, size: "2K" },
  });
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload.images, [{ base64: "IMG", mime: "image/png" }]);
  assert.equal(res.payload.model, "gemini-3.1-flash-image");
  assert.equal(calls[0].body.generationConfig.imageConfig.aspectRatio, "2:3");
  assert.equal(calls[0].body.generationConfig.imageConfig.imageSize, "2K");
});

test("generate: ブロックは 200 + blocked/reason で返す", async () => {
  process.env.GEMINI_API_KEY = "GK";
  mockFetch(() => ({ status: 200, json: { promptFeedback: { blockReason: "IMAGE_SAFETY" } } }));
  const res = await call(generateHandler, { method: "POST", body: { prompt: "x" } });
  assert.equal(res.code, 200);
  assert.equal(res.payload.blocked, true);
  assert.match(res.payload.reason, /安全フィルタ/);
});

test("generate: Vercel 上では 4.5MB を超える生成画像を 413 で止める（ローカルは素通し）", async () => {
  process.env.GEMINI_API_KEY = "GK";
  const big = { status: 200, json: { candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: "A".repeat(4_600_000) } }] } }] } };

  mockFetch(() => big);
  let res = await call(generateHandler, { method: "POST", body: { prompt: "x" } });
  assert.equal(res.code, 200, "ローカル開発では通す");

  process.env.VERCEL = "1";
  mockFetch(() => big);
  res = await call(generateHandler, { method: "POST", body: { prompt: "x" } });
  assert.equal(res.code, 413);
  assert.match(res.payload.error.message, /応答上限\(4\.5MB\)/);
});

/* ---------------- image プロキシ ---------------- */

test("image: POST は 405、url 無しは 400", async () => {
  let res = await call(imageHandler, { method: "POST", query: {} });
  assert.equal(res.code, 405);
  res = await call(imageHandler, { method: "GET", query: {} });
  assert.equal(res.code, 400);
});

test("image: 内部宛 URL は 400 で拒否する", async () => {
  for (const url of ["http://127.0.0.1/x", "http://169.254.169.254/", "http://[::1]/", "http://localhost/a.png", "file:///etc/passwd"]) {
    const res = await call(imageHandler, { method: "GET", query: { url } });
    assert.equal(res.code, 400, url);
    assert.ok(res.payload.error.message);
  }
});

test("image: 公開画像はヘッダ付きでバイト列を返す", async () => {
  const bytes = Buffer.from([1, 2, 3, 4]);
  mockFetch(() => ({ status: 200, headers: { "content-type": "image/jpeg" }, bytes }));
  const res = await call(imageHandler, { method: "GET", query: { url: "https://t4.ftcdn.net/240_x.jpg" } });
  assert.equal(res.code, 200);
  assert.deepEqual([...res.payload], [...bytes]);
  assert.equal(res.headers["Content-Type"], "image/jpeg");
  assert.equal(res.headers["Cache-Control"], "public, max-age=86400");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
});

test("image: 上流失敗は 502、画像でなければ 415", async () => {
  mockFetch(() => ({ status: 500, headers: { "content-type": "text/plain" } }));
  let res = await call(imageHandler, { method: "GET", query: { url: "https://t4.ftcdn.net/a.jpg" } });
  assert.equal(res.code, 502);

  mockFetch(() => ({ status: 200, headers: { "content-type": "text/html" }, bytes: Buffer.from("<html>") }));
  res = await call(imageHandler, { method: "GET", query: { url: "https://example.com/a" } });
  assert.equal(res.code, 415);
});

/* ---------------- search: unfurl ---------------- */

const html = (extra) => `<!doctype html><html><head>
<meta property="og:title" content="静かなポスター">
${extra}
</head><body></body></html>`;

test("search unfurl: Pinterest は oEmbed を先に試す", async () => {
  mockFetch((url) => {
    if (url.includes("oembed.json")) {
      return { status: 200, json: { title: "Pin のタイトル", thumbnail_url: "https://i.pinimg.com/600x/a.jpg", thumbnail_width: 600, thumbnail_height: 900, author_name: "sorairo" } };
    }
    throw new Error("oEmbed 以外を叩いてはいけない");
  });
  const res = await call(searchHandler, { method: "POST", body: { op: "unfurl", url: "https://www.pinterest.com/pin/12345/" } });
  assert.equal(res.code, 200);
  assert.equal(res.payload.source, "pinterest");
  const it = res.payload.items[0];
  assert.equal(it.id, "12345");
  assert.equal(it.title, "Pin のタイトル");
  assert.equal(it.imageUrl, "https://i.pinimg.com/600x/a.jpg");
  assert.equal(it.pageUrl, "https://www.pinterest.com/pin/12345/");
  assert.match(it.license, /Pinterest ToS/);
});

test("search unfurl: oEmbed が落ちたら OGP へフォールバックする", async () => {
  mockFetch((url) => {
    if (url.includes("oembed.json")) return { status: 500, json: { message: "oops" } };
    return {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      bytes: Buffer.from(html('<meta property="og:image" content="https://i.pinimg.com/736x/b.jpg">'), "utf8"),
    };
  });
  const res = await call(searchHandler, { method: "POST", body: { op: "unfurl", url: "https://www.pinterest.com/pin/999/" } });
  assert.equal(res.code, 200);
  assert.equal(res.payload.items[0].imageUrl, "https://i.pinimg.com/736x/b.jpg");
  assert.equal(res.payload.items[0].title, "静かなポスター");
});

test("search unfurl: 一般 URL は og:image / twitter:image / JSON-LD の順に拾う", async () => {
  mockFetch(() => ({
    status: 200,
    headers: { "content-type": "text/html" },
    bytes: Buffer.from(html('<meta name="twitter:image" content="/rel/c.png">'), "utf8"),
  }));
  let res = await call(searchHandler, { method: "POST", body: { op: "unfurl", url: "https://blog.example.com/post" } });
  assert.equal(res.payload.source, "url");
  assert.equal(res.payload.items[0].imageUrl, "https://blog.example.com/rel/c.png", "相対 URL を絶対化する");

  mockFetch(() => ({
    status: 200,
    headers: { "content-type": "text/html" },
    bytes: Buffer.from(html('<script type="application/ld+json">{"image":"https://cdn.example.com/d.png"}</script>'), "utf8"),
  }));
  res = await call(searchHandler, { method: "POST", body: { op: "unfurl", url: "https://blog.example.com/post" } });
  assert.equal(res.payload.items[0].imageUrl, "https://cdn.example.com/d.png");
});

test("search unfurl: 内部宛 URL は 400、画像が無ければ 422", async () => {
  let res = await call(searchHandler, { method: "POST", body: { op: "unfurl", url: "http://169.254.169.254/" } });
  assert.equal(res.code, 400);

  mockFetch(() => ({ status: 200, headers: { "content-type": "text/html" }, bytes: Buffer.from(html(""), "utf8") }));
  res = await call(searchHandler, { method: "POST", body: { op: "unfurl", url: "https://blog.example.com/post" } });
  assert.equal(res.code, 422);
});
