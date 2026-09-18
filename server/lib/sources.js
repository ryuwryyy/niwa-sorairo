/**
 * 参照画像の検索アダプタ（docs/studio/research-reference-sources.md）。
 *
 * すべて { items: Normalized[], next?, source, degraded? } を返す。
 * Normalized = { id, source, title, thumbUrl, imageUrl, pageUrl, width, height, author, license }
 *
 * 権利メモ:
 *  - Adobe Stock Developer Terms §9 は Stock 作品とメタデータの ML/AI 利用を禁止。§3.2/§6 は帰属表示を要求。
 *    → license/attribution を必ず付け、サーバー側にキャッシュしない。
 *  - Pinterest ToS は API データの保存と AI 学習利用を禁止。表示とリンクに留める。
 *  - Google CSE は 2027-01-01 終了・新規受付停止。既存契約がある場合の暫定手段。
 */
export class NotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotConfiguredError";
    this.code = "not_configured";
  }
}

export class UnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedError";
    this.code = "unsupported";
  }
}

export const LICENSE = {
  pinterest: "Pinterest ToS — 表示とリンクのみ・保存不可・AI利用不可",
  adobe: "Adobe Stock (comp preview) — 表示のみ・AI利用不可・要ライセンス",
  unknown: "出所不明 — 権利者を確認してから利用（AI参照には渡さない）",
};

export const str = (v) => (v == null ? "" : String(v));
export const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pageNum = (p) => Math.max(0, Math.floor(Number(p) || 0));

export async function getJson(url, { headers = {}, timeoutMs = 12_000, label = "upstream" } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON */
    }
    if (!res.ok) {
      const msg =
        json?.error?.message || json?.message || json?.error_code || `${label} が ${res.status} を返しました`;
      const err = new Error(String(msg));
      err.status = res.status;
      throw err;
    }
    return json || {};
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error(`${label} がタイムアウトしました`);
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Pinterest（トークン所有者「自分のピン」だけ） ---------------- */

const PIN_THUMB = ["400x300", "236x", "150x150", "600x"];
const PIN_LARGE = ["1200x", "600x", "400x300", "236x"];

const pickImage = (images, order) => {
  for (const k of order) if (images?.[k]?.url) return images[k];
  return null;
};

export function normalizePin(pin) {
  const images = pin?.media?.images || {};
  const thumb = pickImage(images, PIN_THUMB);
  const large = pickImage(images, PIN_LARGE);
  const id = str(pin?.id);
  return {
    id: id || str(pin?.link) || str(thumb?.url),
    source: "pinterest",
    title: str(pin?.title) || str(pin?.alt_text) || str(pin?.description),
    thumbUrl: str(thumb?.url),
    imageUrl: str(large?.url) || str(thumb?.url),
    pageUrl: id ? `https://www.pinterest.com/pin/${id}/` : str(pin?.link),
    width: num(large?.width),
    height: num(large?.height),
    author: str(pin?.board_owner?.username),
    license: LICENSE.pinterest,
  };
}

/**
 * Pinterest API v5 `GET /v5/search/pins`。
 * 公式仕様上これは「アクセストークン所有アカウント自身が保存したピン」だけを検索する
 * （Pinterest 全体の横断検索ではない — research §A-1-2）。チーム用アカウントに
 * 貯めた参照を検索する用途で使う。`page` にはブックマーク文字列を渡す。
 */
export async function searchPinterest({ q, page } = {}) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) throw new NotConfiguredError("PINTEREST_ACCESS_TOKEN が未設定です");
  const query = str(q).trim();
  if (!query) throw new UnsupportedError("検索語が必要です");

  const url = new URL("https://api.pinterest.com/v5/search/pins");
  url.searchParams.set("query", query);
  const bookmark = typeof page === "string" && page && !/^\d+$/.test(page) ? page : "";
  if (bookmark) url.searchParams.set("bookmark", bookmark);

  const json = await getJson(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    label: "Pinterest",
  });

  const items = (json.items || []).map(normalizePin).filter((i) => i.thumbUrl || i.imageUrl);
  return { items, next: json.bookmark || null, source: "pinterest" };
}

/* ---------------- Google Custom Search（画像） ---------------- */

export function normalizeCseItem(it) {
  const img = it?.image || {};
  return {
    id: str(it?.cacheId) || str(it?.link),
    source: "cse",
    title: str(it?.title),
    thumbUrl: str(img.thumbnailLink),
    imageUrl: str(it?.link),
    pageUrl: str(img.contextLink) || str(it?.link),
    width: num(img.width),
    height: num(img.height),
    author: str(it?.displayLink),
    license: LICENSE.unknown,
  };
}

export async function searchCse({ q, page, site } = {}) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) throw new NotConfiguredError("GOOGLE_CSE_KEY / GOOGLE_CSE_CX が未設定です");
  const query = str(q).trim();
  if (!query) throw new UnsupportedError("検索語が必要です");

  const p = pageNum(page);
  const start = Math.min(p * 10 + 1, 91); // start + num <= 100
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  const params = {
    key,
    cx,
    q: query,
    searchType: "image",
    num: "10",
    start: String(start),
    safe: "active",
    hl: "ja",
    ...(site ? { siteSearch: site, siteSearchFilter: "i" } : {}),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const json = await getJson(url.toString(), { headers: { Accept: "application/json" }, label: "Google CSE" });
  const items = (json.items || []).map(normalizeCseItem).filter((i) => i.thumbUrl || i.imageUrl);
  const hasNext = Boolean(json.queries?.nextPage?.length) && start + 10 <= 91;
  return { items, next: hasNext ? p + 1 : null, source: "cse" };
}

