// /api/analyze(Claude)を叩く。キーはサーバー側(api/_analyze-core.js)にしかない

export class NoClaudeKeyError extends Error {
  constructor() { super("ANTHROPIC_API_KEY がサーバーに設定されていません"); }
}

export async function analyze(task, payload, signal) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, ...payload }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 501 && data?.error?.code === "no_key") throw new NoClaudeKeyError();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data.result;
}

/** Claude に渡す投稿の形(本文は長すぎると切る) */
export const forClaude = (rows) =>
  rows.map((r) => ({ id: r.id, text: r.text.slice(0, 400), tags: r.tags || [], feeling: r.feeling }));
