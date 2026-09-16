/**
 * 戦略成果物（ペルソナ / ジャーニー / 感情 / 価値提供）を板面としてPNGに焼く。
 * providers/render.js（Playwright + Chromium）の実利用例でもある。
 *   node tools/render-strategy.mjs
 */
import fs from "node:fs";
import { Renderer } from "../src/providers/render.js";

const read = f => JSON.parse(fs.readFileSync(f, "utf8"));
const persona = read("artifacts/01-persona.json");
const journey = read("artifacts/02-journey.json");
const emotion = read("artifacts/03-emotion.json");
const vp = read("artifacts/04-value-proposition.json");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Shippori+Mincho:wght@500;600&family=Inter:wght@400;500;600&display=swap');
:root{--canvas:#F4F1EA;--surface:#FBFAF7;--sunken:#EAE5DA;--ink:#1C1A17;--ink2:#5B554B;--ink3:#8A8377;
--line:#DED7C9;--ember:#C8551F;--ember-soft:#F3E3D9;--await:#A8761A;--await-soft:#F6EDDA;
--ok:#4E7A5A;--ok-soft:#E4EDE6;--stop:#A33A2C;--stop-soft:#F6E2DE;}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--canvas);color:var(--ink);
 font-family:'Zen Kaku Gothic New','IPAGothic',sans-serif;-webkit-font-smoothing:antialiased;padding:48px}
h1{font-family:'Shippori Mincho',serif;font-weight:500;font-size:30px;letter-spacing:.04em;margin-bottom:10px}
.sub{font-size:12px;color:var(--ink2);margin-bottom:28px;line-height:1.7;max-width:1100px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:20px}
.lab{font-size:10px;color:var(--ink3);letter-spacing:.06em;margin-bottom:6px}
.tag{display:inline-block;font-size:10px;font-weight:500;padding:3px 8px;border-radius:4px;
 background:var(--sunken);color:var(--ink2)}
.quote{font-family:'Shippori Mincho',serif;font-size:15px;line-height:1.85;color:var(--ink);
 border-left:3px solid var(--ember);padding-left:14px}
ul{list-style:none} li{font-size:12px;line-height:1.75;color:var(--ink2);padding-left:14px;position:relative}
li::before{content:'';position:absolute;left:0;top:9px;width:5px;height:5px;border-radius:50%;background:var(--ink3)}
`;

const page = (title, body, w) =>
  `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body style="width:${w}px">${body}</body>`;

/* ── 1. ペルソナ ── */
const P = persona.personas[0];
const board1 = page("persona", `
<h1>ペルソナ</h1>
<div class="sub">${esc(P.name)}（${esc(P.role)}）を主軸に、決裁者とガバナンス担当を副に置く。誰に売らないかも決めている。</div>
<div style="display:grid;grid-template-columns:1.55fr 1fr;gap:20px;align-items:start">
  <div class="card" style="border-color:var(--ember)">
    <div style="display:flex;gap:14px;align-items:baseline;margin-bottom:6px">
      <div style="font-size:22px;font-weight:700">${esc(P.name)}</div>
      <div class="tag" style="background:var(--ember-soft);color:var(--ember)">主ペルソナ</div>
    </div>
    <div style="font-size:12px;color:var(--ink2);margin-bottom:16px">${esc(P.age)}歳 ・ ${esc(P.role)}<br>${esc(P.org)}</div>
    <div class="quote" style="margin-bottom:20px">「${esc(P.quote)}」</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div><div class="lab">目指していること</div><ul>${P.goals.map(g => `<li>${esc(g)}</li>`).join("")}</ul></div>
      <div><div class="lab">詰まっていること</div><ul>${P.frustrations.map(g => `<li style="color:var(--stop)">${esc(g)}</li>`).join("")}</ul></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line)">
      <div><div class="lab">使い始める引き金</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${P.triggersToAdopt.map(t => `<span class="tag" style="background:var(--ok-soft);color:var(--ok)">${esc(t)}</span>`).join("")}</div></div>
      <div><div class="lab">離れる引き金</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${P.triggersToChurn.map(t => `<span class="tag" style="background:var(--stop-soft);color:var(--stop)">${esc(t)}</span>`).join("")}</div></div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:20px">
    ${persona.personas.slice(1).map(s => `
      <div class="card">
        <div style="display:flex;gap:10px;align-items:baseline;margin-bottom:4px">
          <div style="font-size:16px;font-weight:700">${esc(s.name)}</div><div class="tag">副</div>
        </div>
        <div style="font-size:11px;color:var(--ink2);margin-bottom:12px">${esc(s.role)}</div>
        <div class="quote" style="font-size:13px;margin-bottom:14px">「${esc(s.quote)}」</div>
        <div class="lab">この人が製品に求めるもの</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${s.needsFromProduct.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      </div>`).join("")}
    <div class="card" style="background:var(--stop-soft);border-color:var(--stop)">
      <div class="lab" style="color:var(--stop)">獲得しない人</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">${esc(persona.antiPersona.name)}</div>
      <div style="font-size:11px;line-height:1.7;color:var(--ink2)">${esc(persona.antiPersona.why)}</div>
    </div>
  </div>
