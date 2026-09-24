/**
 * 深掘りレポートの「言葉を書く」部分を Claude に任せる。
 * Jev(判断だけ)で絞り込み・タグ付けした投稿を受け取り、
 *   categories … 投稿群からカテゴリー体系をつくる
 *   group      … 感情語グループごとのサマリー・感情の動き・インサイト
 *   synthesis  … 全体のUX洞察、4象限の読み解き、アートディレクション的デコンテ
 * を構造化JSONで返す。プロンプトはサーバー側で固定し、任意の指示は受け付けない。
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";
const MAX_POSTS = 150;
const MAX_POST_CHARS = 600;

export class InputError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

const str = { type: "string" };
const strArr = { type: "array", items: str };
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SCHEMAS = {
  categories: obj({
    categories: { type: "array", items: obj({ label: str, description: str }) },
  }),
  group: obj({
    summary: str,
    emotionArc: obj({ trigger: str, reaction: str, afterglow: str }),
    insights: { type: "array", items: obj({ text: str, evidenceIds: strArr }) },
  }),
  synthesis: obj({
    headline: str,
    quadrantReading: { type: "array", items: obj({ quadrant: str, reading: str }) },
    uxInsights: {
      type: "array",
      items: obj({ insight: str, why: str, designImplication: str, evidenceIds: strArr }),
    },
    deconte: {
      type: "array",
      items: obj({ beat: str, scene: str, visual: str, copyTone: str, colorLight: str, typography: str, motionSound: str }),
    },
    principles: strArr,
  }),
};

const SYSTEM = `あなたはサービスデザインとUXリサーチの熟練リサーチャーであり、アートディレクターでもある。
SNS上の生の声(X・Instagramの投稿)を読み、デザインの意思決定に使える知見に変える。
- 投稿に書かれていないことを事実のように書かない。推測は推測とわかる言い方にする
- 根拠にした投稿は必ず id で示す(evidenceIds)。存在しない id を作らない
- 日本語で、短く具体的に書く。一般論(「ユーザー中心が大事」など)で終わらせない`;

function postsBlock(posts) {
  return posts
    .map((p) => `[${p.id}]${p.tags?.length ? ` (${p.tags.join("/")})` : ""}${p.feeling ? ` <${p.feeling}>` : ""} ${p.text}`)
    .join("\n");
}

function sanitizePosts(posts) {
  if (!Array.isArray(posts) || posts.length === 0) throw new InputError("posts required");
  if (posts.length > MAX_POSTS) throw new InputError(`too many posts (max ${MAX_POSTS})`);
  return posts.map((p) => ({
    id: String(p?.id ?? "").slice(0, 20),
    text: String(p?.text ?? "").replace(/\s+/g, " ").slice(0, MAX_POST_CHARS),
    tags: Array.isArray(p?.tags) ? p.tags.slice(0, 3).map((t) => String(t).slice(0, 30)) : [],
    feeling: p?.feeling ? String(p.feeling).slice(0, 20) : null,
  }));
}

const clip = (s, n) => String(s ?? "").slice(0, n);

function buildPrompt(task, body) {
  const theme = clip(body.theme || "サービスデザイン・デザイン・UX", 200);
  const posts = sanitizePosts(body.posts);

  if (task === "categories") {
    return `調査テーマ: ${theme}
以下の投稿群を読み、デザイン上の論点で分けるカテゴリー体系を5〜8個つくってください。
各カテゴリーは互いに重ならず、投稿の大半がどれかに入るように。label は12文字以内、description は分類の判断基準を1文で。

${postsBlock(posts)}`;
  }

  if (task === "group") {
    const group = clip(body.group, 30);
    return `調査テーマ: ${theme}
以下は「${group}」という感情語でまとめた投稿のグループです。
1. summary: このグループの人たちが何に反応しているかを3文以内で
2. emotionArc: 感情の動き。trigger(何が引き金か) → reaction(そのとき何を感じ・どうしたか) → afterglow(その後に残る気持ちや行動)
3. insights: デザインに効く発見を2〜4個。それぞれ根拠の投稿 id を付ける

${postsBlock(posts)}`;
  }

  if (task === "synthesis") {
    const groups = Array.isArray(body.groups) ? body.groups.slice(0, 16) : [];
    const quadrants = Array.isArray(body.quadrants) ? body.quadrants.slice(0, 4) : [];
    return `調査テーマ: ${theme}

## 感情語グループの要約
${groups.map((g) => `- ${clip(g.label, 30)}(${Number(g.count) || 0}件): ${clip(g.summary, 400)}`).join("\n")}

## 4象限(横軸=好意↔嫌悪、縦軸=感情の強さ 少し↔めっちゃ)
${quadrants.map((q) => `- ${clip(q.name, 20)}: ${Number(q.count) || 0}件`).join("\n")}

## 投稿(代表)
${postsBlock(posts)}

次をまとめてください。
1. headline: 全体を一言で言うと(40字以内)
2. quadrantReading: 4象限それぞれ(熱狂・好感・違和感・拒絶)が意味することを1〜2文で
3. uxInsights: 表面の不満・称賛の奥にある、一段深いUI/UXの洞察を3〜5個。why(なぜそう言えるか)、designImplication(具体的な設計への示唆)、evidenceIds
4. deconte: この声から生まれる体験・表現を、アートディレクションの絵コンテとして5〜7ビートに分解する。beat(起承転結などの役割)、scene(場面)、visual(画づくり・構図)、copyTone(言葉とトーン)、colorLight(色と光)、typography(書体の方向)、motionSound(動きと音)
5. principles: デザイン原則を3〜5個(各20字以内)`;
  }

  throw new InputError(`unknown task: ${task}`);
}

/** @param {{task:string}} body */
export async function analyze(body, { apiKey, fetch } = {}) {
  const task = body?.task;
  if (!SCHEMAS[task]) throw new InputError(`unknown task: ${task}`);
  const prompt = buildPrompt(task, body);

  const client = new Anthropic({ apiKey, maxRetries: 1, ...(fetch ? { fetch } : {}) });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: task === "synthesis" ? "high" : "medium",
      format: { type: "json_schema", schema: SCHEMAS[task] },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    const err = new Error("Claude declined this request");
    err.status = 422;
    throw err;
  }
  if (response.stop_reason === "max_tokens") {
    const err = new Error("response was cut off (max_tokens)");
    err.status = 502;
    throw err;
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { task, model: response.model, result: JSON.parse(text), usage: response.usage };
}

export async function handleAnalyzeRequest(rawBody, env, fetchImpl) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: 501, body: { error: { code: "no_key", message: "ANTHROPIC_API_KEY is not configured on the server" } } };
  }
  let body;
  try {
    body = typeof rawBody === "string" ? JSON.parse(rawBody || "{}") : (rawBody || {});
  } catch {
    return { status: 400, body: { error: { message: "invalid JSON" } } };
  }
  try {
    return { status: 200, body: await analyze(body, { apiKey, fetch: fetchImpl }) };
  } catch (err) {
    const status = err instanceof InputError ? 400
      : err instanceof Anthropic.APIError ? (err.status || 502)
      : (err.status || 502);
    return { status, body: { error: { message: err?.message || "upstream error" } } };
  }
}
