/**
 * Vercel Serverless — キーの「有無」だけを返す（値は絶対に返さない）
 *
 * GET /api/studio/status
 *   → { claude, gemini, pinterest, adobe, cse, brave, geminiModel, claudeModel }
 *
 * UI はこの bool で検索タブの出し分けをする（research §F-3）。
 */
import { defaultModelId } from "../../server/lib/gemini.js";

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    pinterest: Boolean(process.env.PINTEREST_ACCESS_TOKEN),
    adobe: Boolean(process.env.ADOBE_STOCK_API_KEY),
    cse: Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX),
    brave: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    geminiModel: defaultModelId(),
    claudeModel: process.env.STUDIO_CLAUDE_MODEL || "claude-opus-5",
  });
}
