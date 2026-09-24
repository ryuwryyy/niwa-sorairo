// /api/jev を叩いて、たくさんの件数を小分けにして分類する。
// キーはサーバー側(api/_jev-core.js)にしかない。
import { demoAnswers } from "./demo.js";

const BATCH = 12;       // 1リクエストの件数(サーバー上限は25)
const PARALLEL = 2;     // 同時に投げるバッチ数

export class NoKeyError extends Error {
  constructor() { super("TYPESAFE_API_KEY がサーバーに設定されていません"); }
}

async function postBatch(items, questions, signal) {
  const res = await fetch("/api/jev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, questions }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 501 && data?.error?.code === "no_key") throw new NoKeyError();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

/**
 * @param {{id:string, state:any}[]} items
 * @param {object} questions
 * @param {{demo?: boolean, signal?: AbortSignal, onProgress?: (done:number, total:number, stats:object)=>void}} opts
 * @returns {Promise<{answers: Map<string, object>, errors: Map<string,string>, stats: object}>}
 */
export async function classifyAll(items, questions, { demo = false, signal, onProgress } = {}) {
  const answers = new Map();
  const errors = new Map();
  const stats = { model: demo ? "デモ判定(キーワード照合)" : null, requests: 0, apiMs: 0, started: performance.now(), itemMs: [] };

  const batches = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));

  let done = 0;
  const report = () => onProgress?.(done, items.length, { ...stats, wallMs: performance.now() - stats.started });

  const run = async (batch) => {
    if (demo) {
      await new Promise((r) => setTimeout(r, 60));
      for (const it of batch) answers.set(it.id, demoAnswers(it.state, questions));
    } else {
      const data = await postBatch(batch, questions, signal);
      stats.model ??= data.model;
      stats.requests += 1;
      stats.apiMs += data.ms || 0;
      for (const r of data.results || []) {
        if (r.error) errors.set(r.id, r.error);
        else { answers.set(r.id, r.answers); stats.itemMs.push(r.ms); }
      }
    }
    done += batch.length;
    report();
  };

  report();
  let next = 0;
  const lane = async () => {
    while (next < batches.length) {
      if (signal?.aborted) return;
      await run(batches[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, lane));
  return { answers, errors, stats: { ...stats, wallMs: performance.now() - stats.started } };
}

/** 中央値(1件あたりの判定時間の表示に使う) */
export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
