// フロントの純粋ロジック(分割・CSV・書き出し・深掘りレポートの計算)のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentTranscript, speakersOf } from "../research/src/lib/segment.js";
import { parseCSV, guessColumns, splitPosts } from "../research/src/lib/csv.js";
import { parseLabels, interviewQuestions, interviewState, DEFAULT_CATEGORIES, DEFAULT_STAGES } from "../research/src/lib/presets.js";
import { demoAnswers } from "../research/src/lib/demo.js";
import { strategyToMarkdown, listeningForStrategy } from "../research/src/lib/strategy.js";
import { strategyFixture } from "./fixtures/strategy.js";
import { buildFlow, toMermaid, toFigJamPayload, toMiroTSV } from "../research/src/lib/exporters.js";
import { SAMPLE_TRANSCRIPT, SAMPLE_POSTS } from "../research/src/lib/samples.js";
import {
  selectTop, topTags, coordinates, quadrantOf, parsePastedPosts, dedupe, literalWords,
  toMarkdown, toFigJamReport, xApiQuery, FEELING_LABELS, assessQuality, qualityText,
} from "../research/src/lib/report.js";

test("議事録: 話者形式を判別し、聞き手を見分ける", () => {
  const segs = segmentTranscript(SAMPLE_TRANSCRIPT);
  const sp = speakersOf(segs);
  assert.ok(sp.find((s) => s.name === "インタビュアー").interviewer);
  assert.ok(!sp.find((s) => s.name === "佐藤").interviewer);
});

test("議事録: Zoom形式と、本文中の時刻・URLを話者と取り違えない", () => {
  const segs = segmentTranscript("田中 太郎 00:01:02\nこんにちは、今日はよろしくお願いします\n\n鈴木 00:01:10\n朝10:30に起きてアプリを開きます。https://example.com を見ます");
  assert.equal(segs[0].speaker, "田中 太郎");
  assert.equal(segs[1].speaker, "鈴木");
  assert.ok(segs[1].text.includes("10:30"));
});

test("議事録: 長い発言は文末で区切る", () => {
  const long = segmentTranscript("A: " + "これはとても長い発言です。".repeat(40));
  assert.ok(long.length > 1 && long.every((s) => s.text.length <= 330));
});

test("CSV: 引用符・改行・カンマと列の推測", () => {
  const t = parseCSV('id,full_text,url\n1,"hello, ""world""\nline2",https://x.com/a/status/1\n');
  assert.equal(t[1][1], 'hello, "world"\nline2');
  const cols = guessColumns(t[0]);
  assert.equal(cols.text, 1);
  assert.equal(cols.url, 2);
  assert.equal(splitPosts(SAMPLE_POSTS).length, 22);
});

test("インタビュー: 行動フロー・Mermaid・FigJam・Miro の書き出し", () => {
  const segs = segmentTranscript(SAMPLE_TRANSCRIPT).filter((s) => s.speaker === "佐藤");
  const cats = parseLabels(DEFAULT_CATEGORIES), stages = parseLabels(DEFAULT_STAGES);
  const q = interviewQuestions({ categoriesText: DEFAULT_CATEGORIES, stagesText: DEFAULT_STAGES });
  const rows = segs.map((s) => {
    const a = demoAnswers(interviewState(s, null, "t"), q);
    return { ...s, category: a.category.choice, catConf: a.category.confidence, stage: a.stage.choice, stageConf: a.stage.confidence, action: a.action.noul, importance: a.importance.score };
  });
  const flow = buildFlow(rows, stages, cats);
  assert.ok(flow.steps.length > 0);
  assert.match(toMermaid(flow), /^flowchart LR/);
  assert.equal(toFigJamPayload({ title: "t", rows, categoryLabels: cats, flow }).kind, "kiku/v1");
  assert.match(toMiroTSV(rows, cats), /【/);
});

test("深掘り: 貼り付けからURLを取り出し、重複をまとめる", () => {
  const posts = parsePastedPosts("UXが最高 https://x.com/a/status/1\nUXが最高 https://x.com/b/status/2\n登録で迷った");
  assert.equal(posts[0].url, "https://x.com/a/status/1");
  assert.equal(posts[0].text, "UXが最高");
  assert.equal(dedupe(posts).length, 2);
  assert.deepEqual(literalWords("めっちゃ好き、でも少しクソ"), ["好き", "くそ", "めっちゃ", "少し"]);
  assert.match(xApiQuery(["UX", "アプリ 使いにくい"]), /^\(UX OR "アプリ 使いにくい"\) lang:ja/);
});

const row = (id, feeling, usable, depth, intensity, polarity = 1) => {
  const probs = Object.fromEntries(FEELING_LABELS.map((l) => [l, 0]));
  probs[feeling] = 1;
  return { id, text: `投稿${id}`, url: `https://x.com/u/status/${id}`, feeling, feelingProbs: probs, usable, depth, intensity, literal: [], polarity };
};

test("深掘り: ふるい分けは使えない・該当なしを落とし、1グループの件数に上限を設ける", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => row(`a${i}`, "最高", 0.9, 3, 3)),
    ...Array.from({ length: 5 }, (_, i) => row(`b${i}`, "最悪", 0.9, 2, 2)),
    row("c", "該当なし", 0.99, 3, 3),
    row("d", "好き", 0.2, 3, 3),
  ];
  const top = selectTop(rows, 10);
  // 上限は max(5, 40%)。10件なら最高は5件まで、残りを最悪で埋める
  assert.equal(top.length, 10);
  assert.equal(top.filter((r) => r.feeling === "最高").length, 5);
  assert.ok(!top.some((r) => r.id === "c" || r.id === "d"));
});

