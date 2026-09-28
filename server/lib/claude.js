/**
 * Claude (Anthropic Messages API) 呼び出しの共有ロジック。
 *
 * - キーは process.env.ANTHROPIC_API_KEY のみ。ログには絶対に出さない。
 * - claude-opus-5 の作法（2026-09 時点で検証済み）:
 *     thinking: { type: "adaptive" }   ← budget_tokens は 400 になる
 *     temperature / top_p は送らない   ← 400 になる
 *     assistant prefill は使えない
 *     構造化出力は output_config.format = { type: "json_schema", schema }
 *     stop_reason === "refusal" のとき stop_details.explanation に理由が入る
 * - スキーマは再帰不可。オブジェクトには必ず additionalProperties:false と required を付ける。
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_TIMEOUT_MS = 55_000; // Vercel の 60 秒上限の内側に収める

/** 画像ブロック（base64 か URL）。Claude の content 配列にそのまま入れる */
export function imageBlock({ base64, mime, url } = {}) {
  if (base64) {
    return {
      type: "image",
      source: { type: "base64", media_type: mime || "image/jpeg", data: base64 },
    };
  }
  if (url) return { type: "image", source: { type: "url", url } };
  throw new Error("imageBlock には base64 か url が必要です");
}

/** ```json フェンスや前置きを許容して、最初の {…} / […] を取り出す */
export function extractJson(text) {
  const raw = String(text || "");
  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(raw);
  const body = fenced ? fenced[1] : raw;

  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(body.trim());
  if (direct !== undefined) return direct;

  // 文字列リテラル内の括弧を数えないように走査する
  for (let i = 0; i < body.length; i += 1) {
    const open = body[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < body.length; j += 1) {
      const c = body[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) {
          const parsed = tryParse(body.slice(i, j + 1));
          if (parsed !== undefined) return parsed;
          break;
        }
      }
    }
  }
  return null;
}

function upstreamError(status, payload) {
  const message =
    payload?.error?.message || (typeof payload === "string" ? payload.slice(0, 400) : `Anthropic ${status}`);
  const err = new Error(message);
  err.status = status;
  return err;
}

async function postOnce(apiKey, body, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* HTML のエラーページ等 */
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} o
 * @param {string}   o.system     システムプロンプト（JA 可）
 * @param {Array}    o.messages   Messages API の messages
 * @param {object=}  o.schema     構造化出力の JSON Schema（再帰不可）
 * @param {string=}  o.effort     "low" | "medium" | "high" | "xhigh" | "max"
 * @param {number=}  o.maxTokens
 * @param {string=}  o.model
 * @param {number=}  o.timeoutMs
 * @returns {Promise<{ text: string, json: any, usage: object|null, model: string, stop_reason: string|null }>}
 */
export async function callClaude({
  system,
  messages,
  schema,
  effort = "high",
  maxTokens = 8000,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error("ANTHROPIC_API_KEY is not configured on the server");
    err.status = 500;
    throw err;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages required");
  }

  const chosenModel = model || process.env.STUDIO_CLAUDE_MODEL || DEFAULT_MODEL;
  const build = (withFormat) => ({
    model: chosenModel,
    max_tokens: maxTokens,
    system,
    messages,
    thinking: { type: "adaptive" },
    output_config: {
      effort,
      ...(withFormat && schema ? { format: { type: "json_schema", schema } } : {}),
    },
  });

  const started = Date.now();
  let useFormat = Boolean(schema);
  let res;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 1_000) break;
    try {
      res = await postOnce(apiKey, build(useFormat), remaining);
    } catch (e) {
      if (e?.name === "AbortError") {
        const err = new Error("Claude への接続がタイムアウトしました");
        err.status = 504;
        throw err;
      }
      throw e;
    }

    // 古いプロキシ等が output_config / format を知らない場合は、1 回だけ外して再送する
    const msg = String(res.json?.error?.message || res.text || "");
    if (res.status === 400 && useFormat && /output_config|format|json_schema/i.test(msg)) {
      useFormat = false;
      continue;
    }
    break;
  }

  if (!res) {
    const err = new Error("Claude への接続がタイムアウトしました");
    err.status = 504;
    throw err;
  }
  if (res.status !== 200) throw upstreamError(res.status, res.json ?? res.text);

  const data = res.json || {};
  if (data.stop_reason === "refusal") {
    const why = data.stop_details?.explanation || data.stop_details?.category || "理由の説明はありません";
    const err = new Error(`モデルが回答を拒否しました: ${why}`);
    err.status = 422;
    throw err;
  }

  const blocks = Array.isArray(data.content) ? data.content : [];
  const textBlocks = blocks.filter((b) => b?.type === "text" && typeof b.text === "string");
  const text = textBlocks.map((b) => b.text).join("");
  const first = textBlocks[0]?.text ?? "";

  let json = null;
  if (first) {
    if (useFormat) {
      try {
        json = JSON.parse(first);
      } catch {
        json = extractJson(first);
      }
    } else {
      json = extractJson(first);
    }
  }

  return {
    text,
    json,
    usage: data.usage || null,
    model: data.model || chosenModel,
    stop_reason: data.stop_reason ?? null,
  };
}

export default callClaude;
