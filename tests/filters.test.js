// 公式アカウント・広告・宣伝の除外(research/src/lib/filters.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRules, ruleReasons, reasonCounts, isPersonal, sourceQuestion, PERSONAL } from "../research/src/lib/filters.js";

test("filters: 広告表記・キャンペーン・告知・求人・販促を理由つきで外す", () => {
  const cases = [
    ["新しいUIキットを使ってみました #PR", "広告表記"],
    ["【PR】話題のデザインツールを紹介します", "広告表記"],
    ["フォロー＆リポストで抽選10名様にプレゼント", "キャンペーン"],
    ["UXリサーチのウェビナーを開催します。お申し込みはこちら", "告知・集客"],
    ["プロダクトデザイナー募集中です。カジュアル面談もどうぞ", "求人"],
    ["今ならクーポンで50%OFF", "販促"],
    ["このデザイン本よかった amzn.to/xxxx", "アフィリエイト"],
  ];
  for (const [text, reason] of cases) assert.ok(ruleReasons({ text }).includes(reason), `${text} → ${reason}`);
});

test("filters: 個人の体験や #PRODUCT のようなタグは外さない", () => {
  for (const text of [
    "登録フォームが長すぎて途中でやめた。入力が消えるのが一番つらい",
    "#PRODUCT デザインの勉強会に行ってきた。現場の悩みはどこも同じだった",
    "このアプリのUI、迷わなくて好き",
  ]) assert.deepEqual(ruleReasons({ text }), [], text);
});

test("filters: 表示名や@に公式・企業・メディアのしるし", () => {
  assert.ok(ruleReasons({ text: "新機能をリリースしました。ぜひお試しください", author: "brand_official" }).includes("公式・企業・メディア"));
  assert.ok(ruleReasons({ text: "新機能をリリースしました。ぜひお試しください", author: "abc", authorName: "株式会社つむぎ" }).includes("公式・企業・メディア"));
  assert.ok(ruleReasons({ text: "UXの記事を書きました。読んでください", author: "x", authorName: "デザイン編集部" }).includes("公式・企業・メディア"));
  assert.deepEqual(ruleReasons({ text: "UXの記事を読んで考えが変わった話", author: "taro_ux", authorName: "デザイナー太郎" }), []);
});

test("filters: リンクだけ・タグの羅列・除外リスト", () => {
  assert.ok(ruleReasons({ text: "https://example.com #UX" }).includes("リンク・タグだけ"));
  assert.ok(ruleReasons({ text: "今日つくった画面、いい感じになった #UX #UI #デザイン #Figma #webdesign #app" }).includes("ハッシュタグの羅列"));
  assert.ok(ruleReasons({ text: "普通の感想です、とてもよかった", author: "Foo" }, { blockHandles: ["foo"] }).includes("除外リスト(@)"));
  assert.ok(ruleReasons({ text: "資料請求はプロフィールから" }, { blockWords: ["資料請求"] }).includes("除外リスト(資料請求)"));
});

test("filters: applyRules は定型文と投稿者の出しすぎも外し、オフなら何もしない", () => {
  const template = "このサービスでUXが劇的に改善しました!詳しくはプロフィールへ";
  const posts = [
    ...["a", "b", "c"].map((author) => ({ text: template, author })),
    ...Array.from({ length: 7 }, (_, i) => ({ text: `決済画面の${i}つ目の不満点、ボタンが小さすぎる`, author: "heavy" })),
    { text: "検索結果が見づらくて結局電話した", author: "d" },
  ];
  const { kept, excluded } = applyRules(posts, { maxPerAuthor: 5 });
  assert.equal(kept.length, 6); // heavy の5件 + d
  assert.equal(excluded.filter((p) => p.reasons.includes("定型文(複数アカウント)")).length, 3);
  assert.equal(excluded.filter((p) => p.reasons[0].startsWith("同じ投稿者")).length, 2);
  assert.deepEqual(reasonCounts(excluded)[0], ["定型文(複数アカウント)", 3]);
  assert.equal(applyRules(posts, { on: false }).kept.length, posts.length);
});

test("filters: Jev の発信元は「個人の声」を最後に置き、迷うものは残す", () => {
  const labels = Object.keys(sourceQuestion().source.criteria);
  assert.equal(labels.at(-1), PERSONAL);
  assert.equal(isPersonal({ choice: PERSONAL }), true);
  assert.equal(isPersonal({ choice: "企業・公式", probabilities: { [PERSONAL]: 0.35 } }), true);
  assert.equal(isPersonal({ choice: "広告・PR", probabilities: { [PERSONAL]: 0.1 } }), false);
  assert.equal(isPersonal(undefined), true); // 問いを使わなかったとき
});
