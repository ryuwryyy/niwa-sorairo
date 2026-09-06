/**
 * Claude API 通信層
 *
 * 重要: APIキーはこのファイルにも、フロントエンドのどこにも書かない。
 * - 開発時: vite の /api/claude プロキシ
 * - 本番: Vercel Serverless（/api/claude, /api/identify）
 *   キーは Vercel Environment Variables の ANTHROPIC_API_KEY のみ
 */

const CLAUDE_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || "/api/claude";

export async function askClaude(content, maxTokens = 1000) {
  const res = await fetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `API ${res.status}`);
  if (data.error) throw new Error(data.error.message || "API error");
  return data.content.map((i) => (i.type === "text" ? i.text : "")).join("");
}

/** ```json フェンス付きでも安全にJSONを取り出す */
export function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
}

/**
 * 二段推論による植物同定。
 * 本番はサーバー側 /api/identify で一括実行（タイムアウト・キー漏洩対策）。
 * 開発時は vite プロキシ経由でクライアント側二段推論。
 */
export async function identifyPlant(base64jpeg) {
  // 本番・プレビュー: サーバー一括
  if (!import.meta.env.DEV) {
    const res = await fetch("/api/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64jpeg }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `API ${res.status}`);
    if (data.error) throw new Error(data.error.message || "API error");
    return data;
  }

  // 開発: 既存の二段推論（vite プロキシ）
  const imgBlock = {
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: base64jpeg },
  };

  const features = await askClaude([
    imgBlock,
    { type: "text", text: "この植物写真を植物学者として観察し、形態的特徴のみを記述してください。同定はまだしない。葉序(対生/互生)、葉形と縁、葉脈、光沢、樹皮や茎、花・実の有無、樹形。箇条書き5行以内、前置きなし。" },
  ], 400);

  const raw = await askClaude([
    imgBlock,
    { type: "text", text: `あなたは日本の造園樹木・園芸植物の同定専門家です。写真と以下の観察所見を突き合わせ、同定してください。
【観察所見】
${features}
日本の庭・公園・街路で見られる種を優先。候補は確度順に最大3つ。
以下のJSONのみで回答(前置き・コードブロック禁止):
{"candidates":[{"name":"和名","kana":"よみ","sci":"学名","confidence":85,"reason":"決め手を1文"}],"family":"科名","type":"樹形分類","pruneSeason":"剪定適期","pruneHow":"剪定方法を2〜3文","care":"水やり・施肥・置き場所を2〜3文","pest":"注意すべき病害虫","nowTask":"今やるべき手入れを1〜2文"}` },
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
  return { ...parsed, features: features.trim() };
}