/* ---------------- Brave Search（画像） ---------------- */
/**
 * GET https://api.search.brave.com/res/v1/images/search
 * 形は Brave 公式 MCP サーバ（github.com/brave/brave-search-mcp-server）の
 * 型定義・クライアント実装で確認済み。ただし公式ドキュメント本体
 * （api-dashboard.search.brave.com）は egress で遮断されており未確認（防御的にパースする）。
 * 注意: 画像検索にページングは無く offset パラメータも無い（count を増やすだけ）。
 *       → page はクライアント側で count を伸ばしてスライスして疑似的に実現する。
 */
const BRAVE_PER_PAGE = 20;

export function normalizeBraveItem(it) {
  const props = it?.properties || {};
  const thumb = it?.thumbnail || {};
  const imageUrl = str(props.url) || str(thumb.src);
  return {
    id: imageUrl || str(it?.url),
    source: "brave",
    title: str(it?.title),
    thumbUrl: str(thumb.src) || str(props.placeholder) || imageUrl,
    imageUrl,
    pageUrl: str(it?.url),
    width: num(props.width),
    height: num(props.height),
    author: str(it?.source) || str(it?.meta_url?.hostname),
    license: LICENSE.unknown,
  };
}

export async function searchBrave({ q, page, site } = {}) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new NotConfiguredError("BRAVE_SEARCH_API_KEY が未設定です");
  const query = str(q).trim();
  if (!query) throw new UnsupportedError("検索語が必要です");

  const p = pageNum(page);
  const count = Math.min(200, (p + 1) * BRAVE_PER_PAGE);
  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", site ? `site:${site} ${query}` : query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("safesearch", "strict");
  url.searchParams.set("search_lang", "ja");

  const json = await getJson(url.toString(), {
    headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": key },
    label: "Brave Search",
  });

  const all = (json.results || []).map(normalizeBraveItem).filter((i) => i.thumbUrl || i.imageUrl);
  const items = all.slice(p * BRAVE_PER_PAGE);
  return { items, next: all.length >= count && count < 200 ? p + 1 : null, source: "brave" };
}

/* ---------------- Adobe Stock ---------------- */

const ADOBE_COLUMNS = [
  "nb_results",
  "id",
  "title",
  "creator_name",
  "content_type",
  "width",
  "height",
  "thumbnail_url",
  "thumbnail_240_url",
  "thumbnail_500_url",
  "comp_url",
  "details_url",
];

export function normalizeAdobeFile(f) {
  const id = str(f?.id);
  const creator = str(f?.creator_name);
  return {
    id,
    source: "adobe",
    title: str(f?.title),
    thumbUrl: str(f?.thumbnail_240_url) || str(f?.thumbnail_url),
    imageUrl: str(f?.thumbnail_500_url) || str(f?.thumbnail_url) || str(f?.comp_url),
    pageUrl: str(f?.details_url) || (id ? `https://stock.adobe.com/images/${id}` : ""),
    width: num(f?.width),
    height: num(f?.height),
    author: creator,
    license: LICENSE.adobe,
    attribution: `${creator || "Unknown"} / Adobe Stock`,
  };
}

export async function searchAdobe({ q, page, contentType = "photo", orientation } = {}) {
  const key = process.env.ADOBE_STOCK_API_KEY;
  if (!key) throw new NotConfiguredError("ADOBE_STOCK_API_KEY が未設定です");
  const query = str(q).trim();
  if (!query) throw new UnsupportedError("検索語が必要です");

  const limit = 32;
  const url = new URL("https://stock.adobe.io/Rest/Media/1/Search/Files");
  url.searchParams.set("locale", "ja_JP");
  url.searchParams.set("search_parameters[words]", query);
  url.searchParams.set("search_parameters[limit]", String(limit));
  url.searchParams.set("search_parameters[offset]", String(pageNum(page) * limit));
  url.searchParams.set("search_parameters[order]", "relevance");
  // premium を明示しないと limit より多く返ることがある（公式 FAQ）
  url.searchParams.set("search_parameters[filters][premium]", "all");
  const ct = ["photo", "illustration", "vector", "template"].includes(contentType) ? contentType : "photo";
  url.searchParams.set(`search_parameters[filters][content_type:${ct}]`, "1");
  if (["horizontal", "vertical", "square"].includes(orientation)) {
    url.searchParams.set("search_parameters[filters][orientation]", orientation);
  }
  for (const c of ADOBE_COLUMNS) url.searchParams.append("result_columns[]", c);

  const json = await getJson(url.toString(), {
    headers: {
      "x-api-key": key,
      "X-Product": process.env.ADOBE_STOCK_PRODUCT || "SorairoStudio/1.0",
      Accept: "application/json",
    },
    label: "Adobe Stock",
  });

  const items = (json.files || []).map(normalizeAdobeFile).filter((i) => i.thumbUrl || i.imageUrl);
  const p = pageNum(page);
  const total = num(json.nb_results);
  return { items, next: (p + 1) * limit < total ? p + 1 : null, source: "adobe" };
}

/* ---------------- URL 貼り付け取り込み（oEmbed → OGP） ---------------- */

// 実装は server/lib/unfurl.js。契約上の窓口はここ（DESIGN.md 4.5 の op:"unfurl"）。
export { unfurl } from "./unfurl.js";

/** カンヌ等の作品イメージ探索。サイト制限なしの画像検索をそのまま使う */
export async function cannesImages({ q, page } = {}) {
  return searchCse({ q, page });
}
