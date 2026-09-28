/**
 * Vercel Serverless — Sorairo Studio の Claude 呼び出し（DESIGN.md 4.5）
 *
 * POST { op, ...payload }
 *   op: brief | insights | ideas | principles | prompt | critique | figmaSpec
 * エラーは常に { error: { message } }。キーはサーバ側だけ（ANTHROPIC_API_KEY）。
 */
import { callClaude, imageBlock, extractJson } from "../../server/lib/claude.js";
import { safeFetch } from "../../server/lib/safeFetch.js";
import {
  briefSchema,
  briefSystem,
  principlesSchema,
  principlesSystem,
  promptSchema,
  promptSystem,
  critiqueSchema,
  critiqueSystem,
  figmaSpecSystem,
  validateSpec,
} from "../../server/lib/aiOps.js";
import { insightsSchema, insightsSystem, ideasSchema, ideasSystem } from "../../server/lib/ideaOps.js";

export const config = { maxDuration: 60 };

const MAX_BASE64 = 6_000_000; // 1 枚あたりの base64 文字数
const MAX_BODY = 8 * 1024 * 1024; // JSON 全体

const fail = (res, status, message) => res.status(status).json({ error: { message } });
const jsonText = (v) => JSON.stringify(v ?? null);

/** 画像入力（base64 か url）を Claude の image ブロックにする。url は SSRF ガード経由で base64 化 */
async function toImageBlock(image, label = "image") {
  if (!image || typeof image !== "object") throw Object.assign(new Error(`${label} required`), { status: 400 });
  if (image.base64) {
    if (String(image.base64).length > MAX_BASE64) {
      throw Object.assign(new Error("画像が大きすぎます（base64 6,000,000 文字まで）"), { status: 413 });
    }
    return imageBlock({ base64: String(image.base64), mime: image.mime || "image/jpeg" });
  }
  if (image.url) {
    // ホットリンク制限のある CDN があるので、URL は自前で取得して base64 で渡す
    const { buffer, contentType } = await safeFetch(String(image.url), { maxBytes: 4 * 1024 * 1024 });
    return imageBlock({ base64: buffer.toString("base64"), mime: contentType });
  }
  throw Object.assign(new Error(`${label} には base64 か url が必要です`), { status: 400 });
}

