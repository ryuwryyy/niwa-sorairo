/**
 * Gemini 画像生成（Nano Banana 系）の共有ロジック。
 *
 * 形は docs/studio/research-image-generation.md（2026-09-18 検証）に合わせる:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent
 *   header x-goog-api-key
 *   body { contents:[{role:"user", parts:[...inline_data, {text}]}], generationConfig:{...} }
 *   レスポンスは常に camelCase（inlineData / mimeType）。
 *
 * モデル ID は studio/src/data/promptGuide.json の allowlist に限定する（任意文字列を通さない）。
 * API キーはログに出さない。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GUIDE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../studio/src/data/promptGuide.json",
);

/** @type {{models: Array, aspectRatios: Array}} */
const guide = JSON.parse(fs.readFileSync(GUIDE_PATH, "utf8"));

export const MODELS = guide.models || [];
export const ASPECT_RATIOS = (guide.aspectRatios || []).map((a) => a.id);
export const FALLBACK_MODEL = "gemini-2.5-flash-image";

export function defaultModelId() {
  const fromEnv = process.env.GEMINI_IMAGE_MODEL;
  if (fromEnv && MODELS.some((m) => m.id === fromEnv)) return fromEnv;
  return MODELS.find((m) => m.default)?.id || MODELS[0]?.id || FALLBACK_MODEL;
}

export function findModel(id) {
  return MODELS.find((m) => m.id === id) || null;
}

const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

/** 参照画像の役割 → プロンプト冒頭に置く凡例（肯定形・「何だけを見るか」を限定する） */
const ROLE_LEGEND = {
  composition: "composition and framing only — ignore its subject, colours and text",
  palette: "colour palette only — ignore its subject matter entirely",
  lighting: "lighting direction, quality and contrast only",
  texture: "surface texture and material finish only",
  typography: "typographic feeling and letterform proportion only — do not copy any words",
  mood: "overall mood and atmosphere only",
  subject: "the subject that must appear, preserving its proportions",
};

export function refLegend(refs = []) {
  const lines = refs.map((r, i) => {
    const role = ROLE_LEGEND[r?.role] || ROLE_LEGEND.mood;
    return `Reference image ${i + 1} = ${role}.`;
  });
  if (!lines.length) return "";
  return `${lines.join(" ")} Do not reproduce any logo, trademark or lettering from the reference images.\n\n`;
}

const IMAGE_FAILURE = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
  "IMAGE_RECITATION",
  "IMAGE_OTHER",
  "NO_IMAGE",
]);

const REASON_JA = {
  SAFETY: "安全フィルタに触れました。人物・暴力・露出の表現をやわらげてください。",
  RECITATION: "既存作品の再現とみなされました。固有名詞や作品名を外してください。",
  IMAGE_RECITATION: "既存作品の再現とみなされました。固有名詞や作品名を外してください。",
  BLOCKLIST: "禁止語が含まれています。プロンプトの語を言い換えてください。",
  PROHIBITED_CONTENT: "禁止されている内容と判定されました。主題を変えてください。",
  IMAGE_PROHIBITED_CONTENT: "禁止されている内容と判定されました。主題を変えてください。",
  SPII: "個人情報とみなされる内容が含まれています。",
  IMAGE_SAFETY: "画像側の安全フィルタでブロックされました。人物描写や刺激の強い表現を控えてください。",
  IMAGE_OTHER: "画像生成が中断されました。プロンプトを短くして再試行してください。",
  NO_IMAGE: "モデルが画像を返しませんでした。指示をより具体的な情景描写に書き換えてください。",
  NO_CANDIDATE: "モデルから候補が返りませんでした。時間をおいて再試行してください。",
  OTHER: "画像生成が中断されました。プロンプトを見直してください。",
};

const reasonJa = (code) => REASON_JA[code] || `画像を生成できませんでした（${code}）。`;

export function buildBody({ prompt, refs = [], aspect = "1:1", size, supportsImageSize = false }) {
  const parts = [];
  for (const r of refs) {
    parts.push({ inline_data: { mime_type: r.mime || "image/png", data: r.base64 } });
  }
  parts.push({ text: `${refLegend(refs)}${prompt}` });

  const imageConfig = { aspectRatio: aspect };
  if (size && supportsImageSize) imageConfig.imageSize = size;

  return {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };
}

