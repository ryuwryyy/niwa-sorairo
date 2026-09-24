/**
 * Brave Search API で X / Instagram の公開投稿を探す。
 * X や Instagram を直接スクレイピングするのではなく、Brave が索引済みの公開ページを検索する。
 * 1回の呼び出し = Brave の1クエリ(課金単位)。ページ送りと件数の管理はフロント側で行う。
 *
 * mode:
 *   posts   … `site:x.com キーワード` などで投稿を探す
 *   replies … 指定した投稿者への返信(「返信先: @user」)を探す。スレッドのコメントに当たるもの
 */

const ENDPOINT = "/res/v1/web/search";
const USER_RE = /^[A-Za-z0-9_]{1,15}$/;

export class InputError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

const SITES = {
  x: { domain: "x.com", match: /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/ },
  instagram: { domain: "instagram.com", match: /^https?:\/\/(?:www\.)?instagram\.com\/(?:([A-Za-z0-9_.]{1,30})\/)?(p|reel)\/([A-Za-z0-9_-]+)/ },
};

const decode = (s) => String(s ?? "")
  .replace(/<[^>]+>/g, "")
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

/** X のタイトル「名前 on X: "本文" / X」「Xユーザーの名前さん: 「本文」 / X」から本文を取り出す */
function textFromXTitle(title) {
  const m = title.match(/on X:\s*"(.+)"\s*\/\s*X$/) || title.match(/さん[:：]\s*「(.+)」\s*\/\s*X$/);
  return m ? m[1].trim() : null;
}

/** X のタイトルから表示名(「名前 on X:」「Xユーザーの名前さん:」) */
function nameFromXTitle(title) {
  const m = title.match(/^(.+?)\s+on X:/) || title.match(/^(?:Xユーザーの)?(.+?)(?:\s*\(@[A-Za-z0-9_]+\))?さん[:：]/);
  return m ? m[1].replace(/\s*\(@[A-Za-z0-9_]+\)$/, "").trim().slice(0, 60) : null;
}

/** Instagram のタイトル「名前 (@user) • Instagram …」「名前 on Instagram: …」から表示名 */
function nameFromIgTitle(title) {
  const m = title.match(/^(.+?)\s*\(@[A-Za-z0-9_.]+\)/) || title.match(/^(.+?)\s+on Instagram/);
  return m ? m[1].trim().slice(0, 60) : null;
}

/**
 * 公式・広告・求人を検索の段階で減らす除外語(Brave の「-語」)。
 * ここで減るほど、あとの Jev の判定件数(= 費用)も減る。
 */
export const NEGATIVE_TERMS = ["-求人", "-採用情報", "-キャンペーン", "-プレゼント企画", "-抽選", "-ウェビナー"];

/** 返信の本文に含まれる「返信先: @user」「Replying to @user」 */
function replyTarget(text) {
  const m = text.match(/(?:返信先[:：]\s*|Replying to\s+)@([A-Za-z0-9_]{1,15})/);
  return m ? m[1] : null;
}

export function normalize(result, site) {
  const url = String(result?.url || "");
  const m = url.match(SITES[site].match);
  if (!m) return null;
  const title = decode(result.title);
  const snippets = [decode(result.description), ...(result.extra_snippets || []).map(decode)].filter(Boolean);
  let text, author, authorName, canonical;
  if (site === "x") {
    author = m[1];
    authorName = nameFromXTitle(title);
    canonical = `https://x.com/${m[1]}/status/${m[2]}`;
    const fromTitle = textFromXTitle(title);
    // タイトルの本文が切れている(…)ときはスニペットの方を使う
    text = fromTitle && !/…$/.test(fromTitle) ? fromTitle : (snippets[0] || fromTitle || title);
  } else {
    author = m[1] || null;
    authorName = nameFromIgTitle(title);
    canonical = `https://www.instagram.com/${m[2]}/${m[3]}/`;
    text = snippets[0] || title;
  }
  text = text.replace(/\s*\/\s*X$/, "").trim();
  if (text.length < 4) return null;
  return {
    platform: site,
    url: canonical,
    author,
    authorName: authorName || null,
    text,
    date: result.page_age || null,
    replyTo: replyTarget([title, ...snippets].join(" ")),
    source: "brave",
  };
}

export function buildQuery(body) {
  const site = body?.site;
  if (!SITES[site]) throw new InputError("site must be x or instagram");
  const mode = body?.mode || "posts";
  if (mode === "posts") {
    const kw = String(body?.keyword || "").trim();
    if (!kw || kw.length > 100) throw new InputError("keyword required (1-100 chars)");
    // excludeMarketing: false で除外語を付けない(公式の発信を調べたいとき)
    return `site:${SITES[site].domain} ${kw}${body?.excludeMarketing === false ? "" : ` ${NEGATIVE_TERMS.join(" ")}`}`;
  }
  if (mode === "replies") {
    if (site !== "x") throw new InputError("replies are supported for x only");
    const author = String(body?.author || "");
    if (!USER_RE.test(author)) throw new InputError("invalid author");
    const kw = String(body?.keyword || "").trim().slice(0, 60);
    return `site:x.com ("返信先: @${author}" OR "Replying to @${author}")${kw ? ` ${kw}` : ""}`;
  }
  throw new InputError(`unknown mode: ${mode}`);
}

async function callBrave(params, { apiKey, baseUrl, fetch }) {
  const url = `${baseUrl}${ENDPOINT}?${new URLSearchParams(params)}`;
  return fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } });
}

export async function search(body, { apiKey, baseUrl = "https://api.search.brave.com", fetch = globalThis.fetch } = {}) {
  const q = buildQuery(body);
  const site = body.site;
  const offset = Math.max(0, Math.min(9, Number(body.offset) || 0));
  const params = { q, count: "20", offset: String(offset), country: "JP", search_lang: "jp", extra_snippets: "true", result_filter: "web" };
  if (["pd", "pw", "pm", "py"].includes(body.freshness)) params.freshness = body.freshness;

  let res = await callBrave(params, { apiKey, baseUrl, fetch });
  if (res.status === 422) {
    // プランや地域によって受け付けないパラメータがあるので、最小限にして1回だけやり直す
    delete params.search_lang;
    delete params.extra_snippets;
    res = await callBrave(params, { apiKey, baseUrl, fetch });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.detail || data?.message || `Brave ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const raw = data?.web?.results || [];
  const items = raw.map((r) => normalize(r, site)).filter(Boolean);
  return { query: q, offset, items, more: raw.length >= 20 && offset < 9 };
}

export async function handleBraveRequest(rawBody, env, fetchImpl) {
  const apiKey = env.BRAVE_API_KEY;
  if (!apiKey) {
    return { status: 501, body: { error: { code: "no_key", message: "BRAVE_API_KEY is not configured on the server" } } };
  }
  let body;
  try {
    body = typeof rawBody === "string" ? JSON.parse(rawBody || "{}") : (rawBody || {});
  } catch {
    return { status: 400, body: { error: { message: "invalid JSON" } } };
  }
  try {
    const opts = { apiKey, ...(env.BRAVE_BASE_URL ? { baseUrl: env.BRAVE_BASE_URL } : {}), ...(fetchImpl ? { fetch: fetchImpl } : {}) };
    return { status: 200, body: await search(body, opts) };
  } catch (err) {
    const status = err instanceof InputError ? 400 : (err.status || 502);
    return { status, body: { error: { message: err?.message || "upstream error" } } };
  }
}
