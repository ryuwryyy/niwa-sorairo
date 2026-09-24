// E2E 用の偽 Jev・偽 Claude。本物の API は呼ばないので、CI で何度回しても課金されない。
// 公式SDKは TYPESAFE_BASE_URL / ANTHROPIC_BASE_URL で向き先を変えられるので、それをここへ向ける。
import http from "node:http";
import { demoAnswers } from "../../research/src/lib/demo.js";

const readJson = (req) => new Promise((resolve) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => resolve(JSON.parse(raw || "{}")));
});
const send = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** Jev: キーワード照合の答えに、ばらつき(決定的な擬似乱数)を足して返す */
export function startJev(port) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return http.createServer(async (req, res) => {
    const b = await readJson(req);
    const a = demoAnswers(b.state, b.questions);
    if (a.usable) a.usable.noul = 0.3 + rnd() * 0.7;
    if (a.depth) a.depth.score = rnd() * 3;
    if (a.intensity) a.intensity.score = rnd() * 3;
    if (a.feeling) {
      const labels = Object.keys(b.questions.feeling.criteria);
      const w = labels.map(() => rnd() ** 3);
      const sum = w.reduce((x, y) => x + y);
      const p = w.map((x) => x / sum);
      const i = p.indexOf(Math.max(...p));
      a.feeling = { type: "choice", choice: labels[i], confidence: p[i], probabilities: Object.fromEntries(labels.map((l, k) => [l, p[k]])) };
    }
    send(res, { model: "jev-mock", answers: a, usage: { input_tokens: 1, output_tokens: 1 } });
  }).listen(port);
}

/** Claude: 構造化出力のスキーマを見て、それに合う固定のJSONを返す */
export function startClaude(port) {
  return http.createServer(async (req, res) => {
    const b = await readJson(req);
    const props = Object.keys(b.output_config?.format?.schema?.properties || {});
    const ids = [...String(b.messages?.[0]?.content).matchAll(/\[(p\d+)\]/g)].map((m) => m[1]);
    let out;
    if (props.includes("categories")) {
      out = { categories: ["情報設計", "見た目・トーン", "手続き・フロー", "対人・サポート", "デザインの仕事"].map((label) => ({ label, description: `${label}の話` })) };
    } else if (props.includes("emotionArc")) {
      out = { summary: "(テスト)要約", emotionArc: { trigger: "きっかけ", reaction: "反応", afterglow: "余韻" }, insights: [{ text: "(テスト)インサイト", evidenceIds: ids.slice(0, 2) }] };
    } else {
      out = {
        headline: "(テスト)見出し",
        quadrantReading: ["熱狂", "好感", "違和感", "拒絶"].map((quadrant) => ({ quadrant, reading: `${quadrant}の読み` })),
        uxInsights: [1, 2, 3].map((i) => ({ insight: `(テスト)洞察${i}`, why: "理由", designImplication: "示唆", evidenceIds: ids.slice(i, i + 2) })),
        deconte: ["起", "承", "転", "結"].map((beat) => ({ beat, scene: "場面", visual: "画", copyTone: "言葉", colorLight: "光", typography: "書体", motionSound: "動き" })),
        principles: ["迷わせない", "責めない"],
      };
    }
    send(res, {
      id: "msg_mock", type: "message", role: "assistant", model: b.model, stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 1, output_tokens: 1 },
    });
  }).listen(port);
}

/** Brave: site:x.com の検索に、ページごと20件の投稿(3ページ目で尽きる)と、返信の検索に3件を返す */
export function startBrave(port) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    const q = u.searchParams.get("q") || "";
    const offset = Number(u.searchParams.get("offset") || 0);
    const reply = q.match(/@([A-Za-z0-9_]+)/);
    const phrases = ["登録でエラー、入力が消えた。最悪", "このUI最高、迷わない", "決済が少し分かりにくい", "サポートの対応に感動"];
    const results = reply
      ? [1, 2, 3].map((i) => ({ title: "返信 on X", url: `https://x.com/replier${i}/status/9${i}${reply[1].length}`, description: `返信先: @${reply[1]} わかる、${phrases[i % 4]}` }))
      : Array.from({ length: offset < 2 ? 20 : 5 }, (_, i) => {
          const n = offset * 20 + i + q.length * 100;
          return { title: `user on X: "${phrases[n % 4]} ${n}" / X`, url: `https://x.com/user${n % 7}/status/${n}`, description: `${phrases[n % 4]} ${n}` };
        });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "search", web: { results } }));
  }).listen(port);
}
