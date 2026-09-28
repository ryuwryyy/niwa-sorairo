/**
 * Vercel Serverless — Jev(TypeSafe AI)中継
 *
 * APIキーはここに書かない。Vercel の Environment Variables に
 * TYPESAFE_API_KEY を設定する(VITE_ 接頭辞は付けない)。
 */
import { handleJevRequest } from "./_jev-core.js";
import { applyCors } from "./_cors.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }
  const { status, body } = await handleJevRequest(req.body, process.env);
  return res.status(status).json(body);
}
