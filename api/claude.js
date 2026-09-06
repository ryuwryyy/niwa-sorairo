/**
 * Vercel Serverless — Claude API 中継
 *
 * APIキーはここに書かない。Vercel の Environment Variables に
 * ANTHROPIC_API_KEY を設定する（VITE_ 接頭辞は付けない）。
 *
 * フロントは従来どおり /api/claude を叩くだけなので、キーはブラウザに出ない。
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: "ANTHROPIC_API_KEY is not configured on the server" },
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  // 濫用防止: モデルとトークン上限をサーバー側で固定
  const safe = {
    model: "claude-sonnet-4-6",
    max_tokens: Math.min(Number(body.max_tokens) || 1000, 2000),
    messages: body.messages,
  };

  if (!Array.isArray(safe.messages) || safe.messages.length === 0) {
    return res.status(400).json({ error: { message: "messages required" } });
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(safe),
  });

  const data = await upstream.text();
  res.status(upstream.status);
  res.setHeader("Content-Type", "application/json");
  return res.send(data);
}
