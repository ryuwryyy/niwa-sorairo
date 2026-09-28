/**
 * Vercel Serverless — 画像生成（Gemini / Nano Banana 系）
 *
 * POST { prompt, refs:[{ base64, mime, role }], aspect, model?, n?, size? }
 *   → { images:[{ base64, mime }], model, blocked?, reason?, text?, partial? }
 *
 * Vercel のボディ上限はリクエスト・レスポンスとも 4.5MB。
 * 大きすぎる入力／出力はここで止め、ローカル開発サーバ（Vite ミドルウェア）では素通しする。
 */
import { generateImages, ASPECT_RATIOS, MODELS, defaultModelId } from "../../server/lib/gemini.js";

export const config = { maxDuration: 60 };

const MAX_BASE64 = 6_000_000;
const MAX_PROMPT = 6_000;
const MAX_REFS = 14;
const VERCEL_PAYLOAD = 4.3 * 1024 * 1024; // 4.5MB の内側

const fail = (res, status, message) => res.status(status).json({ error: { message } });
const onVercel = () => Boolean(process.env.VERCEL);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "Method Not Allowed");

  if (!process.env.GEMINI_API_KEY) {
    return fail(res, 500, "GEMINI_API_KEY is not configured on the server");
  }

  let body;
  let rawLength = 0;
  try {
    if (typeof req.body === "string") {
      rawLength = req.body.length;
      body = JSON.parse(req.body || "{}");
    } else {
      body = req.body || {};
      rawLength = 0;
    }
  } catch {
    return fail(res, 400, "リクエストを解釈できませんでした");
  }

  const prompt = String(body.prompt || "").trim();
  if (!prompt) return fail(res, 400, "prompt が空です");
  if (prompt.length > MAX_PROMPT) return fail(res, 400, `prompt が長すぎます（${MAX_PROMPT} 文字まで）`);

  const refs = Array.isArray(body.refs) ? body.refs : [];
  if (refs.length > MAX_REFS) return fail(res, 400, `参照画像は ${MAX_REFS} 枚までです`);
  let refBytes = 0;
  for (const r of refs) {
    const b64 = String(r?.base64 || "");
    if (!b64) return fail(res, 400, "参照画像に base64 がありません");
    if (b64.length > MAX_BASE64) return fail(res, 413, "参照画像が大きすぎます（base64 6,000,000 文字まで）");
    refBytes += b64.length;
  }
  if (onVercel() && Math.max(rawLength, refBytes) > VERCEL_PAYLOAD) {
    return fail(
      res,
      413,
      "参照画像の合計が Vercel の受信上限(4.5MB)を超えます。長辺1568px程度に縮小するか、枚数を減らしてください",
    );
  }

  const aspect = ASPECT_RATIOS.includes(body.aspect) ? body.aspect : "1:1";
  if (body.aspect && !ASPECT_RATIOS.includes(body.aspect)) {
    return fail(res, 400, `aspect が不正です: ${String(body.aspect)}`);
  }
  if (body.model && !MODELS.some((m) => m.id === body.model)) {
    return fail(res, 400, `model が不正です: ${String(body.model)}`);
  }
  const n = Math.max(1, Math.min(Number(body.n) || 1, 4));
  if (body.n != null && (Number(body.n) < 1 || Number(body.n) > 4)) {
    return fail(res, 400, "n は 1〜4 です");
  }

  try {
    const out = await generateImages({
      prompt,
      refs: refs.map((r) => ({ base64: String(r.base64), mime: r.mime || "image/png", role: r.role })),
      aspect,
      model: body.model || undefined,
      n,
      size: body.size || undefined,
    });

    // 2K/4K の base64 は Vercel のレスポンス上限を超える。ローカル開発では素通し。
    if (onVercel()) {
      const bytes = out.images.reduce((a, i) => a + String(i.base64 || "").length, 0);
      if (bytes > VERCEL_PAYLOAD) {
        return fail(
          res,
          413,
          "生成画像が大きすぎて Vercel の応答上限(4.5MB)を超えます。size を 1K にするか、ローカル開発サーバで実行してください",
        );
      }
    }

    return res.status(200).json({ ...out, model: out.model || defaultModelId() });
  } catch (e) {
    const status = Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500;
    return fail(res, status, e?.message || "画像生成に失敗しました");
  }
}
