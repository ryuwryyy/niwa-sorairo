/**
 * Vercel Serverless — Brave Search API 中継(X / Instagram の公開投稿を探す)
 *
 * キーは Vercel の Environment Variables に BRAVE_API_KEY として置く(VITE_ は付けない)。
 */
import { handleBraveRequest } from "./_brave-core.js";
import { applyCors } from "./_cors.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }
  const { status, body } = await handleBraveRequest(req.body, process.env);
  return res.status(status).json(body);
}
