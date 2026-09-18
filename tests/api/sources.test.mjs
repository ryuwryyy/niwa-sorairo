import test from "node:test";
import assert from "node:assert/strict";
import {
  searchPinterest,
  searchCse,
  searchBrave,
  searchAdobe,
  normalizePin,
  normalizeCseItem,
  normalizeBraveItem,
  normalizeAdobeFile,
  NotConfiguredError,
  LICENSE,
} from "../../server/lib/sources.js";
import * as sources from "../../server/lib/sources.js";
import searchHandler from "../../api/studio/search.js";

const realFetch = globalThis.fetch;
const calls = [];

function mockFetch(responder) {
  calls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const r = responder(String(url), calls.length, init);
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: { get: () => null },
      text: async () => JSON.stringify(r.json ?? {}),
    };
  };
}

const ENV_KEYS = [
  "PINTEREST_ACCESS_TOKEN",
  "GOOGLE_CSE_KEY",
  "GOOGLE_CSE_CX",
  "BRAVE_SEARCH_API_KEY",
  "ADOBE_STOCK_API_KEY",
  "ADOBE_STOCK_PRODUCT",
];
const savedEnv = {};

test.beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function fakeRes() {
  return {
    code: 0,
    payload: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.code = c;
      return this;
    },
    json(o) {
      this.payload = o;
      return this;
    },
    send(b) {
      this.payload = b;
      return this;
    },
    end() {
      return this;
    },
  };
}

test("sources.js は契約どおりのアダプタを公開する（unfurl は再エクスポート）", () => {
  for (const k of ["searchPinterest", "searchCse", "searchBrave", "searchAdobe", "unfurl", "cannesImages"]) {
    assert.equal(typeof sources[k], "function", k);
  }
});

/* ---------------- 正規化 ---------------- */

const PIN = {
  id: "12345",
  title: "静かな余白",
  alt_text: "alt",
  board_owner: { username: "sorairo" },
  media: {
    images: {
      "150x150": { url: "https://i.pinimg.com/150x150/a.jpg", width: 150, height: 150 },
      "400x300": { url: "https://i.pinimg.com/400x300/a.jpg", width: 400, height: 300 },
      "600x": { url: "https://i.pinimg.com/600x/a.jpg", width: 600, height: 800 },
      "1200x": { url: "https://i.pinimg.com/1200x/a.jpg", width: 1200, height: 1600 },
    },
  },
};

test("Pinterest の Pin を正規化する", () => {
  const n = normalizePin(PIN);
  assert.deepEqual(n, {
    id: "12345",
    source: "pinterest",
    title: "静かな余白",
    thumbUrl: "https://i.pinimg.com/400x300/a.jpg",
    imageUrl: "https://i.pinimg.com/1200x/a.jpg",
    pageUrl: "https://www.pinterest.com/pin/12345/",
    width: 1200,
    height: 1600,
    author: "sorairo",
    license: LICENSE.pinterest,
  });
});

test("Pinterest: 1200x が無ければ 600x を使う", () => {
  const pin = { ...PIN, media: { images: { "600x": { url: "https://i.pinimg.com/600x/a.jpg", width: 600, height: 800 } } } };
  const n = normalizePin(pin);
  assert.equal(n.imageUrl, "https://i.pinimg.com/600x/a.jpg");
  assert.equal(n.thumbUrl, "https://i.pinimg.com/600x/a.jpg");
});

test("Google CSE の items を正規化する", () => {
  const n = normalizeCseItem({
    cacheId: "CID",
    title: "poster",
    link: "https://example.com/full.jpg",
    displayLink: "example.com",
    image: {
      thumbnailLink: "https://encrypted-tbn0.gstatic.com/x",
      contextLink: "https://example.com/page",
      width: 1600,
      height: 900,
    },
  });
  assert.deepEqual(n, {
    id: "CID",
    source: "cse",
    title: "poster",
    thumbUrl: "https://encrypted-tbn0.gstatic.com/x",
    imageUrl: "https://example.com/full.jpg",
    pageUrl: "https://example.com/page",
    width: 1600,
    height: 900,
    author: "example.com",
    license: LICENSE.unknown,
  });
});

