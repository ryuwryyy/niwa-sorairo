import test from "node:test";
import assert from "node:assert/strict";
import { safeFetch, assertPublicHttpUrl, isPrivateIp, BlockedUrlError } from "../../server/lib/safeFetch.js";

/** 常に公開 IP を返す DNS スタブ */
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
/** 内部 IP に解決するホスト */
const privateLookup = async () => [{ address: "10.0.0.5", family: 4 }];
/** 1 つだけ内部（DNS リバインディング風） */
const mixedLookup = async () => [
  { address: "93.184.216.34", family: 4 },
  { address: "127.0.0.1", family: 4 },
];

function fakeResponse({ status = 200, headers = {}, body = Buffer.alloc(0) }) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const chunks = Array.isArray(body) ? body : [body];
  let i = 0;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => h.get(String(k).toLowerCase()) ?? null },
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { done: false, value: new Uint8Array(chunks[i++]) } : { done: true }),
        cancel: async () => {},
      }),
    },
    arrayBuffer: async () => Buffer.concat(chunks),
  };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/* ---------------- isPrivateIp ---------------- */

test("isPrivateIp: 代表的な内部レンジをすべて拒否する", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "2002::1",
    "64:ff9b::1",
  ]) {
    assert.equal(isPrivateIp(ip), true, `${ip} は拒否されるべき`);
  }
});

test("isPrivateIp: 公開 IP は通す", () => {
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:2800:220:1::1", "172.32.0.1"]) {
    assert.equal(isPrivateIp(ip), false, `${ip} は通すべき`);
  }
});

/* ---------------- assertPublicHttpUrl ---------------- */

test("IP リテラルの内部アドレスを拒否する", async () => {
  for (const u of ["http://127.0.0.1/x", "http://169.254.169.254/", "http://[::1]/", "http://10.0.0.5:80/a.png"]) {
    await assert.rejects(() => assertPublicHttpUrl(u, { lookup: publicLookup }), BlockedUrlError, `${u} を拒否`);
  }
});

test("localhost / *.local / *.internal / 単一ラベルを拒否する", async () => {
  for (const u of [
    "http://localhost/",
    "http://localhost:3000/a.png",
    "http://foo.local/a.png",
    "http://svc.internal/a.png",
    "http://app.localhost/a.png",
    "http://metadata.google.internal/",
    "http://intranet/a.png",
  ]) {
    await assert.rejects(() => assertPublicHttpUrl(u, { lookup: publicLookup }), BlockedUrlError, `${u} を拒否`);
  }
});

test("http/https 以外のスキーム・userinfo・妙なポートを拒否する", async () => {
  for (const u of [
    "file:///etc/passwd",
    "gopher://example.com/",
    "data:image/png;base64,AAAA",
    "http://user:pass@example.com/a.png",
    "http://example.com:6379/a.png",
  ]) {
    await assert.rejects(() => assertPublicHttpUrl(u, { lookup: publicLookup }), BlockedUrlError, `${u} を拒否`);
  }
});

test("内部 IP に解決されるホスト名を拒否する（1 つでも該当すれば拒否）", async () => {
  await assert.rejects(() => assertPublicHttpUrl("https://evil.example/a.png", { lookup: privateLookup }), BlockedUrlError);
  await assert.rejects(() => assertPublicHttpUrl("https://rebind.example/a.png", { lookup: mixedLookup }), BlockedUrlError);
});

test("公開ホストは通る", async () => {
  const u = await assertPublicHttpUrl("https://cdn.example.com/a.png?x=1", { lookup: publicLookup });
  assert.equal(u.hostname, "cdn.example.com");
});

/* ---------------- safeFetch ---------------- */

test("公開画像を取得できる", async () => {
  const out = await safeFetch("https://cdn.example.com/a.png", {
    lookup: publicLookup,
    fetchImpl: async () => fakeResponse({ headers: { "content-type": "image/png" }, body: PNG }),
  });
  assert.equal(out.contentType, "image/png");
  assert.equal(out.finalUrl, "https://cdn.example.com/a.png");
  assert.deepEqual([...out.buffer], [...PNG]);
});

