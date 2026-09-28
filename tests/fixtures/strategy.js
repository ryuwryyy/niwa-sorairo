// 戦略シート(analyze の strategy タスク)の形をした固定データ。単体テスト・偽 Claude・FigJam プラグインのテストで共有する
export const strategyFixture = (ids = ["p1", "p2"]) => ({
  personas: [1, 2].map((i) => ({
    name: `(テスト)ペルソナ${i}`, profile: "30代・会社員", context: "通勤中にスマホで", goals: ["早く終えたい"], frustrations: ["入力が消える"],
    quote: "もう一回入れるのはつらい", evidenceIds: ids.slice(0, 1),
  })),
  emotionMap: ["知る", "登録", "使う", "困る", "続ける"].map((stage, i) => ({
    stage, doing: "行動", thinking: "考え", feeling: "気持ち", score: [1, -1, 0, -2, 1][i], painPoint: "痛み", opportunity: "機会", evidenceIds: ids.slice(0, 1),
  })),
  hypotheses: [{ statement: "(テスト)仮説", basis: "根拠", howToVerify: "検証", evidenceIds: ids }],
  insights: [{ text: "(テスト)本音", tension: "葛藤", evidenceIds: ids }],
  coreIdea: { title: "(テスト)コア", statement: "一文", howMightWe: "どうすれば〜できるか" },
  problems: [{ problem: "(テスト)課題", who: "初めての人", impact: "離脱", evidenceIds: ids }],
  solutions: [{ name: "(テスト)解決策", kind: "機能改善", description: "説明", solves: "課題", firstStep: "一歩" }],
  toneManner: { keywords: ["やさしい", "明快"], voice: "話し方", doList: ["短く"], dontList: ["責めない"], color: "色", typography: "書体", imagery: "画" },
  creativeBrief: {
    background: "背景", objective: "目的", target: "対象", insight: "本音", proposition: "(テスト)提案",
    reasonsToBelieve: ["根拠"], tone: "トーン", mandatories: ["必須"], deliverables: ["成果物"], kpis: ["KPI"],
  },
});