/** payload 内の base64 らしき長大文字列と、全体量を検査する */
function assertPayloadSize(body, raw) {
  if (raw && raw.length > MAX_BODY) {
    throw Object.assign(new Error("リクエストが大きすぎます（8MB まで）"), { status: 413 });
  }
  const seen = new Set();
  let total = 0;
  const walk = (v) => {
    if (typeof v === "string") {
      if (v.length > MAX_BASE64) throw Object.assign(new Error("画像が大きすぎます（base64 6,000,000 文字まで）"), { status: 413 });
      total += v.length;
      if (total > MAX_BODY) throw Object.assign(new Error("リクエストが大きすぎます（8MB まで）"), { status: 413 });
      return;
    }
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(body);
}

/* ---------------- 各 op ---------------- */

async function opBrief(p) {
  const user = [
    `【依頼・文脈】\n${p.context || "(未入力)"}`,
    `【対象】\n${p.audience || "(未入力)"}`,
    `【制約】\n${p.constraints || "(未入力)"}`,
    `【成果物】\n${p.deliverable || "kv"}`,
    p.frames && Object.keys(p.frames).length
      ? `【ワークショップ回答（frames）】\n${jsonText(p.frames)}\nここに書かれた言葉は最優先で拾い、言い換えずに使うこと。`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const r = await callClaude({
    system: briefSystem,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    schema: briefSchema,
    effort: "high",
    maxTokens: 8000,
  });
  if (!r.json) throw Object.assign(new Error("ブリーフの JSON を解釈できませんでした"), { status: 502 });

  // 選定された仮説がちょうど1本になるよう補正する
  const hyps = Array.isArray(r.json.hypotheses) ? r.json.hypotheses : [];
  const chosenIdx = hyps.findIndex((h) => h?.chosen);
  r.json.hypotheses = hyps.map((h, i) => ({ ...h, chosen: i === (chosenIdx >= 0 ? chosenIdx : 0) }));
  return r.json;
}

/* --- 企画（Idea）ステージ: server/lib/ideaOps.js が契約 --- */

async function opInsights(p) {
  const user = [
    `【ブリーフ】\n${jsonText(p.brief || {})}`,
    `【依頼・文脈】\n${p.context || "(未入力)"}`,
    `【対象】\n${p.audience || "(未入力)"}`,
    p.answers && Object.keys(p.answers).length
      ? `【インサイトの問いへの回答（sources の id ごと）】\n${jsonText(p.answers)}\nここに書かれた言葉は最優先で拾い、言い換えずに使うこと。`
      : "",
    Array.isArray(p.sources) && p.sources.length
      ? `【インサイトの探し方（source には必ずこの id のどれかを書く）】\n${jsonText(p.sources)}`
      : "",
    Array.isArray(p.teachers) && p.teachers.length
      ? `【先生＝受賞作の分解（構造だけを学ぶ。名前・絵をなぞらない）】\n${jsonText(p.teachers)}`
      : "",
    "インサイトを 5 本、緊張を 5 本、それぞれ別の角度から出してください。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const r = await callClaude({
    system: insightsSystem,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    schema: insightsSchema,
    effort: "high",
    maxTokens: 6000,
  });
  if (!r.json) throw Object.assign(new Error("インサイトの JSON を解釈できませんでした"), { status: 502 });

  // source は渡した id のいずれかに丸める（検証できない id は UI に流さない）
  const allowed = new Set((Array.isArray(p.sources) ? p.sources : []).map((s) => String(s?.id || "")).filter(Boolean));
  const insights = (Array.isArray(r.json.insights) ? r.json.insights : []).map((x) => ({
    text: String(x?.text || ""),
    source: allowed.size && allowed.has(String(x?.source || "")) ? String(x.source) : "",
    evidence: String(x?.evidence || ""),
  }));
  const tensions = (Array.isArray(r.json.tensions) ? r.json.tensions : []).map((x) => ({ text: String(x?.text || "") }));
  return { insights, tensions };
}

async function opIdeas(p) {
  const user = [
    `【ブリーフ】\n${jsonText(p.brief || {})}`,
    `【採用したインサイト】\n${p.insight || "(未選択)"}`,
    `【採用した緊張】\n${p.tension || "(未選択)"}`,
    Array.isArray(p.patterns) && p.patterns.length
      ? `【使える型（patterns には必ずこの id のどれかを書く）】\n${jsonText(p.patterns)}`
      : "",
    Array.isArray(p.teachers) && p.teachers.length
      ? `【先生＝受賞作の分解（構造だけを学ぶ。名前・絵をなぞらない）】\n${jsonText(p.teachers)}`
      : "",
    Array.isArray(p.kvGrammar) && p.kvGrammar.length ? `【KV の文法】\n${jsonText(p.kvGrammar)}` : "",
    Array.isArray(p.taglineDirections) && p.taglineDirections.length
      ? `【タグラインの方向】\n${jsonText(p.taglineDirections)}`
      : "",
    "上のインサイトと緊張から、キービジュアル 1 枚で成立するコアアイデアをちょうど 6 案出してください。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const r = await callClaude({
    system: ideasSystem,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    schema: ideasSchema,
    effort: "high",
    maxTokens: 8000,
  });
  if (!r.json) throw Object.assign(new Error("アイデアの JSON を解釈できませんでした"), { status: 502 });

  const allowed = new Set((Array.isArray(p.patterns) ? p.patterns : []).map((x) => String(x?.id || "")).filter(Boolean));
  const num = (v) => Math.max(1, Math.min(5, Math.round(Number(v) || 0) || 1));
  const ideas = (Array.isArray(r.json.ideas) ? r.json.ideas : []).map((x) => ({
    oneLiner: String(x?.oneLiner || ""),
    twist: String(x?.twist || ""),
    kvConcept: String(x?.kvConcept || ""),
    tagline: String(x?.tagline || ""),
    why: String(x?.why || ""),
    risk: String(x?.risk || ""),
    patterns: (Array.isArray(x?.patterns) ? x.patterns : [])
      .map((id) => String(id))
      .filter((id) => !allowed.size || allowed.has(id))
      .slice(0, 3),
    scores: {
      idea: num(x?.scores?.idea),
      execution: num(x?.scores?.execution),
      impact: num(x?.scores?.impact),
    },
  }));
  return { ideas };
}

async function opPrinciples(p) {
  // Adobe Stock Developer Terms §9: Stock 作品とそのメタデータの ML/AI 利用は禁止
  if (p.source === "adobe") {
    throw Object.assign(new Error("Adobe Stock 素材は利用規約により AI 解析に使えません（表示・参考のみ）"), { status: 400 });
  }
  const img = await toImageBlock(p.image, "image");
  const role = ["composition", "palette", "lighting", "texture", "typography", "mood", "subject"].includes(p.role)
    ? p.role
    : "mood";

  const r = await callClaude({
    system: principlesSystem,
    messages: [
      {
        role: "user",
        content: [
          img,
          {
            type: "text",
            text: `この参照画像を役割 "${role}" として使います。${role} に関する再利用可能な技法だけを原理として抽出してください。出所: ${p.source || "unknown"}。`,
          },
        ],
      },
    ],
    schema: principlesSchema,
    effort: "medium",
    maxTokens: 2000,
  });
  if (!r.json) throw Object.assign(new Error("原理抽出の JSON を解釈できませんでした"), { status: 502 });
  return r.json;
}

