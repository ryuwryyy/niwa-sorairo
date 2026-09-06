/**
 * Claude API 中継 Worker(Cloudflare Workers)
 *
 * 本番でAI機能を使うために必要。APIキーをブラウザに出さないための唯一の正しい形。
 *
 * デプロイ:
 *   npx wrangler secret put ANTHROPIC_API_KEY   ← キーはここにだけ入れる
 *   npx wrangler deploy worker/index.js
 *
 * デプロイ後、フロント側の .env に発行されたURLを設定:
 *   VITE_API_ENDPOINT=https://teire-api.<あなた>.workers.dev
 */

// 本番では自分のドメインに絞る(ここを "*" のままにしない)
const ALLOWED_ORIGINS = ["http://localhost:5173"];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: { message: "invalid json" } }, { status: 400, headers: cors });
    }

    // 濫用防止: モデルとトークン上限をサーバー側で固定する
    const safe = {
      model: "claude-sonnet-4-6",
      max_tokens: Math.min(body.max_tokens || 1000, 2000),
      messages: body.messages,
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(safe),
    });

    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
