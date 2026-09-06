/**
 * 植物同定 API（二段推論をサーバー側で完結）
 *
 * キーは Vercel Environment Variables の ANTHROPIC_API_KEY のみ。
 * フロントには出さない。
 */

export const config = { maxDuration: 60 };

async function callClaude(apiKey, messages, maxTokens) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: Math.min(maxTokens, 2000),
      messages,
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    const msg = data?.error?.message || `Anthropic ${upstream.status}`;
    const err = new Error(msg);
    err.status = upstream.status;
    throw err;
  }
  if (data.error) throw new Error(data.error.message || "API error");
  return (data.content || []).map((i) => (i.type === "text" ? i.text : "")).join("");
}

function parseJSON(text) {
  const clean = String(text).replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("JSON parse failed");
  return JSON.parse(clean.slice(start, end + 1));
}

export default async function handler(req, res) {
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

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const image = body.image;
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: { message: "image (base64 jpeg) required" } });
    }
    // 濫用・ペイロード上限（約1.5MBのbase64）
    if (image.length > 1_500_000) {
      return res.status(413).json({ error: { message: "image too large" } });
    }

    const imgBlock = {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: image },
    };

    const features = await callClaude(apiKey, [
      {
        role: "user",
        content: [
          imgBlock,
          {
            type: "text",
            text: "この植物写真を植物学者として観察し、形態的特徴のみを記述してください。同定はまだしない。葉序(対生/互生)、葉形と縁、葉脈、光沢、樹皮や茎、花・実の有無、樹形。箇条書き5行以内、前置きなし。",
          },
        ],
      },
    ], 400);

    const raw = await callClaude(apiKey, [
      {
        role: "user",
        content: [
          imgBlock,
          {
            type: "text",
            text: `あなたは日本の造園樹木・園芸植物の同定専門家です。写真と以下の観察所見を突き合わせ、同定してください。
【観察所見】
${features}
日本の庭・公園・街路で見られる種を優先。候補は確度順に最大3つ。
以下のJSONのみで回答(前置き・コードブロック禁止):
{"candidates":[{"name":"和名","kana":"よみ","sci":"学名","confidence":85,"reason":"決め手を1文"}],"family":"科名","type":"樹形分類","pruneSeason":"剪定適期","pruneHow":"剪定方法を2〜3文","care":"水やり・施肥・置き場所を2〜3文","pest":"注意すべき病害虫","nowTask":"今やるべき手入れを1〜2文"}`,
          },
        ],
      },
    ], 1200);

    const parsed = parseJSON(raw);
    parsed.candidates = (parsed.candidates || []).slice(0, 3).map((c) => ({
      name: c.name || "不明",
      kana: c.kana || "",
      sci: c.sci || "",
      reason: c.reason || "",
      confidence: Math.max(1, Math.min(99,
        Math.round(Number(String(c.confidence).replace(/[^0-9.]/g, "")) || 50))),
    }));

    return res.status(200).json({ ...parsed, features: features.trim() });
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    return res.status(status).json({ error: { message: e.message || "identify failed" } });
  }
}
