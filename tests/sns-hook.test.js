// .claude/hooks/sns-link-lookup.mjs(SNSリンクを Brave Search で補うフック)のテスト。Brave は呼ばない
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLinks, lookup } from "../.claude/hooks/sns-link-lookup.mjs";

test("SNSリンクを見つけ、検索語をつくる(最大3件・重複なし)", () => {
  const links = findLinks(
    "見て https://x.com/rasukarusan2/status/2102530700218077415?s=20 と https://twitter.com/a_b/status/1 、" +
    "https://x.com/rasukarusan2/status/2102530700218077415?s=20 https://www.instagram.com/p/AbC123/ https://example.com",
  );
  assert.equal(links.length, 3);
  assert.equal(links[0].site, "X");
  assert.deepEqual(links[0].queries, ['"x.com/rasukarusan2/status/2102530700218077415"', "site:x.com rasukarusan2 status 2102530700218077415"]);
  assert.equal(links[1].url, "https://twitter.com/a_b/status/1");
  assert.equal(links[2].site, "Instagram");
  assert.deepEqual(findLinks("https://github.com/x/y と普通の文"), []);
});

test("同じ投稿のURLを含む結果を優先し、抜粋と Powered by Brave を付ける", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: new URL(url), headers: init.headers });
    return new Response(JSON.stringify({ web: { results: [
      { title: "関係ない", url: "https://x.com/other/status/9", description: "別の話" },
      { title: 'u on X: "UIの話" / X', url: "https://twitter.com/u/status/42", description: "UIの<strong>話</strong>", page_age: "2026-09-01" },
    ] } }), { headers: { "content-type": "application/json" } });
  };
  const text = await lookup(findLinks("https://x.com/u/status/42"), { apiKey: "k", fetchImpl });
  assert.equal(seen[0].headers["X-Subscription-Token"], "k");
  assert.equal(seen[0].url.searchParams.get("q"), '"x.com/u/status/42"');
  assert.match(text, /UIの話\n/);
  assert.doesNotMatch(text, /関係ない/);
  assert.match(text, /Powered by Brave Search$/);
});

test("見つからない・失敗したときは推測させない指示を返す", async () => {
  const empty = async () => new Response(JSON.stringify({ web: { results: [] } }), { headers: { "content-type": "application/json" } });
  assert.match(await lookup(findLinks("https://x.com/u/status/1"), { apiKey: "k", fetchImpl: empty }), /推測で内容を補わず/);
  const broken = async () => new Response("{}", { status: 429 });
  assert.match(await lookup(findLinks("https://x.com/u/status/1"), { apiKey: "k", fetchImpl: broken }), /検索に失敗\(Brave 429\)/);
});
