// 戦略シート(ペルソナ・感情マップ・仮説・インサイト・コアアイデア・課題・解決策・トンマナ・クリエイティブブリーフ)
// と、ソーシャルリスニングの FigJam 書き出し。Claude を呼ぶのは画面のボタンを押したときの1回だけ。

const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

/** 戦略シートに渡す投稿(多すぎると高くつくので上限を切る。サーバー側の上限は150) */
export const STRATEGY_MAX_POSTS = 120;

/** ソーシャルリスニングの判定結果 → Claude に渡す投稿。体験に関係するものを深刻度順に */
export function listeningForStrategy(rows, max = STRATEGY_MAX_POSTS) {
  return rows
    .filter((r) => !r.error && r.relevant >= 0.5)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, max)
    .map((r) => ({ id: r.id, text: r.text.slice(0, 400), tags: [r.topic, r.intent].filter(Boolean), feeling: r.sentiment }));
}

/** ソーシャルリスニング → FigJam プラグイン(kiku/listening-v1) */
export function toFigJamListening({ title, rows, topics, strategy }) {
  const ok = rows.filter((r) => !r.error && r.relevant >= 0.5);
  return {
    kind: "kiku/listening-v1",
    title: title || "ソーシャルリスニング",
    topics: Object.keys(topics).map((topic) => ({
      topic,
      items: ok.filter((r) => r.topic === topic).sort((a, b) => b.severity - a.severity).slice(0, 30).map((r) => ({
        text: clip(r.text, 140), url: r.url || null, sentiment: r.sentiment, intent: r.intent, severity: Math.round(r.severity),
      })),
    })).filter((t) => t.items.length),
    strategy: strategy || null,
  };
}

/** 戦略シート → Markdown。cite(ids) は根拠の投稿リンクを返す */
export function strategyToMarkdown(st, cite = (ids) => (ids || []).join(" ")) {
  const L = [];
  const list = (xs) => (xs || []).join(" / ");
  L.push("## コアアイデア", "", `**${st.coreIdea.title}** — ${st.coreIdea.statement}`, "", `問い: ${st.coreIdea.howMightWe}`, "");
  L.push("## ペルソナ");
  for (const p of st.personas) {
    L.push("", `### ${p.name}`, `- ${p.profile}`, `- 場面: ${p.context}`, `- 目的: ${list(p.goals)}`, `- 不満: ${list(p.frustrations)}`, `- 「${p.quote}」 ${cite(p.evidenceIds)}`);
  }
  L.push("", "## 感情マップ(推測)", "", "| 段階 | 行動 | 考え | 気持ち | 感情(-2〜2) | ペイン | 機会 |", "|---|---|---|---|---|---|---|");
  for (const e of st.emotionMap) {
    L.push(`| ${[e.stage, e.doing, e.thinking, e.feeling, String(e.score), e.painPoint, e.opportunity].map((s) => String(s).replace(/\|/g, "／")).join(" | ")} |`);
  }
  L.push("", "## 課題", ...st.problems.map((p) => `- **${p.problem}** — 誰: ${p.who} / 影響: ${p.impact} ${cite(p.evidenceIds)}`));
  L.push("", "## 仮説", ...st.hypotheses.map((h) => `- ${h.statement}(根拠: ${h.basis} / 確かめ方: ${h.howToVerify}) ${cite(h.evidenceIds)}`));
  L.push("", "## インサイト", ...st.insights.map((i) => `- ${i.text} — 葛藤: ${i.tension} ${cite(i.evidenceIds)}`));
  L.push("", "## 解決策・サービスの提案", ...st.solutions.map((s) => `- **${s.name}**(${s.kind}) ${s.description} — 解く課題: ${s.solves} / 最初の一歩: ${s.firstStep}`));
  const t = st.toneManner;
  L.push("", "## トンマナ", `- キーワード: ${t.keywords.join("・")}`, `- 話し方: ${t.voice}`, `- する: ${list(t.doList)}`, `- しない: ${list(t.dontList)}`, `- 色: ${t.color}`, `- 書体: ${t.typography}`, `- 画: ${t.imagery}`);
  const b = st.creativeBrief;
  L.push("", "## クリエイティブブリーフ",
    `- 背景: ${b.background}`, `- 目的: ${b.objective}`, `- 対象: ${b.target}`, `- 本音(インサイト): ${b.insight}`,
    `- 提案(一番伝えたいこと): ${b.proposition}`, `- 信じられる理由: ${list(b.reasonsToBelieve)}`, `- トーン: ${b.tone}`,
    `- 必須事項: ${list(b.mandatories)}`, `- 成果物: ${list(b.deliverables)}`, `- KPI: ${list(b.kpis)}`);
  return L.join("\n");
}