async function opPrompt(p) {
  const compiled = p.compiled || {};
  const guide = p.promptGuide || {};
  const user = [
    `【下書き（決定論的コンパイラ出力）EN】\n${compiled.en || ""}`,
    `【下書きのブロック】\n${jsonText(compiled.blocks || [])}`,
    `【ブリーフ】\n${jsonText(p.brief || {})}`,
    `【方向（アートディレクション変数）】\n${jsonText(p.direction || {})}`,
    `【参照（原理のみ / 画像は別途モデルへ渡す）】\n${jsonText(p.refs || [])}`,
    guide.principles || guide.pitfalls ? `【プロンプトガイド】\n${jsonText(guide)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const r = await callClaude({
    system: promptSystem,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    schema: promptSchema,
    effort: "medium",
    maxTokens: 4000,
  });
  if (!r.json) throw Object.assign(new Error("プロンプトの JSON を解釈できませんでした"), { status: 502 });
  return r.json;
}

async function opCritique(p) {
  const img = await toImageBlock(p.image, "image");
  const user = `【ブリーフ】\n${jsonText(p.brief || {})}\n\n【使ったプロンプト】\n${
    typeof p.prompt === "string" ? p.prompt : jsonText(p.prompt || {})
  }\n\n【方向】\n${jsonText(p.direction || {})}\n\nこの画像を6基準で採点し、改善案を3つ出してください。`;

  const r = await callClaude({
    system: critiqueSystem,
    messages: [{ role: "user", content: [img, { type: "text", text: user }] }],
    schema: critiqueSchema,
    effort: "high",
    maxTokens: 4000,
  });
  if (!r.json) throw Object.assign(new Error("批評の JSON を解釈できませんでした"), { status: 502 });

  const s = r.json.scores || {};
  const sum = ["concept", "composition", "hierarchy", "color", "craft", "brand"].reduce(
    (a, k) => a + (Number(s[k]) || 0),
    0,
  );
  r.json.total = sum; // total は必ず合計に一致させる
  return r.json;
}

async function opFigmaSpec(p) {
  const content = [];
  if (p.image && (p.image.base64 || p.image.url)) content.push(await toImageBlock(p.image, "image"));
  content.push({
    type: "text",
    text: [
      `【案件】${p.brief?.problem || p.name || "無題"} / 成果物: ${p.deliverable || "kv"}`,
      `【抽出パレット】${jsonText(p.palette || [])}`,
      p.tokens ? `【既存トークン】${jsonText(p.tokens)}` : "",
      p.spec ? `【下書き spec（これを土台に調整する）】${jsonText(p.spec)}` : "",
      "上記から spec JSON を作ってください。JSON だけを返します。",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  // node ツリーが再帰構造なので構造化出力は使えない（再帰スキーマ非対応）。本文から JSON を取る。
  const r = await callClaude({
    system: figmaSpecSystem,
    messages: [{ role: "user", content }],
    effort: "medium",
    maxTokens: 12000,
  });

  const raw = r.json ?? extractJson(r.text);
  const v = validateSpec(raw, { name: p.name || p.brief?.promise || "Sorairo" });
  if (!v.ok) {
    if (p.spec && typeof p.spec === "object") {
      return { spec: p.spec, warning: `AI の spec が不正だったため下書きをそのまま返しました（${v.error}）` };
    }
    throw Object.assign(new Error(`spec を生成できませんでした（${v.error}）`), { status: 502 });
  }
  return { spec: v.spec, ...(v.warning ? { warning: v.warning } : {}) };
}

const OPS = {
  brief: opBrief,
  insights: opInsights,
  ideas: opIdeas,
  principles: opPrinciples,
  prompt: opPrompt,
  critique: opCritique,
  figmaSpec: opFigmaSpec,
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "Method Not Allowed");

  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(res, 500, "ANTHROPIC_API_KEY is not configured on the server");
  }

  let body;
  try {
    const raw = typeof req.body === "string" ? req.body : null;
    body = raw ? JSON.parse(raw || "{}") : req.body || {};
    assertPayloadSize(body, raw);
  } catch (e) {
    return fail(res, e.status || 400, e.message || "リクエストを解釈できませんでした");
  }

  const run = OPS[body.op];
  if (!run) return fail(res, 400, `unknown op: ${String(body.op || "")}`);

  try {
    const out = await run(body);
    return res.status(200).json(out);
  } catch (e) {
    const status = Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500;
    return fail(res, status, e?.message || "AI 処理に失敗しました");
  }
}
