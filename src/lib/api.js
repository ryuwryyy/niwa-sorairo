/**
 * Claude API 通信層
 *
 * 重要: APIキーはこのファイルにも、フロントエンドのどこにも書かない。
 * ブラウザに渡ったキーは誰でも読めるため、必ずサーバー側(worker/)を経由する。
 *
 * - 開発時: vite.config.js のプロキシが /api/claude を Anthropic に中継し、
 *           .env.local の ANTHROPIC_API_KEY を付与する
 * - 本番:   VITE_API_ENDPOINT に Cloudflare Worker のURLを設定する
 */

const ENDPOINT = import.meta.env.VITE_API_ENDPOINT || "/api/claude";

export async function askClaude(content, maxTokens = 1000) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
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
 * ①同定せず形態所見だけ取る → ②所見と写真を突き合わせて照合。
 * 一発で名前を出させるより誤同定が減り、判定根拠も残る。
 */
export async function identifyPlant(base64jpeg) {
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
  // モデル出力のばらつきを吸収する正規化
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