test("画像以外の content-type は 415 で拒否する", async () => {
  for (const ct of ["text/html", "application/json", "image/svg+xml"]) {
    await assert.rejects(
      () =>
        safeFetch("https://cdn.example.com/a", {
          lookup: publicLookup,
          fetchImpl: async () => fakeResponse({ headers: { "content-type": ct }, body: PNG }),
        }),
      (e) => e.status === 415,
      ct,
    );
  }
});

test("application/octet-stream は URL の拡張子が画像なら通す", async () => {
  const out = await safeFetch("https://cdn.example.com/a.jpg", {
    lookup: publicLookup,
    fetchImpl: async () => fakeResponse({ headers: { "content-type": "application/octet-stream" }, body: PNG }),
  });
  assert.equal(out.contentType, "application/octet-stream");

  await assert.rejects(
    () =>
      safeFetch("https://cdn.example.com/a.bin", {
        lookup: publicLookup,
        fetchImpl: async () => fakeResponse({ headers: { "content-type": "application/octet-stream" }, body: PNG }),
      }),
    (e) => e.status === 415,
  );
});

test("content-length が上限超なら本文を読まずに拒否する", async () => {
  await assert.rejects(
    () =>
      safeFetch("https://cdn.example.com/a.png", {
        lookup: publicLookup,
        fetchImpl: async () =>
          fakeResponse({ headers: { "content-type": "image/png", "content-length": String(7 * 1024 * 1024) }, body: PNG }),
      }),
    BlockedUrlError,
  );
});

test("content-length 無しでも 6MB を超えたら中断する", async () => {
  const chunk = Buffer.alloc(1024 * 1024, 1); // 1MB × 7
  const out = safeFetch("https://cdn.example.com/a.png", {
    lookup: publicLookup,
    fetchImpl: async () =>
      fakeResponse({ headers: { "content-type": "image/png" }, body: Array.from({ length: 7 }, () => chunk) }),
  });
  await assert.rejects(() => out, BlockedUrlError);
});

test("6MB ちょうど以下なら通る", async () => {
  const chunk = Buffer.alloc(1024 * 1024, 1);
  const out = await safeFetch("https://cdn.example.com/a.png", {
    lookup: publicLookup,
    fetchImpl: async () =>
      fakeResponse({ headers: { "content-type": "image/png" }, body: Array.from({ length: 6 }, () => chunk) }),
  });
  assert.equal(out.buffer.length, 6 * 1024 * 1024);
});

test("リダイレクトは毎ホップ検証する — 内部宛へ飛ばされたら拒否", async () => {
  let hop = 0;
  await assert.rejects(
    () =>
      safeFetch("https://cdn.example.com/a.png", {
        lookup: publicLookup,
        fetchImpl: async () => {
          hop += 1;
          if (hop === 1) return fakeResponse({ status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
          return fakeResponse({ headers: { "content-type": "image/png" }, body: PNG });
        },
      }),
    BlockedUrlError,
  );
  assert.equal(hop, 1, "2 ホップ目は実行されない");
});

test("リダイレクトは 3 回まで追う", async () => {
  let hop = 0;
  const impl = async () => {
    hop += 1;
    return fakeResponse({ status: 302, headers: { location: `https://cdn.example.com/${hop}.png` } });
  };
  await assert.rejects(
    () => safeFetch("https://cdn.example.com/a.png", { lookup: publicLookup, fetchImpl: impl }),
    BlockedUrlError,
  );
  assert.equal(hop, 4); // 初回 + 3 ホップ
});

test("上流が 4xx/5xx なら 502", async () => {
  await assert.rejects(
    () =>
      safeFetch("https://cdn.example.com/a.png", {
        lookup: publicLookup,
        fetchImpl: async () => fakeResponse({ status: 404, headers: { "content-type": "image/png" } }),
      }),
    (e) => e.status === 502,
  );
});

test("ブラウザ風の User-Agent と Accept を送る", async () => {
  let seen = null;
  await safeFetch("https://cdn.example.com/a.png", {
    lookup: publicLookup,
    fetchImpl: async (_u, init) => {
      seen = init;
      return fakeResponse({ headers: { "content-type": "image/png" }, body: PNG });
    },
  });
  assert.equal(seen.redirect, "manual");
  assert.match(seen.headers["User-Agent"], /Mozilla|SorairoStudio/);
  assert.equal(seen.headers.Accept, "image/*");
});
