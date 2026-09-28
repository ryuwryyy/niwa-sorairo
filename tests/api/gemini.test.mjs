import test from "node:test";
import assert from "node:assert/strict";
import {
  generateImages,
  buildBody,
  parseResponse,
  refLegend,
  defaultModelId,
  MODELS,
  ASPECT_RATIOS,
} from "../../server/lib/gemini.js";

const realFetch = globalThis.fetch;
const calls = [];

function mockFetch(responder, delayMs = 0) {
  calls.length = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const r = responder(body, calls.length);
    return {
      status: r.status ?? 200,
      headers: { get: (k) => (k.toLowerCase() === "retry-after" ? r.retryAfter ?? null : null) },
      text: async () => JSON.stringify(r.json ?? {}),
    };
  };
}

const imageResponse = (data = "AAAA") => ({
  status: 200,
  json: {
    candidates: [
      {
        content: { role: "model", parts: [{ inlineData: { mimeType: "image/png", data } }] },
        finishReason: "STOP",
      },
    ],
    modelVersion: "gemini-3.1-flash-image",
  },
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("promptGuide.json からモデル一覧とアスペクト比を読める", () => {
  assert.ok(MODELS.length >= 4);
  assert.ok(MODELS.some((m) => m.id === "gemini-2.5-flash-image"));
  assert.ok(ASPECT_RATIOS.includes("16:9"));
  assert.ok(ASPECT_RATIOS.includes("21:9"));
});

test("既定モデルは環境変数 → promptGuide の default の順", () => {
  delete process.env.GEMINI_IMAGE_MODEL;
  assert.equal(defaultModelId(), "gemini-3.1-flash-image");
  process.env.GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
  assert.equal(defaultModelId(), "gemini-2.5-flash-image");
  process.env.GEMINI_IMAGE_MODEL = "not-a-real-model"; // allowlist 外は無視
  assert.equal(defaultModelId(), "gemini-3.1-flash-image");
  delete process.env.GEMINI_IMAGE_MODEL;
});

test("buildBody: inline_data → text の順で parts を組み、imageConfig.aspectRatio を入れる", () => {
  const body = buildBody({
    prompt: "A quiet poster.",
    refs: [
      { base64: "R1", mime: "image/png", role: "composition" },
      { base64: "R2", mime: "image/jpeg", role: "palette" },
    ],
    aspect: "16:9",
    size: "2K",
    supportsImageSize: true,
  });

  assert.equal(body.contents[0].role, "user");
  assert.deepEqual(body.contents[0].parts[0], { inline_data: { mime_type: "image/png", data: "R1" } });
  assert.deepEqual(body.contents[0].parts[1], { inline_data: { mime_type: "image/jpeg", data: "R2" } });
  const text = body.contents[0].parts[2].text;
  assert.match(text, /Reference image 1 = composition and framing only/);
  assert.match(text, /Reference image 2 = colour palette only/);
  assert.ok(text.endsWith("A quiet poster."));

  assert.deepEqual(body.generationConfig.responseModalities, ["IMAGE"]);
  assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "16:9", imageSize: "2K" });
});

test("supportsImageSize=false のモデルには imageSize を渡さない", () => {
  const body = buildBody({ prompt: "x", aspect: "1:1", size: "2K", supportsImageSize: false });
  assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "1:1" });
});

test("refLegend は役割ごとの凡例を組み立てる", () => {
  assert.equal(refLegend([]), "");
  assert.match(refLegend([{ role: "lighting" }]), /Reference image 1 = lighting direction/);
});

test("エンドポイント・ヘッダが正しい", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  delete process.env.GEMINI_IMAGE_MODEL;
  mockFetch(() => imageResponse());

  const out = await generateImages({ prompt: "hello", aspect: "16:9" });
  assert.equal(
    calls[0].url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent",
  );
  assert.equal(calls[0].init.headers["x-goog-api-key"], "gkey");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(out.images, [{ base64: "AAAA", mime: "image/png" }]);
  assert.equal(out.model, "gemini-3.1-flash-image");
});

test("maxRefImages でモデルごとに参照枚数を切り詰める", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  const refs = Array.from({ length: 10 }, (_, i) => ({ base64: `R${i}`, mime: "image/png", role: "mood" }));

  mockFetch(() => imageResponse());
  await generateImages({ prompt: "x", refs, model: "gemini-2.5-flash-image" }); // maxRefImages: 3
  assert.equal(calls[0].body.contents[0].parts.filter((p) => p.inline_data).length, 3);

  mockFetch(() => imageResponse());
  await generateImages({ prompt: "x", refs, model: "gemini-3.1-flash-image" }); // maxRefImages: 14
  assert.equal(calls[0].body.contents[0].parts.filter((p) => p.inline_data).length, 10);
});

