/**
 * 企画（Idea）ステージの決定的生成器。AI キーが無いときの唯一の道なので、
 * 「日本語として読めるか」「同じ入力で同じ結果か」までを見る。
 */
import test from "node:test";
import assert from "node:assert/strict";
import craft from "../../studio/src/data/craft.json" with { type: "json" };
import patterns from "../../studio/src/data/ideaPatterns.json" with { type: "json" };
import {
  mineInsights,
  generateIdeas,
  variantIdea,
  lensTotal,
  testScore,
  ensureOneChosen,
  chosenOf,
  ideaToCore,
  fillTemplate,
  taglineTemplate,
  makeTagline,
  needsVerbStem,
  subjectPhrase,
  fragments,
  clip,
  enSentence,
  VARIANT_KINDS,
  DEFAULT_LENS,
} from "../../studio/src/lib/idea.js";

/** サンプル案件（studio/src/data/sampleProject.js）と同じブリーフ */
const BRIEF = {
  problem: "日本茶は味ではなく「作法が要りそう」という思い込みで敬遠され、日常の選択肢から外れている。",
  insight: "人が求めているのはお茶の知識ではなく、何もしなくていい 3 分間である。",
  audience: "京都市内に住む 28〜45 歳の、コーヒーは毎日飲むが日本茶は敬遠している生活者",
  promise: "湯を注いで、待つ。それだけでいい。",
  tone: ["serene", "wabi", "warm"],
  oneLiner: "作法を知らない人を、静かな3分間へ、「待つ時間の美しさ」によって",
  lighthouse: "「何もしていない時間」は、どうすれば贅沢に見えるのか？",
  successCriteria: ["1秒で「お茶の時間」だと分かる"],
};

const ANSWERS = {
  human_truth: {
    q0: "急須は持っていないのに、湯を沸かす時間は嫌いではない",
    q1: "作法を間違えるところを人に見られたくない",
  },
  category_convention: { q0: "日本茶の広告はいつも抹茶の緑と和装から始まる" },
};