test("Brave の results を正規化する", () => {
  const n = normalizeBraveItem({
    type: "image_result",
    title: "ceramics poster",
    url: "https://blog.example/post",
    source: "blog.example",
    thumbnail: { src: "https://imgs.search.brave.com/thumb", width: 200, height: 300 },
    properties: { url: "https://blog.example/img.jpg", placeholder: "https://x/ph", width: 1200, height: 1800 },
    meta_url: { hostname: "blog.example" },
  });
  assert.deepEqual(n, {
    id: "https://blog.example/img.jpg",
    source: "brave",
    title: "ceramics poster",
    thumbUrl: "https://imgs.search.brave.com/thumb",
    imageUrl: "https://blog.example/img.jpg",
    pageUrl: "https://blog.example/post",
    width: 1200,
    height: 1800,
    author: "blog.example",
    license: LICENSE.unknown,
  });
});

test("Adobe Stock の files を正規化し、帰属表示と利用条件を付ける", () => {
  const n = normalizeAdobeFile({
    id: 108289885,
    title: "colorful horse",
    creator_name: "Taro",
    width: 5000,
    height: 3333,
    thumbnail_240_url: "https://t4.ftcdn.net/240_x.jpg",
    thumbnail_500_url: "https://as1.ftcdn.net/500_x.jpg",
    details_url: "https://stock.adobe.com/images/108289885",
  });
  assert.equal(n.source, "adobe");
  assert.equal(n.id, "108289885");
  assert.equal(n.thumbUrl, "https://t4.ftcdn.net/240_x.jpg");
  assert.equal(n.imageUrl, "https://as1.ftcdn.net/500_x.jpg");
  assert.equal(n.pageUrl, "https://stock.adobe.com/images/108289885");
  assert.equal(n.author, "Taro");
  assert.equal(n.attribution, "Taro / Adobe Stock");
  assert.equal(n.license, "Adobe Stock (comp preview) — 表示のみ・AI利用不可・要ライセンス");
});

/* ---------------- 各アダプタのリクエスト組み立て ---------------- */

test("searchPinterest は自分のピン検索エンドポイントに Bearer で問い合わせる", async () => {
  process.env.PINTEREST_ACCESS_TOKEN = "ptk";
  mockFetch(() => ({ json: { items: [PIN], bookmark: "BM2" } }));

  const out = await searchPinterest({ q: "余白" });
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, "https://api.pinterest.com/v5/search/pins");
  assert.equal(u.searchParams.get("query"), "余白");
  assert.equal(calls[0].init.headers.Authorization, "Bearer ptk");
  assert.equal(out.source, "pinterest");
  assert.equal(out.next, "BM2");
  assert.equal(out.items.length, 1);

  await searchPinterest({ q: "余白", page: "BM2" });
  assert.equal(new URL(calls[1].url).searchParams.get("bookmark"), "BM2");
});

test("searchPinterest はトークン未設定で NotConfiguredError", async () => {
  await assert.rejects(() => searchPinterest({ q: "x" }), NotConfiguredError);
});

test("searchCse は searchType=image / num=10 / start / siteSearch を組み立てる", async () => {
  process.env.GOOGLE_CSE_KEY = "K";
  process.env.GOOGLE_CSE_CX = "CX";
  mockFetch(() => ({ json: { items: [], queries: { nextPage: [{}] } } }));

  await searchCse({ q: "poster", page: 2, site: "pinterest.com" });
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, "https://www.googleapis.com/customsearch/v1");
  assert.equal(u.searchParams.get("key"), "K");
  assert.equal(u.searchParams.get("cx"), "CX");
  assert.equal(u.searchParams.get("searchType"), "image");
  assert.equal(u.searchParams.get("num"), "10");
  assert.equal(u.searchParams.get("start"), "21");
  assert.equal(u.searchParams.get("siteSearch"), "pinterest.com");
  assert.equal(u.searchParams.get("siteSearchFilter"), "i");
});

