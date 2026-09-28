/**
 * 別ドメインの「聴く」(GitHub Pages)から /api/jev・/api/analyze を呼べるようにする。
 * 許可するのは RESEARCH_ORIGINS(カンマ区切り)に書いた配信元だけ。既定は GitHub Pages。
 */
const DEFAULT_ORIGINS = "https://ryuwryyy.github.io";

export function applyCors(req, res) {
  const allowed = (process.env.RESEARCH_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers?.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}
