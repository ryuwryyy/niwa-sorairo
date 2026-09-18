/**
 * Vercel Serverless — SSRF セーフな画像プロキシ（research §E）
 *
 * GET /api/studio/image?url=<外部画像URL>
 *   → 画像バイトをそのまま返す（Content-Type は取得元のもの）
 *
 * 画像は保存しない（Pinterest ToS / Adobe Stock Terms 第8条）。CDN とエッジのキャッシュだけ使う。
 * 上限は 4MB（Vercel のレスポンス上限 4.5MB の内側）。
 */
import { safeFetch, BlockedUrlError } from "../../server/lib/safeFetch.js";

export const config = { maxDuration: 15 };

const MAX_BYTES = 4 * 1024 * 1024;

const fail = (res, status, message) => res.status(status).json({ error: { message } });

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return fail(res, 405, "Method Not Allowed");

  const url = String(req.query?.url || "");
  if (!url) return fail(res, 400, "url が必要です");

  try {
    const { buffer, contentType } = await safeFetch(url, { maxBytes: MAX_BYTES });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    return res.status(200).send(buffer);
  } catch (e) {
    if (e instanceof BlockedUrlError) return fail(res, 400, e.message);
    const s = Number(e?.status);
    if (s === 413 || s === 415) return fail(res, s, e.message);
    return fail(res, 502, e?.message || "画像を取得できませんでした");
  }
}
