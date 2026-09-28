/**
 * Vercel Serverless — 深掘りレポートの Claude 分析
 *
 * キーは既存の ANTHROPIC_API_KEY(Vercel Environment Variables)。フロントには出さない。
 */
import { handleAnalyzeRequest } from "./_analyze-core.js";
import { applyCors } from "./_cors.js";

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }
  const { status, body } = await handleAnalyzeRequest(req.body, process.env);
  return res.status(status).json(body);
}
