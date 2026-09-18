/**
 * 開発用: Vercel Serverless Function（api/**.js の `export default (req, res)`）を
 * Vite の dev サーバに同じパスでマウントする。`vercel dev` 無しで `npm run dev` だけで動く。
 *
 * - prefix 配下のリクエストだけ扱う（既存の /api/claude プロキシには触らない）
 * - req.body（JSON 自動パース）/ req.query / res.status().json().send() を Vercel 互換で用意
 * - .env.local の値（VITE_ 以外）を process.env に流し込む
 */
import fs from "node:fs";
import path from "node:path";

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const ct = String(req.headers["content-type"] || "");
      if (!raw.length) return resolve(ct.includes("json") ? {} : "");
      if (ct.includes("application/json")) {
        try { return resolve(JSON.parse(raw.toString("utf8"))); } catch { return resolve({}); }
      }
      resolve(raw.toString("utf8"));
    });
    req.on("error", () => resolve({}));
  });
}

export function devApiPlugin({ dir = "api", prefix = "/api/studio/", env = {} } = {}) {
  return {
    name: "sorairo-dev-api",
    apply: "serve",
    configureServer(server) {
      for (const [k, v] of Object.entries(env)) {
        if (!k.startsWith("VITE_") && process.env[k] === undefined) process.env[k] = v;
      }
      const root = server.config.root;

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        if (!url.pathname.startsWith(prefix)) return next();
        const rel = url.pathname.slice(prefix.length).replace(/\/+$/, "");
        if (!rel || rel.includes("..")) return next();

        const subdir = prefix.replace(/^\/api\//, "").replace(/\/$/, "");
        const candidates = [
          path.join(dir, subdir, `${rel}.js`),
          path.join(dir, subdir, rel, "index.js"),
        ];
        const file = candidates.find((f) => fs.existsSync(path.join(root, f)));
        if (!file) return next();

        // Vercel 互換シム
        req.query = Object.fromEntries(url.searchParams);
        req.body = await readBody(req);
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (obj) => {
          if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(obj));
          return res;
        };
        res.send = (body) => {
          if (Buffer.isBuffer(body) || typeof body === "string") { res.end(body); return res; }
          return res.json(body);
        };
        res.redirect = (code, to) => {
          if (typeof code === "string") { to = code; code = 302; }
          res.statusCode = code; res.setHeader("Location", to); res.end(); return res;
        };

        try {
          const mod = await server.ssrLoadModule("/" + file.split(path.sep).join("/"));
          const handler = mod.default;
          if (typeof handler !== "function") throw new Error(`${file} に default export のハンドラがありません`);
          await handler(req, res);
          if (!res.writableEnded) res.end();
        } catch (e) {
          console.error(`[dev-api] ${url.pathname}:`, e);
          if (!res.headersSent) res.status(500).json({ error: { message: e?.message || "dev api error" } });
          else res.end();
        }
      });
    },
  };
}