test("searchBrave はトークンヘッダと site: 接頭辞を使う（画像検索にページングは無い）", async () => {
  process.env.BRAVE_SEARCH_API_KEY = "BK";
  mockFetch(() => ({ json: { results: [] } }));

  await searchBrave({ q: "余白 ポスター", site: "pinterest.com" });
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, "https://api.search.brave.com/res/v1/images/search");
  assert.equal(u.searchParams.get("q"), "site:pinterest.com 余白 ポスター");
  assert.equal(u.searchParams.get("count"), "20");
  assert.equal(u.searchParams.get("safesearch"), "strict");
  assert.equal(calls[0].init.headers["X-Subscription-Token"], "BK");
  assert.equal(calls[0].init.headers.Accept, "application/json");
});

test("searchAdobe は x-api-key / X-Product / result_columns[] を送る", async () => {
  process.env.ADOBE_STOCK_API_KEY = "AK";
  mockFetch(() => ({ json: { nb_results: 100, files: [] } }));

  await searchAdobe({ q: "washi", page: 1, contentType: "photo", orientation: "horizontal" });
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, "https://stock.adobe.io/Rest/Media/1/Search/Files");
  assert.equal(u.searchParams.get("search_parameters[words]"), "washi");
  assert.equal(u.searchParams.get("search_parameters[limit]"), "32");
  assert.equal(u.searchParams.get("search_parameters[offset]"), "32");
  assert.equal(u.searchParams.get("search_parameters[filters][premium]"), "all");
  assert.equal(u.searchParams.get("search_parameters[filters][content_type:photo]"), "1");
  assert.equal(u.searchParams.get("search_parameters[filters][orientation]"), "horizontal");
  assert.ok(u.searchParams.getAll("result_columns[]").includes("thumbnail_500_url"));
  assert.ok(u.searchParams.getAll("result_columns[]").includes("comp_url"));
  assert.equal(calls[0].init.headers["x-api-key"], "AK");
  assert.equal(calls[0].init.headers["X-Product"], "SorairoStudio/1.0");
});

/* ---------------- フォールバックチェーン ---------------- */

const post = (body) => {
  const res = fakeRes();
  return searchHandler({ method: "POST", body, query: {} }, res).then(() => res);
};

test("pinterest: 公式トークンがあれば公式 API を使う（degraded 無し）", async () => {
  process.env.PINTEREST_ACCESS_TOKEN = "ptk";
  mockFetch(() => ({ json: { items: [PIN], bookmark: null } }));
  const res = await post({ op: "pinterest", q: "余白" });
  assert.equal(res.code, 200);
  assert.equal(res.payload.source, "pinterest");
  assert.equal(res.payload.degraded, undefined);
  assert.equal(res.payload.items.length, 1);
});

test("pinterest: scope:'public' なら公式 API を飛ばして Brave へ落ちる", async () => {
  process.env.PINTEREST_ACCESS_TOKEN = "ptk";
  process.env.BRAVE_SEARCH_API_KEY = "BK";
  mockFetch(() => ({ json: { results: [{ url: "https://p/1", properties: { url: "https://p/1.jpg" }, thumbnail: { src: "https://t/1" } }] } }));
  const res = await post({ op: "pinterest", q: "余白", scope: "public" });
  assert.equal(res.code, 200);
  assert.equal(res.payload.degraded, "brave");
  assert.match(calls[0].url, /api\.search\.brave\.com/);
});

test("pinterest: トークンが無ければ Brave（degraded: brave）", async () => {
  process.env.BRAVE_SEARCH_API_KEY = "BK";
  mockFetch(() => ({ json: { results: [] } }));
  const res = await post({ op: "pinterest", q: "余白" });
  assert.equal(res.code, 200);
  assert.equal(res.payload.degraded, "brave");
  assert.equal(new URL(calls[0].url).searchParams.get("q"), "site:pinterest.com 余白");
});

