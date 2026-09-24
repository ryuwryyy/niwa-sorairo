#!/usr/bin/env node
// UserPromptSubmit フック: メッセージに X・Instagram などの「直接は読めない」SNSリンクがあれば、
// Brave Search で公開されている情報(本文の抜粋・投稿者・日時)を探し、Claude への追加情報として渡す。
//
// 必要な環境変数: BRAVE_API_KEY(クラウド環境の設定か、手元のシェルに置く。リポジトリには書かない)
// 通信先: api.search.brave.com(クラウド環境ではネットワーク許可の対象に入れる)
// 失敗しても会話は止めない。キーや通信がないときは、WebSearch で探すよう Claude に伝えるだけ。

import { pathToFileURL } from "node:url";

const SNS = [
  { name: "X", re: /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)[^\s)>\]]*/g,
    query: (m) => [`"x.com/${m[1]}/status/${m[2]}"`, `site:x.com ${m[1]} status ${m[2]}`] },
  { name: "Instagram", re: /https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reel)\/([A-Za-z0-9_-]+)[^\s)>\]]*/g,
    query: (m) => [`"instagram.com/${m[1]}/${m[2]}"`] },
  { name: "Threads", re: /https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([A-Za-z0-9_.]+)\/post\/([A-Za-z0-9_-]+)[^\s)>\]]*/g,
    query: (m) => [`"threads.net/@${m[1]}/post/${m[2]}"`, `site:threads.net @${m[1]} ${m[2]}`] },
  { name: "TikTok", re: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)\/video\/(\d+)[^\s)>\]]*/g,
    query: (m) => [`"tiktok.com/@${m[1]}/video/${m[2]}"`] },
  { name: "Facebook", re: /https?:\/\/(?:www\.|m\.)?facebook\.com\/[^\s)>\]]+/g,
    query: (m) => [`"${m[0].replace(/^https?:\/\/(?:www\.|m\.)?/, "").split("?")[0]}"`] },
];

const MAX_LINKS = 3;
const TIMEOUT_MS = 8000;

/** メッセージから SNS のリンクを取り出す(重複は除き、最大3件) */
export function findLinks(prompt) {
  const out = [];
  const seen = new Set();
  for (const s of SNS) {
    for (const m of String(prompt).matchAll(s.re)) {
      const url = m[0].replace(/[.,、。]+$/, "");
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ site: s.name, url, queries: s.query(m) });
    }
  }
  return out.slice(0, MAX_LINKS);
}

const strip = (s) => String(s ?? "")
  .replace(/<[^>]+>/g, "")
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

async function brave(q, { apiKey, baseUrl, fetchImpl, signal }) {
  const params = new URLSearchParams({ q, count: "5", extra_snippets: "true" });
  const res = await fetchImpl(`${baseUrl}/res/v1/web/search?${params}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal,
  });
  if (!res.ok) throw new Error(`Brave ${res.status}`);
  const data = await res.json();
  return (data?.web?.results || []).map((r) => ({
    title: strip(r.title),
    url: r.url,
    text: [strip(r.description), ...(r.extra_snippets || []).map(strip)].filter(Boolean).join(" … "),
    date: r.page_age || r.age || null,
  }));
}

/** リンクごとに Brave を引き、Claude に渡す文章を組み立てる */
export async function lookup(links, { apiKey, baseUrl = "https://api.search.brave.com", fetchImpl = globalThis.fetch } = {}) {
  const lines = ["[sns-link-lookup] メッセージ内の SNS リンクは直接読めないため、Brave Search の公開情報で補った(検索結果の抜粋であり、本文の全文ではない)。"];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (const link of links) {
      lines.push("", `## ${link.site}: ${link.url}`);
      let hits = [];
      for (const q of link.queries) {
        try {
          hits = await brave(q, { apiKey, baseUrl, fetchImpl, signal: controller.signal });
        } catch (e) {
          lines.push(`- 検索に失敗(${e.name === "AbortError" ? "時間切れ" : e.message})。WebSearch で ${JSON.stringify(q)} を試すこと。`);
          break;
        }
        // 同じ投稿の URL を含む結果を優先。なければ次の検索語へ
        const id = link.url.split("?")[0].replace(/^https?:\/\/(?:www\.|mobile\.)?/, "").replace(/^twitter\.com/, "x.com");
        const exact = hits.filter((h) => h.url.replace(/^https?:\/\/(?:www\.|mobile\.)?/, "").replace(/^twitter\.com/, "x.com").startsWith(id));
        if (exact.length) { hits = exact; break; }
      }
      if (!hits.length) {
        lines.push("- 該当する公開ページは見つからなかった。推測で内容を補わず、ユーザーに本文の貼り付けを頼むこと。");
        continue;
      }
      for (const h of hits.slice(0, 3)) {
        lines.push(`- ${h.title}${h.date ? `(${h.date})` : ""}\n  ${h.url}\n  ${h.text.slice(0, 600)}`);
      }
    }
  } finally {
    clearTimeout(timer);
  }
  lines.push("", "Powered by Brave Search");
  return lines.join("\n");
}

function noKeyNote(links) {
  return [
    "[sns-link-lookup] メッセージに直接は読めない SNS リンクがある。BRAVE_API_KEY が未設定か通信できないため自動検索はしていない。",
    "WebSearch ツールで次の検索語を試し、見つからなければ推測せずユーザーに本文の貼り付けを頼むこと。",
    ...links.map((l) => `- ${l.site}: ${l.url} → ${l.queries.map((q) => JSON.stringify(q)).join(" / ")}`),
  ].join("\n");
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let prompt = "";
  try { prompt = JSON.parse(raw || "{}").prompt || ""; } catch { return; }
  const links = findLinks(prompt);
  if (!links.length) return; // SNS リンクがなければ何もしない(課金もされない)

  const apiKey = process.env.BRAVE_API_KEY;
  let context;
  try {
    context = apiKey
      ? await lookup(links, { apiKey, ...(process.env.BRAVE_BASE_URL ? { baseUrl: process.env.BRAVE_BASE_URL } : {}) })
      : noKeyNote(links);
  } catch {
    context = noKeyNote(links);
  }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(() => { /* フックの失敗で会話を止めない */ });
}