const noText = (s) => {
  assert.equal(typeof s, "string");
  assert.ok(s.trim().length > 0, "空文字が出ている");
  assert.doesNotMatch(s, /undefined|null|NaN|\[object/, `未定義が漏れている: ${s}`);
};

/* ---------------- 断片とテンプレート ---------------- */

test("fragments: 文章を差し込める断片に割り、重複を落とす", () => {
  const f = fragments([BRIEF.insight, BRIEF.promise, { a: { b: "湯を注いで、待つ。" } }]);
  assert.ok(f.length >= 3);
  assert.ok(f.every((x) => x.length >= 3 && x.length <= 34));
  assert.equal(new Set(f).size, f.length);
  assert.ok(f.every((x) => !/[、。]/.test(x)), "句読点が残っている");
});

test("fillTemplate: craft の tensionPairs の {X}{Y} を順に埋める", () => {
  const pair = craft.tensionPairs.find((p) => p.id === "want_but");
  const out = fillTemplate(pair.templateJa, ["自炊", "総菜を買っ"]);
  assert.equal(out, "人は自炊したいのに、総菜を買っしてしまう");
  assert.doesNotMatch(out, /[{}]/);
  // 断片は渡した順に、1 巡したら先頭へ戻る
  assert.equal(fillTemplate("{A}と{B}と{C}", ["い", "ろ"]), "いとろとい");
  assert.equal(fillTemplate("{A}と{B}", ["い", "ろ"], 1), "ろとい");
});

test("fillTemplate: 空欄が無い型はそのまま返る / 断片が無ければ ◯◯ で埋める", () => {
  assert.equal(fillTemplate("言い切る。", ["A"]), "言い切る。");
  assert.match(fillTemplate("{A}は{B}だ。", []), /^\S+は\S+だ。$/);
});

test("taglineTemplate: 書き手向けの注記と言い換えを落とす", () => {
  assert.equal(taglineTemplate("{動詞}。（二語以内の命令形）"), "{動詞}。");
  assert.equal(taglineTemplate("私たちは、{信じること}を信じている。／{我々の立場}である。"), "私たちは、{信じること}を信じている。");
});

test("clip: 語の途中で切らず、手前の句読点まで戻る", () => {
  // 8 文字で切ると「湯を注いで、待つ」だが、読点まで戻れるなら節を丸ごと残す
  assert.equal(clip("湯を注いで、待つ。それだけでいい。", 8), "湯を注いで");
  assert.equal(clip("湯を注いで、待つ。それだけでいい。", 20), "湯を注いで、待つ。それだけでいい");
  // 戻り先が近すぎる（n の半分より手前）ときは戻らず、そのまま切る
  assert.equal(clip("あ、123456789012", 10), "あ、12345678");
  assert.equal(clip("短い"), "短い");
  assert.equal(clip("「待つ時間の美しさ」"), "待つ時間の美しさ");
});

test("subjectPhrase: 主語として置ける形にする（末尾の助詞を落とす）", () => {
  assert.equal(subjectPhrase("京都市内に住む 28〜45 歳の、コーヒーは毎日飲むが日本茶は敬遠している生活者", 20), "京都市内に住む 28〜45 歳");
  assert.equal(subjectPhrase("対象の人"), "対象の人");
});

test("enSentence", () => {
  assert.equal(enSentence("a quiet cup "), "A quiet cup.");
  assert.equal(enSentence("A quiet cup."), "A quiet cup.");
  assert.equal(enSentence(""), "");
});

test("needsVerbStem: 活用形の語幹が要る型を見分ける", () => {
  assert.equal(needsVerbStem("人は{X}したいのに、{Y}してしまう"), true);
  assert.equal(needsVerbStem("{X}だと分かっているのに、{Y}できない"), true);
  assert.equal(needsVerbStem("{X}が好きなのに、それを{Y}のは気まずい"), true);
  assert.equal(needsVerbStem("{X}は毎日そこにあるのに、{Y}は誰も知らない"), false);
  assert.equal(needsVerbStem("実態は{X}に変わったのに、まだ{Y}と呼ばれ続けている"), false);
});

test("makeTagline: 15 文字に収まる型まで落としていく", () => {
  const long = makeTagline("{当たり前}は、本当に{前提}か？", ["静かな3分間", "それだけでいい"], 0);
  assert.ok(long.length <= 15, `長すぎる: ${long}`);
  assert.equal(makeTagline("{A}。", ["待つ"], 0), "待つ。");
  assert.ok(makeTagline("", [], 0).length <= 15);
});

/* ---------------- mineInsights ---------------- */

test("mineInsights: インサイト 5 本と緊張 5 本を出す", () => {
  const r = mineInsights({
    brief: BRIEF,
    answers: ANSWERS,
    sources: craft.insightSources,
    tensionPairs: craft.tensionPairs,
  });
  assert.equal(r.insights.length, 5);
  assert.equal(r.tensions.length, 5);
  for (const it of r.insights) {
    noText(it.text);
    noText(it.evidence);
    assert.ok(craft.insightSources.some((s) => s.id === it.source), `未知の source: ${it.source}`);
    assert.equal(it.chosen, false);
    assert.match(it.text, /。$/);
  }
  for (const t of r.tensions) {
    noText(t.text);
    assert.doesNotMatch(t.text, /[{}]/, "型の空欄が残っている");
  }
  assert.equal(new Set(r.insights.map((x) => x.text)).size, 5, "5 本が同じ文になっている");
});

test("mineInsights: ブリーフと回答の言葉を実際に使う", () => {
  const r = mineInsights({ brief: BRIEF, answers: ANSWERS, sources: craft.insightSources, tensionPairs: craft.tensionPairs });
  const all = r.insights.map((x) => x.text).join("\n") + "\n" + r.tensions.map((x) => x.text).join("\n");
  assert.match(all, /京都市内に住む/, "対象がどこにも出ていない");
  assert.match(all, /急須は持っていない|作法を間違える|抹茶の緑/, "ワーク回答の言葉が使われていない");
  // 回答した探し方には、その回答が根拠として入る
  const human = r.insights.find((x) => x.source === "human_truth");
  assert.match(human.evidence, /急須は持っていない/);
});

test("mineInsights: 決定的（同じ入力 → 同じ出力）", () => {
  const args = { brief: BRIEF, answers: ANSWERS, sources: craft.insightSources, tensionPairs: craft.tensionPairs };
  assert.deepEqual(mineInsights(args), mineInsights(args));
});

test("mineInsights: データが空でも 5 本ずつ返す", () => {
  const r = mineInsights({ brief: {}, answers: {}, sources: [], tensionPairs: [] });
  assert.equal(r.insights.length, 5);
  assert.equal(r.tensions.length, 5);
  r.insights.forEach((x) => noText(x.text));
  r.tensions.forEach((x) => noText(x.text));
});

/* ---------------- generateIdeas ---------------- */

const IDEA_ARGS = {
  brief: BRIEF,
  insight: "人が求めているのはお茶の知識ではなく、何もしなくていい 3 分間である。",
  tension: "人は日本茶を飲みたいのに、作法を間違えるのが怖くて手が出ない。",
  patterns: patterns.filter((p) => ["make_invisible_visible", "absence_as_message", "hijack_ritual"].includes(p.id)),
  teachers: [],
  kvGrammar: craft.kvGrammar,
  taglineDirections: craft.taglineDirections,
};

test("generateIdeas: 6 案。全項目が埋まり、型が順に割り当てられる", () => {
  const ideas = generateIdeas(IDEA_ARGS);
  assert.equal(ideas.length, 6);
  for (const it of ideas) {
    noText(it.oneLiner);
    noText(it.twist);
    noText(it.kvConcept);
    noText(it.tagline);
    noText(it.why);
    noText(it.risk);
    assert.equal(it.patterns.length, 1);
    assert.ok(patterns.some((p) => p.id === it.patterns[0]));
    assert.equal(it.scores, null);
    assert.deepEqual(it.tests, {});
    assert.equal(it.chosen, false);
  }
  // 3 つの型が 2 周する
  assert.deepEqual(ideas.map((x) => x.patterns[0]).slice(0, 3), ideas.map((x) => x.patterns[0]).slice(3));
  assert.equal(new Set(ideas.map((x) => x.oneLiner)).size, 6, "6 案が同じ文になっている");
});

test("generateIdeas: kvConcept は英語 1 文、tagline は 15 文字以内", () => {
  for (const it of generateIdeas(IDEA_ARGS)) {
    assert.match(it.kvConcept, /^[A-Z]/, `英文の体裁でない: ${it.kvConcept}`);
    assert.match(it.kvConcept, /\.$/);
    assert.doesNotMatch(it.kvConcept, /[ぁ-んァ-ヶ一-龠]/, "KV コンセプトに日本語が混ざっている");
    assert.ok(it.tagline.length <= 15, `タグラインが長い: ${it.tagline}`);
    assert.doesNotMatch(it.tagline, /[{}（）]/, `注記や空欄が残っている: ${it.tagline}`);
  }
});

test("generateIdeas: ブリーフと緊張の言葉が本文に入る", () => {
  const all = generateIdeas(IDEA_ARGS).map((x) => `${x.oneLiner} ${x.why}`).join("\n");
  assert.match(all, /作法を間違える|何もしなくていい/);
  assert.match(all, /見えないものを見せる|不在で語る|儀式を乗っ取る/, "型の名前が出ていない");
});

test("generateIdeas: 決定的 / 型が無くても 6 案返す", () => {
  assert.deepEqual(generateIdeas(IDEA_ARGS), generateIdeas(IDEA_ARGS));
  const bare = generateIdeas({ brief: {}, patterns: [], kvGrammar: [], taglineDirections: [] });
  assert.equal(bare.length, 6);
  bare.forEach((x) => { noText(x.oneLiner); noText(x.kvConcept); });
});

test("generateIdeas: makeId で id を差し替えられる", () => {
  const ideas = generateIdeas({ ...IDEA_ARGS, makeId: (i) => `x${i}` });
  assert.deepEqual(ideas.map((x) => x.id), ["x0", "x1", "x2", "x3", "x4", "x5"]);
});

/* ---------------- 変種 ---------------- */

test("variantIdea: 4 種すべてが新しい案になり、KV に英語の一手が足される", () => {
  const base = generateIdeas(IDEA_ARGS)[0];
  for (const k of VARIANT_KINDS) {
    const v = variantIdea(base, k.id);
    assert.notEqual(v.id, base.id);
    assert.equal(v.parentId, base.id);
    assert.equal(v.source, `variant:${k.id}`);
    assert.ok(v.kvConcept.includes(k.en), "英語の変換句が入っていない");
    assert.match(v.kvConcept, /\.$/);
    assert.equal(v.risk, k.riskJa);
    assert.equal(v.chosen, false);
    assert.deepEqual(v.patterns, base.patterns);
    noText(v.oneLiner);
    noText(v.twist);
  }
});

test("variantIdea: 未知の種類は先頭の型に落とす / null は null", () => {
  const base = generateIdeas(IDEA_ARGS)[0];
  assert.equal(variantIdea(base, "しらない種類").source, `variant:${VARIANT_KINDS[0].id}`);
  assert.equal(variantIdea(null, "反転"), null);
});

/* ---------------- 採点 ---------------- */

test("lensTotal: craft の重み（40/30/30）で 100 点に換算する", () => {
  const c = craft.cannesLens.criteria;
  assert.equal(lensTotal({ idea: 5, execution: 5, impact: 5 }, c), 100);
  assert.equal(lensTotal({ idea: 1, execution: 1, impact: 1 }, c), 20);
  assert.equal(lensTotal({ idea: 5, execution: 1, impact: 1 }, c), 52); // 40 + 6 + 6
  assert.equal(lensTotal({}, c), 0);
});

test("lensTotal: criteria 未指定なら既定（60/20/20）を使う", () => {
  assert.equal(lensTotal({ idea: 5, execution: 1, impact: 1 }, []), 68);
  assert.equal(DEFAULT_LENS.reduce((a, c) => a + c.weightPct, 0), 100);
});

test("testScore: weight 付きで通過率を出す", () => {
  const all = Object.fromEntries(craft.ideaTests.map((t) => [t.id, true]));
  assert.deepEqual(testScore(all, craft.ideaTests), { passed: 10, count: 10, pct: 100 });
  assert.deepEqual(testScore({}, craft.ideaTests), { passed: 0, count: 10, pct: 0 });

  const heavy = craft.ideaTests.filter((t) => t.weight === 3).map((t) => t.id);
  const sum = craft.ideaTests.reduce((a, t) => a + t.weight, 0);
  const got = testScore(Object.fromEntries(heavy.map((id) => [id, true])), craft.ideaTests);
  assert.equal(got.passed, heavy.length);
  assert.equal(got.pct, Math.round(((heavy.length * 3) / sum) * 100));
  assert.deepEqual(testScore({ a: true }, []), { passed: 0, count: 0, pct: 0 });
});

/* ---------------- 選択と書き戻し ---------------- */

test("ensureOneChosen / chosenOf", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(ensureOneChosen(list).filter((x) => x.chosen).length, 1);
  assert.equal(ensureOneChosen(list)[0].chosen, true);
  const kept = ensureOneChosen([{ id: "a" }, { id: "b", chosen: true }]);
  assert.equal(kept[1].chosen, true);
  assert.equal(kept[0].chosen, false);
  assert.equal(chosenOf(kept).id, "b");
  assert.equal(chosenOf([]), null);
  assert.deepEqual(ensureOneChosen([]), []);
});

test("ideaToCore: 採用した案を core の 4 項目に写す", () => {
  const idea = generateIdeas(IDEA_ARGS)[0];
  const core = ideaToCore(idea);
  assert.deepEqual(Object.keys(core), ["oneLiner", "kvConcept", "tagline", "rationale"]);
  assert.equal(core.oneLiner, idea.oneLiner);
  assert.equal(core.kvConcept, idea.kvConcept);
  assert.equal(core.rationale, idea.why);
  assert.deepEqual(ideaToCore(null), { oneLiner: "", kvConcept: "", tagline: "", rationale: "" });
});
