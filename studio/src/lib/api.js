/**
 * サーバ API クライアント（契約は docs/studio/DESIGN.md 4.5）。
 * キーはここにも、フロントのどこにも書かない。
 */
const BASE = import.meta.env.VITE_STUDIO_API_BASE || "/api/studio";

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function post(path, body, { signal, timeoutMs = 90_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      throw new ApiError(data?.error?.message || `API ${res.status}`, res.status, data);
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new ApiError("時間切れ（サーバ応答なし）", 408, null);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  /** キーの有無だけを返す { claude, gemini, pinterest, adobe, cse } */
  status: () => fetch(`${BASE}/status`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),

  /** op: brief | principles | prompt | critique | figmaSpec */
  ai: (op, payload, opts) => post("ai", { op, ...payload }, opts),

  /** { prompt, refs:[{base64, mime, role}], aspect, model?, n?, size? } → { images:[{base64, mime}], model } */
  generate: (payload, opts) => post("generate", payload, { timeoutMs: 120_000, ...opts }),

  /** op: pinterest | adobe | cse | unfurl | cannesImages */
  search: (op, payload, opts) => post("search", { op, ...payload }, opts),

  /** 外部画像を SSRF ガード付きプロキシ経由で取得する URL */
  proxied: (url) => (url ? `${BASE}/image?url=${encodeURIComponent(url)}` : ""),
};

export default api;