test("allowlist 外のモデル ID は既定モデルに落とす", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  delete process.env.GEMINI_IMAGE_MODEL;
  mockFetch(() => imageResponse());
  const out = await generateImages({ prompt: "x", model: "../../etc/passwd" });
  assert.equal(out.model, "gemini-3.1-flash-image");
  assert.match(calls[0].url, /gemini-3\.1-flash-image:generateContent$/);
});

test("モデルが対応しないアスペクト比は先頭の対応比に落とす", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  mockFetch(() => imageResponse());
  await generateImages({ prompt: "x", aspect: "1:8", model: "gemini-2.5-flash-image" });
  assert.equal(calls[0].body.generationConfig.imageConfig.aspectRatio, "1:1");
});

test("parseResponse: promptFeedback.blockReason → blocked", () => {
  const out = parseResponse({ promptFeedback: { blockReason: "IMAGE_SAFETY" } });
  assert.equal(out.blocked, true);
  assert.equal(out.code, "IMAGE_SAFETY");
  assert.match(out.reason, /安全フィルタ/);
});

test("parseResponse: finishReason が画像失敗系 → blocked", () => {
  const out = parseResponse({ candidates: [{ finishReason: "IMAGE_PROHIBITED_CONTENT" }] });
  assert.equal(out.blocked, true);
  assert.match(out.reason, /禁止/);
});

test("parseResponse: 画像パートが無い（テキストだけ）→ blocked + text", () => {
  const out = parseResponse({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: "指示が曖昧です" }] } }],
  });
  assert.equal(out.blocked, true);
  assert.equal(out.text, "指示が曖昧です");
  assert.match(out.reason, /モデルが画像を返しませんでした/);
});

test("parseResponse: thought パートは読み飛ばす", () => {
  const out = parseResponse({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: "考え中", thought: true }, { inlineData: { mimeType: "image/webp", data: "Z" } }] },
      },
    ],
  });
  assert.deepEqual(out.images, [{ base64: "Z", mime: "image/webp" }]);
  assert.equal(out.text, "");
});

test("ブロックされたら { images: [], blocked: true, reason } を返す", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  mockFetch(() => ({ status: 200, json: { promptFeedback: { blockReason: "SAFETY" } } }));
  const out = await generateImages({ prompt: "x" });
  assert.deepEqual(out.images, []);
  assert.equal(out.blocked, true);
  assert.match(out.reason, /安全フィルタ/);
});

test("n>1 は逐次リクエストし、全部揃えば partial を付けない", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  mockFetch((_b, n) => imageResponse(`IMG${n}`));
  const out = await generateImages({ prompt: "x", n: 3 });
  assert.equal(calls.length, 3);
  assert.deepEqual(out.images.map((i) => i.base64), ["IMG1", "IMG2", "IMG3"]);
  assert.equal(out.partial, undefined);
});

test("時間予算が尽きたら間に合った分だけ partial:true で返す", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  // 1 回目で 50ms 使うと残りが 6000ms を切るので、2 回目には進まない
  mockFetch(() => imageResponse(), 50);
  const out = await generateImages({ prompt: "x", n: 4, budgetMs: 6_030 });
  assert.equal(calls.length, 1);
  assert.equal(out.partial, true);
  assert.equal(out.images.length, 1);
});

test("429 は 1 回だけ再試行する", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  mockFetch((_b, n) => (n === 1 ? { status: 429, json: { error: { message: "rate" } }, retryAfter: "1" } : imageResponse()));
  const out = await generateImages({ prompt: "x" });
  assert.equal(calls.length, 2);
  assert.equal(out.images.length, 1);
});

test("日次クォータ切れ(429 per day)は即座に諦める", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  mockFetch(() => ({ status: 429, json: { error: { message: "Quota exceeded per day" } } }));
  await assert.rejects(() => generateImages({ prompt: "x" }), (e) => e.status === 429);
  assert.equal(calls.length, 1);
});

test("400/403 は再試行せずそのまま投げる", async () => {
  process.env.GEMINI_API_KEY = "gkey";
  mockFetch(() => ({ status: 400, json: { error: { message: "imageConfig unsupported" } } }));
  await assert.rejects(() => generateImages({ prompt: "x" }), (e) => e.status === 400);
  assert.equal(calls.length, 1);
});

test("GEMINI_API_KEY が無ければ status 500", async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    () => generateImages({ prompt: "x" }),
    (e) => e.status === 500 && /GEMINI_API_KEY is not configured/.test(e.message),
  );
  process.env.GEMINI_API_KEY = saved;
});