test("pinterest: Brave も無ければ CSE（degraded: cse）", async () => {
  process.env.GOOGLE_CSE_KEY = "K";
  process.env.GOOGLE_CSE_CX = "CX";
  mockFetch(() => ({ json: { items: [] } }));
  const res = await post({ op: "pinterest", q: "余白" });
  assert.equal(res.code, 200);
  assert.equal(res.payload.degraded, "cse");
  assert.equal(new URL(calls[0].url).searchParams.get("siteSearch"), "pinterest.com");
});

test("pinterest: キーが1つも無ければ 200 + degraded:'none' + hint", async () => {
  mockFetch(() => ({ json: {} }));
  const res = await post({ op: "pinterest", q: "余白" });
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload.items, []);
  assert.equal(res.payload.degraded, "none");
  assert.match(res.payload.hint, /PINTEREST_ACCESS_TOKEN/);
  assert.match(res.payload.hint, /BRAVE_SEARCH_API_KEY/);
  assert.equal(calls.length, 0);
});

test("cannesImages は Brave → CSE の順に落ちる", async () => {
  process.env.GOOGLE_CSE_KEY = "K";
  process.env.GOOGLE_CSE_CX = "CX";
  mockFetch(() => ({ json: { items: [] } }));
  const res = await post({ op: "cannesImages", q: "Cannes Lions grand prix poster" });
  assert.equal(res.payload.degraded, "cse");
  assert.equal(new URL(calls[0].url).searchParams.get("siteSearch"), null, "サイト制限しない");
});

test("Pinterest の 401（トークン失効）は次の手段へ落ちる", async () => {
  process.env.PINTEREST_ACCESS_TOKEN = "expired";
  process.env.BRAVE_SEARCH_API_KEY = "BK";
  mockFetch((url) =>
    url.includes("api.pinterest.com")
      ? { status: 401, json: { message: "token expired" } }
      : { json: { results: [] } },
  );
  const res = await post({ op: "pinterest", q: "余白" });
  assert.equal(res.code, 200);
  assert.equal(res.payload.degraded, "brave");
});

test("検索語が空なら 400", async () => {
  process.env.BRAVE_SEARCH_API_KEY = "BK";
  mockFetch(() => ({ json: { results: [] } }));
  const res = await post({ op: "pinterest", q: "   " });
  assert.equal(res.code, 400);
  assert.match(res.payload.error.message, /検索語/);
  assert.equal(calls.length, 0);
});

test("unknown op は 400、GET は 405", async () => {
  const bad = await post({ op: "nope" });
  assert.equal(bad.code, 400);
  assert.match(bad.payload.error.message, /unknown op/);

  const res = fakeRes();
  await searchHandler({ method: "GET", query: {} }, res);
  assert.equal(res.code, 405);
  assert.deepEqual(res.payload, { error: { message: "Method Not Allowed" } });
});

test("単独ソース（adobe）の上流 4xx はそのままのステータスで返し、キーは漏らさない", async () => {
  process.env.ADOBE_STOCK_API_KEY = "supersecretkey";
  mockFetch(() => ({ status: 403, json: { error_code: "403003", message: "Api Key is invalid" } }));
  const res = await post({ op: "adobe", q: "washi" });
  assert.equal(res.code, 403);
  assert.match(res.payload.error.message, /Api Key is invalid/);
  assert.equal(JSON.stringify(res.payload).includes("supersecretkey"), false);
});

test("キー未設定のソースは 200 + degraded:'none' + hint（エラーにしない）", async () => {
  mockFetch(() => ({ json: {} }));
  const res = await post({ op: "adobe", q: "washi" });
  assert.equal(res.code, 200);
  assert.equal(res.payload.degraded, "none");
  assert.match(res.payload.hint, /ADOBE_STOCK_API_KEY/);
  assert.equal(calls.length, 0);
});
