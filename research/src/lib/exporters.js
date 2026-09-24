// 分類結果を FigJam / Miro / Mermaid に持ち出す形に変える。
import { noneLabel, painLabel } from "./presets.js";

export const CATEGORY_COLORS = ["#F6C3B8", "#C9DDF2", "#CFE6C4", "#F8DFA6", "#E2CFEE", "#F7C9DE", "#C8E8E4", "#E3E1DA"];
// FigJam の付箋プリセット色に近いもの(プラグイン側で使う)
export const FIGJAM_STICKY = ["red", "blue", "green", "yellow", "violet", "pink", "teal", "gray"];

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * 発言の分類結果から行動フローを組み立てる。
 * 行動(action≥0.5)の発言を時系列に並べ、ジャーニー段階ごとに束ね、同じ段階のペインを添える。
 */
export function buildFlow(rows, stageLabels, categoryLabels, { maxSteps = 36, painsPerStage = 3 } = {}) {
  const none = noneLabel(stageLabels);
  const pain = painLabel(categoryLabels);
  const stages = Object.keys(stageLabels).filter((s) => s !== none);

  let steps = rows.filter((r) => r.action >= 0.5 && r.stage !== none && r.category !== pain);
  if (steps.length > maxSteps) {
    // 多すぎるときは重要度の高いものを残し、順番は時系列のまま
    const keep = new Set([...steps].sort((a, b) => b.importance - a.importance).slice(0, maxSteps).map((r) => r.id));
    steps = steps.filter((r) => keep.has(r.id));
  }
  steps.sort((a, b) => a.index - b.index);

  const byStage = stages.map((name) => ({
    name,
    steps: steps.filter((r) => r.stage === name),
    pains: rows
      .filter((r) => r.category === pain && r.stage === name)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, painsPerStage),
  })).filter((s) => s.steps.length || s.pains.length);

  const edges = [];
  for (let i = 1; i < steps.length; i++) edges.push([steps[i - 1].id, steps[i].id]);
  return { stages: byStage, steps, edges };
}

const mq = (s) => clip(s, 48).replace(/"/g, "'").replace(/[\n\r]+/g, " ").replace(/[<>]/g, "");

export function toMermaid(flow) {
  const lines = ["flowchart LR"];
  flow.stages.forEach((st, si) => {
    lines.push(`  subgraph G${si}["${mq(st.name)}"]`);
    lines.push("    direction TB");
    st.steps.forEach((r) => lines.push(`    ${r.id}["${mq(r.text)}"]`));
    st.pains.forEach((r) => lines.push(`    ${r.id}_p(["😣 ${mq(r.text)}"]):::pain`));
    lines.push("  end");
  });
  flow.edges.forEach(([a, b]) => lines.push(`  ${a} --> ${b}`));
  flow.stages.forEach((st) => {
    const anchor = st.steps.at(-1);
    if (anchor) st.pains.forEach((p) => lines.push(`  ${anchor.id} -.- ${p.id}_p`));
  });
  lines.push("  classDef pain fill:#FBE3DD,stroke:#C0553A,color:#5A1F12");
  return lines.join("\n");
}

/** FigJam プラグイン(figma-plugin/)に貼り付ける JSON */
export function toFigJamPayload({ title, rows, categoryLabels, flow }) {
  const cats = Object.keys(categoryLabels);
  return {
    kind: "kiku/v1",
    title: title || "インタビュー整理",
    affinity: cats.map((c, i) => ({
      category: c,
      color: FIGJAM_STICKY[i % FIGJAM_STICKY.length],
      items: rows
        .filter((r) => r.category === c)
        .sort((a, b) => b.importance - a.importance)
        .map((r) => ({ text: r.text, speaker: r.speaker, importance: Math.round(r.importance) })),
    })).filter((g) => g.items.length),
    flow: flow && {
      stages: flow.stages.map((s) => ({
        name: s.name,
        steps: s.steps.map((r) => ({ id: r.id, text: clip(r.text, 90) })),
        pains: s.pains.map((r) => clip(r.text, 90)),
      })),
      edges: flow.edges,
    },
  };
}

/** Miro に貼り付けると1セル=1付箋になるタブ区切りテキスト(カテゴリごとに列を分ける) */
export function toMiroTSV(rows, categoryLabels) {
  const cats = Object.keys(categoryLabels).filter((c) => rows.some((r) => r.category === c));
  const cols = cats.map((c) => rows.filter((r) => r.category === c).sort((a, b) => b.importance - a.importance));
  const height = Math.max(0, ...cols.map((c) => c.length));
  const esc = (s) => s.replace(/[\t\r\n]+/g, " ");
  const out = [cats.map((c) => `【${c}】`).join("\t")];
  for (let i = 0; i < height; i++) out.push(cols.map((c) => (c[i] ? esc(c[i].text) : "")).join("\t"));
  return out.join("\n");
}