</div>`, 1440);

/* ── 2. ジャーニー + 感情 ── */
const st = journey.stages, cur = emotion.curve;
const CW = 228, GAP = 10, PITCH = CW + GAP, LANE = 132, H = 150;
const yv = v => 16 + ((3 - v) / 6) * (H - 32);
const pts = cur.map((c, i) => [LANE + i * PITCH + CW / 2, yv(c.after)]);
const lanes = [
  ["行動", s => esc(s.doing), "var(--ink)", "var(--surface)"],
  ["思考（内語）", s => `「${esc(s.thinking)}」`, "var(--ink2)", "var(--surface)"],
  ["接点 / 画面", s => `${esc(s.touchpoint)}<br><b style="color:var(--ember)">${esc(s.screen ?? "—")}</b>`, "var(--ink2)", "var(--surface)"],
  ["痛み", s => esc(s.painPoint), "var(--stop)", "var(--stop-soft)"],
  ["機会", s => esc(s.opportunity), "var(--ember)", "var(--ember-soft)"]
];
const crit = new Set(journey.criticalMoments.map(c => c.at));
const board2 = page("journey", `
<h1>ユーザージャーニーマップ ＋ 感情マップ</h1>
<div class="sub">${esc(journey.scenario)}</div>
<div style="display:flex;margin-bottom:6px">
  <div style="width:${LANE}px;font-size:11px;color:var(--ink3);padding-top:${H / 2 - 20}px">感情<br><span style="font-size:10px">−3 〜 +3</span></div>
  <div style="position:relative;width:${PITCH * st.length}px;height:${H}px;background:var(--surface);border-radius:10px">
    <svg width="${PITCH * st.length}" height="${H}" style="position:absolute;inset:0">
      <line x1="0" y1="${yv(0)}" x2="${PITCH * st.length}" y2="${yv(0)}" stroke="var(--line)"/>
      <polyline points="${pts.map(p => `${p[0] - LANE},${p[1]}`).join(" ")}" fill="none" stroke="var(--ember)" stroke-width="2.5" stroke-linejoin="round"/>
      ${pts.map((p, i) => {
        const peak = cur[i].after === 3, valley = cur[i].stage === emotion.valley.at || i === 4;
        return `<circle cx="${p[0] - LANE}" cy="${p[1]}" r="${peak || valley ? 7 : 5}"
          fill="${valley ? "var(--await)" : "var(--ember)"}" stroke="var(--surface)" stroke-width="2.5"/>`;
      }).join("")}
    </svg>
    <div style="position:absolute;left:${4 * PITCH + 8}px;top:${yv(0) + 14}px;width:250px;font-size:10px;color:var(--await);line-height:1.6">
      最深部 — 決裁のこわさは消さない。こわさに見合う情報を渡す</div>
  </div>
</div>
<div style="display:flex">
  <div style="width:${LANE}px"></div>
  <div style="display:flex;gap:${GAP}px">
    ${st.map((s, i) => `<div style="width:${CW}px">
      <div style="background:${crit.has(s.id) ? "var(--await-soft)" : "var(--ink)"};border-radius:8px;padding:9px 13px">
        <div style="font-family:Inter;font-size:10px;font-weight:600;color:${crit.has(s.id) ? "var(--await)" : "var(--ink3)"}">${i + 1}</div>
        <div style="font-size:14px;font-weight:700;color:${crit.has(s.id) ? "var(--await)" : "var(--surface)"}">${esc(s.stage)}</div>
      </div>
      <div style="font-size:10px;color:var(--ink3);padding:6px 4px;line-height:1.5">${esc(s.label)}</div>
    </div>`).join("")}
  </div>