/** research §2.6 の 3 段判定。{ images[], text, blocked?, reason? } を返す */
export function parseResponse(json) {
  const blockReason = json?.promptFeedback?.blockReason;
  if (blockReason) return { images: [], text: "", blocked: true, code: blockReason, reason: reasonJa(blockReason) };

  const cand = json?.candidates?.[0];
  if (!cand) return { images: [], text: "", blocked: true, code: "NO_CANDIDATE", reason: reasonJa("NO_CANDIDATE") };

  const fr = cand.finishReason;
  if (fr && IMAGE_FAILURE.has(fr)) {
    return { images: [], text: "", blocked: true, code: fr, reason: reasonJa(fr) };
  }

  const parts = cand.content?.parts || [];
  const images = [];
  const texts = [];
  for (const p of parts) {
    if (p?.thought === true) continue; // Gemini 3 系の思考パート
    if (p?.inlineData?.data) images.push({ base64: p.inlineData.data, mime: p.inlineData.mimeType || "image/png" });
    else if (typeof p?.text === "string" && p.text) texts.push(p.text);
  }
  const text = texts.join("\n");
  if (!images.length) {
    return { images: [], text, blocked: true, code: fr || "NO_IMAGE", reason: reasonJa(fr && fr !== "STOP" ? fr : "NO_IMAGE") };
  }
  return { images, text };
}

async function callOnce(model, body, apiKey, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT(model), {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON のエラーページ */
    }
    return { status: res.status, json, text, retryAfter: res.headers.get("retry-after") };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 画像を生成する。n>1 のときは時間予算内で順に叩き、間に合った分だけ返す。
 * @returns {Promise<{ images: Array<{base64,mime}>, model: string, text?: string,
 *                     blocked?: boolean, reason?: string, partial?: boolean }>}
 */
export async function generateImages({
  prompt,
  refs = [],
  aspect = "1:1",
  model,
  n = 1,
  size,
  budgetMs = 50_000,
  perCallMs = 45_000,
} = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not configured on the server");
    err.status = 500;
    throw err;
  }
  if (!prompt || !String(prompt).trim()) throw new Error("prompt required");

  const modelId = model && findModel(model) ? model : defaultModelId();
  const spec = findModel(modelId);
  const maxRefs = spec?.maxRefImages ?? 3;
  const usableRefs = (refs || []).filter((r) => r && r.base64).slice(0, maxRefs);
  const allowedAspects = spec?.aspectRatios || ASPECT_RATIOS;
  const usableAspect = allowedAspects.includes(aspect) ? aspect : allowedAspects[0] || "1:1";
  const supportsImageSize = Boolean(spec?.supportsImageSize);
  const usableSize = supportsImageSize && spec?.sizes?.includes(size) ? size : undefined;

  const body = buildBody({ prompt, refs: usableRefs, aspect: usableAspect, size: usableSize, supportsImageSize });

  const want = Math.max(1, Math.min(Number(n) || 1, 4));
  const started = Date.now();
  const images = [];
  let text = "";
  let lastBlock = null;

  for (let i = 0; i < want; i += 1) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 6_000) break;

    let out = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const left = budgetMs - (Date.now() - started);
      if (left < 5_000) break;

      let r;
      try {
        r = await callOnce(modelId, body, apiKey, Math.min(perCallMs, left - 1_000));
      } catch (e) {
        if (e?.name === "AbortError") break; // 予算切れ。再試行しても間に合わない
        throw e;
      }

      if (r.status === 200) {
        out = parseResponse(r.json);
        break;
      }
      if ([400, 401, 403, 404].includes(r.status)) {
        const err = new Error(r.json?.error?.message || `Gemini ${r.status}`);
        err.status = r.status;
        throw err;
      }
      if ([429, 500, 503, 504].includes(r.status)) {
        const msg = String(r.json?.error?.message || "").toLowerCase();
        // 日次クォータ切れは待っても回復しない
        if (r.status === 429 && (msg.includes("per day") || msg.includes("daily"))) {
          const err = new Error(r.json?.error?.message || "Gemini の本日の割り当てを使い切りました");
          err.status = 429;
          throw err;
        }
        if (attempt === 1) {
          const err = new Error(r.json?.error?.message || `Gemini ${r.status}`);
          err.status = r.status;
          throw err;
        }
        const suggested = Number(r.retryAfter) * 1000;
        const backoff = Number.isFinite(suggested) && suggested > 0 ? Math.min(suggested, 4_000) : 1_200 + Math.random() * 400;
        if (Date.now() - started + backoff > budgetMs - 8_000) break;
        await sleep(backoff);
        continue;
      }
      const err = new Error(`Gemini ${r.status}`);
      err.status = 502;
      throw err;
    }

    if (!out) break;
    if (out.text && !text) text = out.text;
    if (out.blocked) {
      lastBlock = out;
      break; // 同じプロンプトなので繰り返しても同じ結果になる
    }
    images.push(...out.images);
  }

  if (!images.length && lastBlock) {
    return { images: [], model: modelId, blocked: true, reason: lastBlock.reason, ...(text ? { text } : {}) };
  }
  if (!images.length) {
    return {
      images: [],
      model: modelId,
      blocked: true,
      reason: "時間内に画像を生成できませんでした。枚数を減らすか、軽いモデル・低い解像度で再試行してください。",
      ...(text ? { text } : {}),
    };
  }

  return {
    images,
    model: modelId,
    ...(text ? { text } : {}),
    ...(images.length < want ? { partial: true } : {}),
  };
}

export default generateImages;