test("深掘り: タグは確率0.25以上を最大2つ、最低1つ", () => {
  assert.deepEqual(topTags({ A: 0.5, B: 0.3, C: 0.2 }), ["A", "B"]);
  assert.deepEqual(topTags({ A: 0.4, B: 0.2, C: 0.4 }).length, 2);
  assert.deepEqual(topTags({ A: 0.2, B: 0.1 }), ["A"]);
});

test("深掘り: 4象限は感情語の極性と強さで決まる", () => {
  const fever = coordinates(row("1", "最高", 1, 3, 3));
  assert.deepEqual([fever.x, fever.y], [1, 1]);
  assert.equal(quadrantOf(fever).name, "熱狂");
  assert.equal(quadrantOf(coordinates(row("2", "いい", 1, 3, 0.5))).name, "好感");
  assert.equal(quadrantOf(coordinates(row("3", "悪い", 1, 3, 0.5))).name, "違和感");
  assert.equal(quadrantOf(coordinates(row("4", "くそ", 1, 3, 3))).name, "拒絶");
});

test("深掘り: Markdown と FigJam 用データに元投稿のリンクが残る", () => {
  const rows = [row("p1", "最高", 1, 3, 3), row("p2", "最悪", 1, 3, 3)].map((r) => {
    const coord = coordinates(r);
    return { ...r, coord, quadrant: quadrantOf(coord).id, tags: ["情報設計"] };
  });
  const groups = [{ label: "最高", rows: [rows[0]], analysis: { summary: "s", emotionArc: { trigger: "a", reaction: "b", afterglow: "c" }, insights: [{ text: "i", evidenceIds: ["p1"] }] } }];
  const synthesis = {
    headline: "h", quadrantReading: [{ quadrant: "熱狂", reading: "r" }],
    uxInsights: [{ insight: "u", why: "w", designImplication: "d", evidenceIds: ["p2"] }],
    deconte: [{ beat: "起", scene: "s", visual: "v", copyTone: "c", colorLight: "l", typography: "t", motionSound: "m" }],
    principles: ["迷わせない"],
  };
  const md = toMarkdown({ theme: "UX", rows, categories: [{ label: "情報設計", description: "d" }], groups, synthesis, stats: { total: 2, usable: 2 } });
  assert.match(md, /\[p1\]\(https:\/\/x\.com\/u\/status\/p1\)/);
  assert.match(md, /\[p2\]\(https:\/\/x\.com\/u\/status\/p2\)/);
  assert.match(md, /\| 起 \|/);
  const fig = toFigJamReport({ theme: "UX", rows, groups, synthesis });
  assert.equal(fig.kind, "kiku/report-v1");
  assert.equal(fig.posts[0].url, "https://x.com/u/status/p1");
  assert.equal(fig.quadrants.find((q) => q.id === "fever").reading, "r");
});

// ---- 戦略シート(research/src/lib/strategy.js) ----

test("strategy: Markdown に9項目が並び、根拠はリンクになる", () => {
  const md = strategyToMarkdown(strategyFixture(), (ids) => ids.map((id) => `[${id}](https://x.com/u/status/${id})`).join(" "));
  for (const h of ["コアアイデア", "ペルソナ", "感情マップ", "課題", "仮説", "インサイト", "解決策・サービスの提案", "トンマナ", "クリエイティブブリーフ"]) {
    assert.match(md, new RegExp(`## ${h}`), h);
  }
  assert.match(md, /\[p1\]\(https:\/\/x\.com\/u\/status\/p1\)/);
  assert.match(md, /\| 困る \| 行動 \| 考え \| 気持ち \| -2 \|/);
});

test("strategy: リスニング結果は体験に関係するものだけ、深刻度順で上限まで", () => {
  const rows = [
    { id: "a", text: "x", relevant: 0.9, severity: 1, topic: "t", intent: "i", sentiment: "中立" },
    { id: "b", text: "y", relevant: 0.2, severity: 3 },
    { id: "c", text: "z", relevant: 0.8, severity: 2.5, topic: "t", intent: "i", sentiment: "ネガティブ" },
    { id: "d", error: "x", text: "w" },
  ];
  const out = listeningForStrategy(rows, 5);
  assert.deepEqual(out.map((p) => p.id), ["c", "a"]);
  assert.deepEqual(out[0].tags, ["t", "i"]);
  assert.equal(listeningForStrategy(rows, 1).length, 1);
});

// ---- 声の質チェック ----
const qrow = (i, o = {}) => ({ id: `p${i}`, usable: 0.9, depth: 2.5, feeling: ["好き", "悪い", "最悪", "いい"][i % 4], author: `u${i}`, personal: true, ...o });

test("quality: 具体的で十分な件数なら「良い」、問題なし", () => {
  const kept = Array.from({ length: 80 }, (_, i) => qrow(i));
  const q = assessQuality({ screened: kept, kept, keep: 100, ruleExcluded: 10, jevExcluded: 5 });
  assert.equal(q.verdict, "良い");
  assert.deepEqual(q.issues, []);
  assert.equal(q.metrics.collected, 90);
});

test("quality: 少ない・浅い・宣伝だらけ・偏りは「低い」と理由を返す", () => {
  const screened = Array.from({ length: 60 }, (_, i) => qrow(i, { usable: i < 10 ? 0.8 : 0.2, depth: 0.5, feeling: "最悪", author: "same" }));
  const kept = screened.slice(0, 12);
  const q = assessQuality({ screened, kept, keep: 100, ruleExcluded: 80, jevExcluded: 20 });
  assert.equal(q.verdict, "低い");
  const text = q.issues.join("\n");
  for (const w of ["少ない", "使える投稿の割合", "具体性", "公式・広告", "偏って", "同じ人"]) assert.match(text, new RegExp(w), w);
  assert.match(qualityText(q), /判定: 低い/);
});
