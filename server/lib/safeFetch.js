/**
 * SSRF セーフな外部取得（docs/studio/research-reference-sources.md §E）。
 *
 * - http/https のみ。ポートは 80/443 のみ。userinfo（user:pass@）は拒否
 * - localhost / *.local / *.internal / *.localhost / メタデータホストを拒否
 * - IP リテラルもホスト名の解決結果（全アドレス）も、プライベート/ループバック/
 *   リンクローカル/マルチキャスト/IPv4-mapped なら拒否
 * - リダイレクトは自動追従せず（redirect: "manual"）、毎ホップ再検証する（最大 3 回）
 * - content-type は image/* のみ（svg は XSS 対策で拒否）。octet-stream は拡張子で救済
 * - サイズ上限を超えたら読み込みを中断する
 *
 * 既知の残存リスク: 検証 → 接続の間に DNS が差し替わる rebinding は防ぎきれない
 * （厳密にやるには undici の connect.lookup で検証済み IP に直接つなぐ必要がある）。
 */
import dnsPromises from "node:dns/promises";
import net from "node:net";

export const MAX_BYTES = 6 * 1024 * 1024; // 6MB（Vercel のレスポンス上限 4.5MB には別途注意）
export const TIMEOUT_MS = 12_000;
export const MAX_REDIRECTS = 3;

export const UA = "Mozilla/5.0 (compatible; SorairoStudio/1.0; +moodboard image proxy)";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.amazonaws.com",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa", ".onion"];

const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|heic|heif|tiff?)$/i;

const toInt32 = (ip) => ip.split(".").reduce((a, o) => ((a << 8) >>> 0) + Number(o), 0) >>> 0;

function inV4(ip, cidr) {
  const [base, bits] = cidr.split("/");
  const n = Number(bits);
  const mask = n === 0 ? 0 : ((~0 << (32 - n)) >>> 0);
  return (toInt32(ip) & mask) === (toInt32(base) & mask);
}

/** プライベート・ループバック・リンクローカル・マルチキャスト等なら true */
export function isPrivateIp(ip) {
  const addr = String(ip || "").trim();
  if (net.isIPv4(addr)) return BLOCKED_V4.some((c) => inV4(addr, c));
  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase();
    const mapped = /^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateIp(mapped[1]); // IPv4-mapped / compat は中身を再判定
    if (lower === "::1" || lower === "::") return true;
    if (/^f[cd]/.test(lower)) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    if (/^ff/.test(lower)) return true; // ff00::/8 multicast
    if (lower.startsWith("2002:") || lower.startsWith("64:ff9b:")) return true; // 6to4 / NAT64
    return false;
  }
  return true; // 判定できないものは拒否
}

export class BlockedUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedUrlError";
    this.status = 400;
  }
}

/**
 * URL が「外部の公開 http(s)」であることを検証する。通れば URL を返す。
 * @param {string} raw
 * @param {{ lookup?: Function }} deps テスト用に dns.lookup を差し替えられる
 */
export async function assertPublicHttpUrl(raw, { lookup = dnsPromises.lookup } = {}) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw new BlockedUrlError("URL の形式が不正です");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new BlockedUrlError("http / https 以外のスキームは使えません");
  }
  if (u.username || u.password) throw new BlockedUrlError("ユーザー情報付きの URL は使えません");
  if (u.port && u.port !== "80" && u.port !== "443") throw new BlockedUrlError("80 / 443 以外のポートは使えません");

  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1); // IPv6 リテラル
  if (!host) throw new BlockedUrlError("ホスト名がありません");

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new BlockedUrlError("内部ネットワーク宛の URL は使えません");
    return u;
  }

  if (BLOCKED_HOSTS.has(host)) throw new BlockedUrlError("内部ホスト宛の URL は使えません");
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new BlockedUrlError("内部ホスト宛の URL は使えません");
  if (!host.includes(".")) throw new BlockedUrlError("外部のホスト名を指定してください");

  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError("ホスト名を解決できませんでした");
  }
  const list = Array.isArray(addrs) ? addrs : [addrs];
  if (!list.length) throw new BlockedUrlError("ホスト名を解決できませんでした");
  for (const a of list) {
    if (isPrivateIp(a?.address ?? a)) throw new BlockedUrlError("内部ネットワークに解決される URL は使えません");
  }
  return u;
}

async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared && declared > maxBytes) throw new BlockedUrlError("画像が大きすぎます");

  if (!res.body || typeof res.body.getReader !== "function") {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new BlockedUrlError("画像が大きすぎます");
    return buf;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BlockedUrlError("画像が大きすぎます");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/**
 * 画像（既定）を安全に取得する。
 * @param {string} rawUrl
 * @param {object=} opts
 * @param {number=} opts.maxBytes
 * @param {number=} opts.timeoutMs
 * @param {RegExp=} opts.allowContentType 既定は /^image\//
 * @param {string=} opts.accept Accept ヘッダ
 * @param {Function=} opts.lookup   DNS（テスト用差し替え）
 * @param {Function=} opts.fetchImpl fetch（テスト用差し替え）
 * @returns {Promise<{ buffer: Buffer, contentType: string, finalUrl: string }>}
 */
export async function safeFetch(rawUrl, opts = {}) {
  const {
    maxBytes = MAX_BYTES,
    timeoutMs = TIMEOUT_MS,
    allowContentType = /^image\//i,
    accept = "image/*",
    lookup,
    fetchImpl,
  } = opts;
  const doFetch = fetchImpl || ((...a) => fetch(...a));

  let target = String(rawUrl || "");
  let res = null;
  let finalUrl = target;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const u = await assertPublicHttpUrl(target, { lookup });
    finalUrl = u.toString();

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      res = await doFetch(finalUrl, {
        method: "GET",
        redirect: "manual",
        signal: ac.signal,
        headers: { Accept: accept, "User-Agent": UA, "Accept-Encoding": "identity" },
      });
    } catch (e) {
      if (e?.name === "AbortError") {
        const err = new Error("取得がタイムアウトしました");
        err.status = 504;
        throw err;
      }
      const err = new Error(`取得に失敗しました: ${e?.message || e}`);
      err.status = 502;
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new BlockedUrlError("Location の無いリダイレクトです");
      if (hop === MAX_REDIRECTS) throw new BlockedUrlError("リダイレクトが多すぎます");
      target = new URL(loc, finalUrl).toString();
      continue;
    }
    break;
  }

  if (!res.ok) {
    const err = new Error(`取得元が ${res.status} を返しました`);
    err.status = 502;
    throw err;
  }

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const isOctet = contentType === "application/octet-stream" || contentType === "";
  const okType =
    allowContentType.test(contentType) || (isOctet && IMAGE_EXT.test(new URL(finalUrl).pathname));
  if (!okType || /^image\/svg/.test(contentType)) {
    const err = new Error(`画像ではありません（${contentType || "不明"}）`);
    err.status = 415;
    throw err;
  }

  const buffer = await readCapped(res, maxBytes);
  return { buffer, contentType: contentType || "application/octet-stream", finalUrl };
}

export default safeFetch;
