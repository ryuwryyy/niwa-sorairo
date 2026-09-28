/**
 * Jev(TypeSafe AI)呼び出しの本体。Vercel関数(api/jev.js)と開発サーバー(vite.config.js)の両方から使う。
 *
 * Jev は文章を生成しない「判断だけするモデル」。1件の state に対して、
 *   noul   … はい/いいえ の確率
 *   choice … 決めた選択肢から1つ + 全選択肢の確率
 *   score  … 0..n のルーブリックで期待値
 * を返す。ここでは複数件(投稿・発言)を並列に投げて、まとめて返す。
 *
 * ファイル名が _ で始まるので Vercel はこれをエンドポイントにしない。
 */
import { TypeSafeClient, APIError } from "@typesafe-ai/sdk";

// 濫用防止の上限。フロントの1バッチはこれより小さく送る
export const LIMITS = {
  items: 25,          // 1リクエストあたりの件数
  stateChars: 6000,   // 1件の state(JSON文字列化後)
  questions: 8,
  labels: 40,         // choice の選択肢数
  textChars: 1200,    // instructions / 説明文
  concurrency: 6,
};

export class InputError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

const isEntry = (v) => v === null || typeof v === "string" || typeof v === "object";
const textLen = (v) => (v == null ? 0 : (typeof v === "string" ? v : JSON.stringify(v)).length);

/** フロントから来た questions を検証し、許可したフィールドだけで組み直す */
export function sanitizeQuestions(questions) {
  if (!questions || typeof questions !== "object" || Array.isArray(questions)) {
    throw new InputError("questions must be an object");
  }
  const names = Object.keys(questions);
  if (names.length === 0) throw new InputError("at least one question is required");
  if (names.length > LIMITS.questions) throw new InputError(`too many questions (max ${LIMITS.questions})`);

  const out = {};
  for (const name of names) {
    const q = questions[name] || {};
    if (!/^[A-Za-z0-9_]{1,40}$/.test(name)) throw new InputError(`invalid question name: ${name}`);
    if (!isEntry(q.instructions ?? null) || textLen(q.instructions) > LIMITS.textChars) {
      throw new InputError(`${name}: instructions too long`);
    }
    const instructions = q.instructions ?? null;

    if (q.type === "noul") {
      const c = q.criteria || {};
      if (textLen(c.true) > LIMITS.textChars || textLen(c.false) > LIMITS.textChars) {
        throw new InputError(`${name}: criteria too long`);
      }
      out[name] = { type: "noul", instructions, criteria: { true: c.true ?? null, false: c.false ?? null } };
    } else if (q.type === "choice") {
      const c = q.criteria;
      if (!c || typeof c !== "object" || Array.isArray(c)) throw new InputError(`${name}: choice criteria must be a map`);
      const labels = Object.keys(c);
      if (labels.length < 2 || labels.length > LIMITS.labels) {
        throw new InputError(`${name}: choice needs 2..${LIMITS.labels} labels`);
      }
      const criteria = {};
      for (const label of labels) {
        if (label.length > 60 || textLen(c[label]) > LIMITS.textChars) throw new InputError(`${name}: label too long`);
        criteria[label] = c[label] ?? null;
      }
      out[name] = { type: "choice", instructions, criteria };
    } else if (q.type === "score") {
      const c = q.criteria;
      if (!Array.isArray(c) || c.length < 2 || c.length > 11) throw new InputError(`${name}: score needs 2..11 levels`);
      if (c.some((d) => textLen(d) > LIMITS.textChars)) throw new InputError(`${name}: criteria too long`);
      out[name] = { type: "score", instructions, criteria: c.map((d) => d ?? null) };
    } else {
      throw new InputError(`${name}: unknown type ${q.type}`);
    }
  }
  return out;
}

function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new InputError("items required");
  if (items.length > LIMITS.items) throw new InputError(`too many items (max ${LIMITS.items})`);
  return items.map((it, i) => {
    const id = it && (typeof it.id === "string" || typeof it.id === "number") ? String(it.id) : String(i);
    const state = it?.state ?? null;
    if (!isEntry(state)) throw new InputError(`item ${id}: invalid state`);
    if (textLen(state) > LIMITS.stateChars) throw new InputError(`item ${id}: state too long`);
    return { id, state };
  });
}

/** 並列数を絞りながら順番を保って map する */
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

/**
 * @param {{items: {id:string, state:any}[], questions: object}} body
 * @param {{apiKey: string, model?: string, fetch?: Function}} opts
 */
export async function classifyBatch(body, { apiKey, model, fetch } = {}) {
  const questions = sanitizeQuestions(body?.questions);
  const items = sanitizeItems(body?.items);

  const client = new TypeSafeClient({
    apiKey,
    defaultModel: model || "jev-latest",
    timeout: 15000,
    logLevel: "off",
    ...(fetch ? { fetch } : {}),
  });

  const started = Date.now();
  let usedModel = null;
  const usage = { input_tokens: 0, output_tokens: 0 };

  const results = await mapLimit(items, LIMITS.concurrency, async ({ id, state }) => {
    const t0 = Date.now();
    try {
      const r = await client.systemOne({ state, questions });
      usedModel ??= r.model;
      usage.input_tokens += r.usage?.input_tokens || 0;
      usage.output_tokens += r.usage?.output_tokens || 0;
      return { id, answers: r.answers, ms: Date.now() - t0 };
    } catch (err) {
      // 認証エラーは全件同じ結果になるので、バッチごと失敗させる
      if (err instanceof APIError && (err.status === 401 || err.status === 403)) throw err;
      return { id, error: err?.message || "failed", ms: Date.now() - t0 };
    }
  });

  return { model: usedModel, usage, ms: Date.now() - started, results };
}

/** Vercel / Vite 共通の JSON ハンドラ。status と body を返す */
export async function handleJevRequest(rawBody, env, fetchImpl) {
  const apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return { status: 501, body: { error: { code: "no_key", message: "TYPESAFE_API_KEY is not configured on the server" } } };
  }
  let body;
  try {
    body = typeof rawBody === "string" ? JSON.parse(rawBody || "{}") : (rawBody || {});
  } catch {
    return { status: 400, body: { error: { message: "invalid JSON" } } };
  }
  try {
    const data = await classifyBatch(body, { apiKey, model: env.TYPESAFE_MODEL, fetch: fetchImpl });
    return { status: 200, body: data };
  } catch (err) {
    const status = err instanceof InputError ? 400 : (err instanceof APIError ? err.status : 502);
    return { status, body: { error: { message: err?.message || "upstream error" } } };
  }
}
