// Brave Search API 中継(api/_brave-core.js)のテスト。fetch を差し替えるので Brave は呼ばない
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleBraveRequest, normalize, buildQuery } from "../api/_brave-core.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const X_RESULTS = [
  { title: 'デザイナー太郎 on X: "UXの改善で問い合わせが半分になった。導線って大事" / X', url: "https://x.com/taro_ux/status/1111111111", description: "UXの改善で問い合わせが半分になった。導線って大事", page_age: "2026-09-01T10:00:00" },
  { title: "Xユーザーの花子さん: 「このアプリのUI、<strong>最高</strong>すぎる」 / X", url: "https://twitter.com/hanako_d/status/2222222222?s=20", description: "このアプリのUI、最高すぎる" },
  { title: "花子 (@hanako_d) / X", url: "https://x.com/hanako_d", description: "プロフィール" },
  { title: "返信 on X", url: "https://x.com/jiro/status/3333333333", description: "返信先: @taro_ux それ本当にわかる、フォームが長いと離脱する" },
];

function fakeBrave(results = X_RESULTS, { firstStatus } = {}) {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url: new URL(url), headers: init.headers });
    if (firstStatus && seen.length === 1) return json({ error: { detail: "bad param" } }, firstStatus);
    return json({ type: "search", web: { results } });
  };
  return { fetch, seen };
}

test("brave: キーが無ければ 501 no_key", async () => {
  const r = await handleBraveRequest({ site: "x", keyword: "UX" }, {});
  assert.equal(r.status, 501);
});

test("brave: site:x.com でキーワード検索し、投稿URLだけを本文付きで返す", async () => {
  const brave = fakeBrave();
  const r = await handleBraveRequest({ site: "x", keyword: "UX", offset: 2, freshness: "pm" }, { BRAVE_API_KEY: "k" }, brave.fetch);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const u = brave.seen[0].url;
  assert.equal(u.origin + u.pathname, "https://api.search.brave.com/res/v1/web/search");
  assert.equal(u.searchParams.get("q"), "site:x.com UX");
  assert.equal(u.searchParams.get("offset"), "2");
  assert.equal(u.searchParams.get("freshness"), "pm");
  assert.equal(brave.seen[0].headers["X-Subscription-Token"], "k");
  const items = r.body.items;
  assert.equal(items.length, 3); // プロフィールページは除く
  assert.deepEqual(items[0], {
    platform: "x", url: "https://x.com/taro_ux/status/1111111111", author: "taro_ux",
    text: "UXの改善で問い合わせが半分になった。導線って大事", date: "2026-09-01T10:00:00", replyTo: null, source: "brave",
  });
  assert.equal(items[1].url, "https://x.com/hanako_d/status/2222222222");
  assert.equal(items[1].text, "このアプリのUI、最高すぎる");
  assert.equal(items[2].replyTo, "taro_ux");
});

test("brave: 返信は「返信先: @投稿者」で探す", () => {
  assert.equal(buildQuery({ site: "x", mode: "replies", author: "taro_ux" }), 'site:x.com ("返信先: @taro_ux" OR "Replying to @taro_ux")');
  assert.throws(() => buildQuery({ site: "x", mode: "replies", author: "bad name!" }));
  assert.throws(() => buildQuery({ site: "instagram", mode: "replies", author: "a" }));
});

test("brave: Instagram は投稿とリールのURLだけ", () => {
  assert.equal(normalize({ url: "https://www.instagram.com/p/AbC123/", title: "x", description: "デザインがいい投稿です" }, "instagram").url, "https://www.instagram.com/p/AbC123/");
  assert.equal(normalize({ url: "https://www.instagram.com/design_lab/reel/Xy9/", title: "x", description: "UIの話をするリール" }, "instagram").author, "design_lab");
  assert.equal(normalize({ url: "https://www.instagram.com/design_lab/", title: "x", description: "プロフィール" }, "instagram"), null);
});

test("brave: 422 のときはパラメータを減らして1回だけやり直す", async () => {
  const brave = fakeBrave(X_RESULTS, { firstStatus: 422 });
  const r = await handleBraveRequest({ site: "x", keyword: "UX" }, { BRAVE_API_KEY: "k" }, brave.fetch);
  assert.equal(r.status, 200);
  assert.equal(brave.seen.length, 2);
  assert.equal(brave.seen[1].url.searchParams.get("search_lang"), null);
});

test("brave: 入力検証で弾き、Brave を呼ばない", async () => {
  const brave = fakeBrave();
  const env = { BRAVE_API_KEY: "k" };
  assert.equal((await handleBraveRequest({}, env, brave.fetch)).status, 400);
  assert.equal((await handleBraveRequest({ site: "x" }, env, brave.fetch)).status, 400);
  assert.equal((await handleBraveRequest({ site: "facebook", keyword: "UX" }, env, brave.fetch)).status, 400);
  assert.equal(brave.seen.length, 0);
});