</div>
${lanes.map(([name, fn, color, bg]) => `
<div style="display:flex;margin-top:8px">
  <div style="width:${LANE}px;font-size:11px;font-weight:500;color:var(--ink3);padding-top:11px">${name}</div>
  <div style="display:flex;gap:${GAP}px;align-items:stretch">
    ${st.map(s => `<div style="width:${CW}px;background:${bg};border-radius:6px;padding:11px 13px;
      font-size:10.5px;line-height:1.65;color:${color}">${fn(s)}</div>`).join("")}
  </div>
</div>`).join("")}`, 2400);

/* ── 3. 価値提供マップ ── */
const cp = vp.customerProfile, vm = vp.valueMap;
const col = (title, items, render, accent) => `
  <div><div class="lab" style="color:${accent};font-size:11px;font-weight:500;margin-bottom:10px">${title}</div>
  <div style="display:flex;flex-direction:column;gap:7px">${items.map(render).join("")}</div></div>`;
const chip = (text, sub, bg, fg) => `
  <div style="background:${bg};border-radius:6px;padding:10px 12px">
    <div style="font-size:11.5px;line-height:1.6;color:var(--ink)">${esc(text)}</div>
    ${sub ? `<div style="font-size:10px;color:${fg};margin-top:3px">${esc(sub)}</div>` : ""}</div>`;
const board3 = page("vp", `
<h1>価値提供マップ</h1>
<div class="sub">Value Proposition Canvas — 右が顧客、左が製品。線でつながらない価値提案は、まだ設計ではない。</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
  <div class="card">
    <div style="font-size:15px;font-weight:700;margin-bottom:4px">製品がすること</div>
    <div style="font-size:11px;color:var(--ink3);margin-bottom:18px">Value Map</div>
    <div style="display:flex;flex-direction:column;gap:18px">
      ${col("提供物", vm.productsAndServices, p => chip(p.name + " — " + p.desc, p.screen, "var(--sunken)", "var(--ember)"), "var(--ink2)")}
      ${col("痛みを取り除くもの", vm.painRelievers, p => chip(p.how, `${p.relieves} / ${p.screen}`, "var(--ok-soft)", "var(--ok)"), "var(--ok)")}
      ${col("利得を生むもの", vm.gainCreators, p => chip(p.how, `${p.creates} / ${p.screen}`, "var(--ember-soft)", "var(--ember)"), "var(--ember)")}
    </div>
  </div>
  <div class="card">
    <div style="font-size:15px;font-weight:700;margin-bottom:4px">顧客が抱えているもの</div>
    <div style="font-size:11px;color:var(--ink3);margin-bottom:18px">Customer Profile — ${esc(cp.jobs.length)} jobs / ${esc(cp.pains.length)} pains / ${esc(cp.gains.length)} gains</div>
    <div style="display:flex;flex-direction:column;gap:18px">
      ${col("片づけたい用事", cp.jobs, j => chip(j.statement, `${j.id} ・ ${j.type} ・ 重要度 ${j.importance}/5`, "var(--sunken)", "var(--ink3)"), "var(--ink2)")}
      ${col("痛み", cp.pains, p => chip(p.statement, `${p.id} ・ 深刻度 ${p.severity}/5`, "var(--stop-soft)", "var(--stop)"), "var(--stop)")}
      ${col("得たい利得", cp.gains, g => chip(g.statement, `${g.id} ・ ${g.type} ・ 魅力度 ${g.attractiveness}/5`, "var(--await-soft)", "var(--await)"), "var(--await)")}
    </div>
  </div>
</div>
<div class="card" style="margin-top:24px;background:var(--ember-soft);border-color:var(--ember)">
  <div class="lab" style="color:var(--ember)">最も強い適合 / 最も危うい前提</div>
  <div style="font-size:13px;line-height:1.8">
    <b>強み</b> ${esc(vp.fitAnalysis.strongestFit.pain)} × ${esc(vp.fitAnalysis.strongestFit.reliever)} — ${esc(vp.fitAnalysis.strongestFit.why)}<br>
    <b style="color:var(--stop)">危うさ</b> ${esc(vp.fitAnalysis.riskiestAssumption)}
  </div>
</div>`, 1600);

const r = new Renderer();
const jobs = [
  ["01-persona", board1, 1440],
  ["02-journey-emotion", board2, 2400],
  ["04-value-proposition", board3, 1600]
];
for (const [name, html, w] of jobs) {
  const out = `artifacts/boards/${name}.png`;
  const res = await r.shot({ html, width: w, out, scale: 2 });   // 高さは内容に合わせて自動
  console.log(`✓ ${out}  ${w}×${res.height} @2x`);
}
