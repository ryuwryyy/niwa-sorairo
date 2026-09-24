// Brave Search API(/api/brave)で X・Instagram の公開投稿を集める。
// 1リクエスト = Brave の1クエリ(課金単位)。キーワード × ページ送りを順番に回し、URL で重複を除く。

const API_BASE = import.meta.env?.VITE_API_BASE || "";

export class NoBraveKeyError extends Error {
  constructor() { super("BRAVE_API_KEY がサーバーに設定されていません"); }
}

async function call(body, signal) {
  const res = await fetch(`${API_BASE}/api/brave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 501 && data?.error?.code === "no_key") throw new NoBraveKeyError();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** かかるクエリ数の上限(ページ送りが途中で尽きれば、実際はこれより少ない) */
export const estimateQueries = ({ keywords, sites, pages, replyAuthors }) =>
  keywords.length * sites.length * pages + (sites.includes("x") ? replyAuthors : 0);

/**
 * @param {{keywords:string[], sites:("x"|"instagram")[], pages:number, freshness?:string, target:number, replyAuthors:number}} opts
 * @param {{signal?:AbortSignal, onProgress?:(p:{queries:number, found:number, label:string})=>void}} hooks
 */
export async function collectWithBrave(opts, { signal, onProgress } = {}) {
  const found = new Map(); // url → item
  let queries = 0;
  const report = (label) => onProgress?.({ queries, found: found.size, label });
  const add = (items, extra = {}) => {
    let fresh = 0;
    for (const it of items) {
      if (!found.has(it.url)) { found.set(it.url, { ...it, ...extra }); fresh++; }
    }
    return fresh;
  };

  // 1. 投稿: キーワード × サイト × ページ。新しい投稿が出なくなったら次のキーワードへ
  outer:
  for (const site of opts.sites) {
    for (const keyword of opts.keywords) {
      for (let offset = 0; offset < opts.pages; offset++) {
        if (signal?.aborted || found.size >= opts.target) break outer;
        report(`${site === "x" ? "X" : "Instagram"}「${keyword}」${offset + 1}ページ目`);
        const data = await call({ mode: "posts", site, keyword, offset, freshness: opts.freshness }, signal);
        queries++;
        const fresh = add(data.items, { keyword });
        if (!data.more || fresh === 0) break;
        await wait(250);
      }
    }
  }

  // 2. 返信(スレッドのコメント): 投稿の多い X の投稿者から順に、その人への返信を探す
  if (opts.sites.includes("x") && opts.replyAuthors > 0 && !signal?.aborted) {
    const counts = new Map();
    for (const it of found.values()) if (it.platform === "x" && it.author) counts.set(it.author, (counts.get(it.author) || 0) + 1);
    const authors = [...counts].sort((a, b) => b[1] - a[1]).slice(0, opts.replyAuthors).map(([a]) => a);
    for (const author of authors) {
      if (signal?.aborted) break;
      report(`@${author} への返信`);
      const data = await call({ mode: "replies", site: "x", author, freshness: opts.freshness }, signal);
      queries++;
      add(data.items.map((it) => ({ ...it, replyTo: it.replyTo || author })));
      await wait(250);
    }
  }

  report("完了");
  return { posts: [...found.values()], queries };
}
