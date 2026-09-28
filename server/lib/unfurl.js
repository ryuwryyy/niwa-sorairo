/**
 * URL 貼り付け取り込み（oEmbed → OGP フォールバック）。
 *
 * - Pinterest は公式 oEmbed（https://www.pinterest.com/oembed.json?url=…）を優先する。
 *   ただしレスポンスのフィールド名は本調査で実取得できておらず【未確認】なので防御的に読む。
 * - oEmbed が使えない／Pinterest 以外は、ページの og:image / twitter:image / JSON-LD を読む。
 * - ユーザーが貼った 1 件の URL をその場で 1 回だけ解決する用途に限る（巡回・保存はしない）。
 * - URL 検証は safeFetch と同じ SSRF ガードを通す。
 */
import { safeFetch, assertPublicHttpUrl, BlockedUrlError } from "./safeFetch.js";
import { LICENSE, getJson, str, num } from "./sources.js";

const isPinterestHost = (h) => /(^|\.)pinterest\.[a-z.]+$/i.test(h) || h === "pin.it" || /(^|\.)pin\.it$/i.test(h);

const metaContent = (html, keys) => {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
      "i",
    );
    const tag = re.exec(html)?.[0];
    if (!tag) continue;
    const c = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (c) return c;
  }
  return "";
};

function jsonLdImage(html) {
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      const img = node?.image;
      if (typeof img === "string") return img;
      if (Array.isArray(img) && typeof img[0] === "string") return img[0];
      if (typeof img?.url === "string") return img.url;
    }
  }
  return "";
}

const decodeEntities = (s) =>
  str(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");

/** Pinterest 公式 oEmbed。フィールド名は未確認のため防御的に読む（research A-3-1） */
async function pinterestOembed(pageUrl) {
  const url = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(pageUrl)}`;
  const json = await getJson(url, { headers: { Accept: "application/json" }, timeoutMs: 8_000, label: "Pinterest oEmbed" });
  const thumb = str(json.thumbnail_url) || str(json.url) || str(json.image);
  if (!thumb) throw new Error("oEmbed にサムネイルがありません");
  return {
    title: str(json.title) || str(json.author_name),
    thumbUrl: thumb,
    imageUrl: thumb,
    width: num(json.thumbnail_width) || num(json.width),
    height: num(json.thumbnail_height) || num(json.height),
    author: str(json.author_name),
  };
}

export async function unfurl({ url } = {}) {
  const u = await assertPublicHttpUrl(str(url));
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const pinterest = isPinterestHost(host);
  const source = pinterest ? "pinterest" : "url";
  const license = pinterest ? LICENSE.pinterest : LICENSE.unknown;
  const idBase = u.toString();
  const pinId = /\/pin\/(\d+)/.exec(u.pathname)?.[1];

  const make = (partial) => ({
    id: pinId || idBase,
    source,
    title: "",
    thumbUrl: "",
    imageUrl: "",
    pageUrl: idBase,
    width: 0,
    height: 0,
    author: "",
    license,
    ...partial,
  });

  // 1) Pinterest は公式 oEmbed を優先する
  if (pinterest) {
    try {
      const o = await pinterestOembed(idBase);
      return { items: [make(o)], source };
    } catch {
      /* OGP へフォールバック */
    }
  }

  // 2) OGP / twitter:image / JSON-LD
  let html = "";
  try {
    const { buffer } = await safeFetch(idBase, {
      maxBytes: 2 * 1024 * 1024,
      allowContentType: /^text\/html/i,
      accept: "text/html,application/xhtml+xml",
    });
    html = buffer.toString("utf8");
  } catch (e) {
    if (e instanceof BlockedUrlError) throw e;
    const err = new Error("ページを読み込めませんでした。画像を保存してからアップロードしてください。");
    err.status = 422;
    throw err;
  }

  const image =
    metaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) || jsonLdImage(html);
  const title = metaContent(html, ["og:title", "twitter:title"]) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
  if (!image) {
    const err = new Error("このページから画像を見つけられませんでした。画像を保存してからアップロードしてください。");
    err.status = 422;
    throw err;
  }

  const abs = new URL(decodeEntities(image), idBase).toString();
  return {
    items: [
      make({
        title: decodeEntities(title).trim().slice(0, 200),
        thumbUrl: abs,
        imageUrl: abs,
        width: num(metaContent(html, ["og:image:width"])),
        height: num(metaContent(html, ["og:image:height"])),
        author: metaContent(html, ["og:site_name"]) || host,
      }),
    ],
    source,
  };
}
