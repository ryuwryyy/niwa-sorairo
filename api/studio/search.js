/**
 * Vercel Serverless — 参照画像の検索ルータ（DESIGN.md 4.5 / research §F）
 *
 * POST { op: "pinterest"|"adobe"|"cse"|"brave"|"unfurl"|"cannesImages", q?, page?, url?, site?, ... }
 *   → { items:[normalized], next?, source, degraded?, hint? }
 *
 * フォールバック（キーが無くても 200 を返し、UI 側で縮退表示できるようにする）:
 *   pinterest    : 公式API(自分のピン) → Brave(site:pinterest.com) → CSE(siteSearch) → none
 *   cannesImages : Brave → CSE → none
 * キーの値は絶対にレスポンスへ出さない。
 */
import {
  searchPinterest,
  searchAdobe,
  searchCse,
  searchBrave,
  unfurl,
  NotConfiguredError,
  UnsupportedError,
} from "../../server/lib/sources.js";

export const config = { maxDuration: 60 };

const fail = (res, status, message) => res.status(status).json({ error: { message } });
const softError = (e) => e instanceof NotConfiguredError || e instanceof UnsupportedError;

const HINT_PIN =
  "PINTEREST_ACCESS_TOKEN（チームアカウントの保存ピンを検索）か BRAVE_SEARCH_API_KEY / GOOGLE_CSE_KEY・GOOGLE_CSE_CX を設定してください。URL 貼り付け取り込みはキー無しで使えます。";
const HINT_WEB =
  "BRAVE_SEARCH_API_KEY か GOOGLE_CSE_KEY / GOOGLE_CSE_CX を設定してください。URL 貼り付け取り込みはキー無しで使えます。";

/**
 * 候補を順に試し、未設定・非対応なら次へ落ちる。
 * soft=true（フォールバックのあるタブ）は 401/403 も次へ落とし、最後まで駄目なら
 * 200 + degraded:"none" + hint を返す。soft=false（単独ソース）は上流エラーをそのまま投げる。
 */
async function chain(steps, hint, { soft = true } = {}) {
  let lastHard = null;
  for (const { run, degraded } of steps) {
    try {
      const out = await run();
      return degraded ? { ...out, degraded } : out;
    } catch (e) {
      if (softError(e)) continue; // キー未設定・引数不足 → 次の手段へ
      if (!soft) throw e;
      // 401/403 は「そのソースは今使えない」とみなして次へ落とす
      if (e?.status === 401 || e?.status === 403) {
        lastHard = e;
        continue;
      }
      throw e;
    }
  }
  if (lastHard) {
    return { items: [], source: "none", degraded: "none", hint: `${lastHard.message}。${hint}` };
  }
  return { items: [], source: "none", degraded: "none", hint };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "Method Not Allowed");

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return fail(res, 400, "リクエストを解釈できませんでした");
  }

  const { op, q, page, url, site, contentType, orientation, scope } = body;

  const SEARCH_OPS = ["pinterest", "cannesImages", "brave", "cse", "adobe"];
  if (SEARCH_OPS.includes(op) && !String(q || "").trim()) {
    return fail(res, 400, "検索語（q）が必要です");
  }

  try {
    let out;
    switch (op) {
      case "pinterest":
        out = await chain(
          [
            ...(process.env.PINTEREST_ACCESS_TOKEN && scope !== "public"
              ? [{ run: () => searchPinterest({ q, page }) }]
              : []),
            { run: () => searchBrave({ q, page, site: "pinterest.com" }), degraded: "brave" },
            { run: () => searchCse({ q, page, site: "pinterest.com" }), degraded: "cse" },
          ],
          HINT_PIN,
        );
        break;

      case "cannesImages":
        out = await chain(
          [
            { run: () => searchBrave({ q, page }), degraded: "brave" },
            { run: () => searchCse({ q, page }), degraded: "cse" },
          ],
          HINT_WEB,
        );
        break;

      case "brave":
        out = await chain([{ run: () => searchBrave({ q, page, site }) }], HINT_WEB, { soft: false });
        break;

      case "cse":
        out = await chain([{ run: () => searchCse({ q, page, site }) }], HINT_WEB, { soft: false });
        break;

      case "adobe":
        out = await chain(
          [{ run: () => searchAdobe({ q, page, contentType, orientation }) }],
          "ADOBE_STOCK_API_KEY を設定してください（Adobe Developer Console → Adobe Stock API）。",
          { soft: false },
        );
        break;

      case "unfurl": {
        if (!url) return fail(res, 400, "url が必要です");
        out = await unfurl({ url });
        break;
      }

      default:
        return fail(res, 400, `unknown op: ${String(op || "")}`);
    }

    return res.status(200).json(out);
  } catch (e) {
    const s = Number(e?.status);
    const status = s >= 400 && s < 500 ? s : s >= 500 && s < 600 ? 502 : 500;
    return fail(res, status, e?.message || "検索に失敗しました");
  }
}
