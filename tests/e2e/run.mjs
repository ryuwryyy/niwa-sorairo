// 「聴く」の3画面をブラウザで通しで動かす E2E。偽 Jev・偽 Claude を相手にするので課金なし。
//   npm i --no-save playwright && npx playwright install chromium   (初回のみ)
//   npm run e2e
// 失敗すると終了コード1。スクリーンショットは e2e-artifacts/ に残す。
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";
import { startJev, startClaude, startBrave } from "./mocks.mjs";

const OUT = "e2e-artifacts";
const PORT = 5199;
fs.mkdirSync(OUT, { recursive: true });

const jev = startJev(9911);
const claude = startClaude(9922);
const brave = startBrave(9933);
const vite = spawn("node", ["node_modules/vite/bin/vite.js", "--config", "vite.research.config.js", "--port", String(PORT), "--strictPort"], {
  env: {
    ...process.env,
    TYPESAFE_API_KEY: "test-key", TYPESAFE_BASE_URL: "http://localhost:9911",
    ANTHROPIC_API_KEY: "test-key", ANTHROPIC_BASE_URL: "http://localhost:9922",
    BRAVE_API_KEY: "test-key", BRAVE_BASE_URL: "http://localhost:9933",
  },
  stdio: "inherit",
  detached: true, // 終了時にプロセスグループごと止める
});
const stopVite = () => { try { process.kill(-vite.pid, "SIGTERM"); } catch { /* もう止まっている */ } };

const url = `http://localhost:${PORT}/`;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(url)).ok) break; } catch { /* 起動待ち */ }
  await new Promise((r) => setTimeout(r, 500));
}

const errors = [];
let failed = false;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  const panel = page.locator("[role=tabpanel]:not([hidden])");

  // ソーシャルリスニング
  await page.goto(url);
  await panel.getByText("サンプルを入れる").click();
  await panel.getByRole("button", { name: "Jevで仕分ける" }).click();
  await panel.getByText("まず読むべき投稿").waitFor({ timeout: 30000 });
  if (!(await panel.getByText(/公式・広告・宣伝を除く\(\d+件除外\)/).count())) throw new Error("サンプルのキャンペーン投稿が除外されていない");
  // 戦略シートは押したときだけ Claude を呼ぶ
  if (await panel.getByText("(テスト)コア").count()) throw new Error("押す前に戦略シートができている");
  await panel.getByRole("button", { name: "戦略シートをつくる" }).click();
  await panel.getByText("(テスト)提案").waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/listening.png`, fullPage: true });

  // インタビュー整理
  await page.getByRole("tab", { name: "インタビュー整理" }).click();
  await panel.getByText("サンプルを入れる").click();
  await panel.getByRole("button", { name: "Jevで仕分ける" }).click();
  await panel.getByRole("button", { name: "行動フロー" }).click({ timeout: 30000 });
  await panel.locator("pre.code").waitFor();
  await page.screenshot({ path: `${OUT}/interview.png`, fullPage: true });

  // 深掘りレポート(Brave で収集 → CSV で 4ステップ)
  let collected = 0;
  const csv = ["full_text,url", ...Array.from({ length: 60 }, (_, i) =>
    `"${["登録でエラー、入力が消えた。最悪", "このUI最高、迷わない", "決済が少し分かりにくい", "サポートの対応に感動"][i % 4]} ${i}",https://x.com/u/status/${i}`)].join("\n");
  fs.writeFileSync(`${OUT}/posts.csv`, csv);
  await page.getByRole("tab", { name: "深掘りレポート" }).click();

  // Brave で集める(キーワード2つに絞る)。投稿と「返信先: @…」の返信が集まる
  await panel.locator("textarea").first().fill("UX\nデザイン");
  await panel.getByRole("button", { name: "Braveで集める" }).last().click();
  await panel.getByText(/完了 · \d+件/).waitFor({ timeout: 30000 });
  collected = Number((await panel.getByText(/完了 · \d+件/).textContent()).match(/(\d+)件/)[1]);
  if (collected < 40) throw new Error(`Brave で集めた件数が少ない: ${collected}`);
  await page.screenshot({ path: `${OUT}/brave.png`, fullPage: true });

  await panel.getByRole("button", { name: "CSV", exact: true }).click();
  await panel.locator("input[type=file]").setInputFiles(`${OUT}/posts.csv`);
  await panel.getByRole("button", { name: "ふるい分けて質を見る" }).click();
  // ふるい分けのあと、声の質チェックで止まる。ボタンを押すまでカテゴリー・要約には進まない
  await panel.getByRole("heading", { name: "声の質チェック" }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  if (await panel.getByText("情報設計").count()) throw new Error("押す前にカテゴリーがつくられている");
  if (await panel.getByRole("button", { name: "要約する" }).count()) throw new Error("押す前に要約ボタンが出ている");
  // 方向を提案してもらい、そのワードに差し替える
  await panel.getByRole("button", { name: "リサーチの方向を提案してもらう" }).click();
  await panel.getByText("(テスト)方向1").waitFor({ timeout: 30000 });
  await panel.getByRole("button", { name: "このワードに変える" }).first().click();
  const kw = await panel.locator("textarea").first().inputValue();
  if (kw !== "提案ワード1a\n提案ワード1b") throw new Error(`提案ワードに差し替わっていない: ${kw}`);
  await panel.locator(".quality").screenshot({ path: `${OUT}/quality.png` });
  // インサイトを抽出する → カテゴリーとタグ。要約・洞察はさらに押したときだけ
  await panel.getByRole("button", { name: /インサイトを抽出する/ }).click();
  await panel.getByText("情報設計").first().waitFor({ timeout: 30000 }); // カテゴリー
  await panel.getByRole("button", { name: "要約する" }).first().waitFor({ timeout: 30000 });
  if (await panel.getByText("(テスト)要約").count()) throw new Error("押す前にグループが要約されている");
  if (await panel.getByText("デコンテ(アートディレクション)").count()) throw new Error("押す前に洞察がつくられている");
  await panel.getByRole("button", { name: "要約する" }).first().click();
  await panel.getByText("(テスト)要約").waitFor({ timeout: 30000 });
  if ((await panel.getByText("(テスト)要約").count()) !== 1) throw new Error("押したグループ以外も要約された");
  await panel.getByRole("button", { name: "洞察とデコンテをつくる" }).click();
  await panel.getByText("デコンテ(アートディレクション)").waitFor({ timeout: 60000 });
  await panel.getByRole("button", { name: "戦略シートをつくる" }).click();
  await panel.getByText("(テスト)提案").waitFor({ timeout: 30000 });
  await panel.locator(".strategy").screenshot({ path: `${OUT}/strategy.png` });
  const dots = await panel.locator("circle.dot").count();
  if (dots < 10) throw new Error(`4象限の点が少なすぎる: ${dots}`);
  await page.screenshot({ path: `${OUT}/report.png`, fullPage: true });

  // スマホ幅で横スクロールが出ない
  await page.setViewportSize({ width: 390, height: 844 });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > 390) throw new Error(`スマホ幅で横スクロール: ${sw}px`);
  if (errors.length) throw new Error(`ページのエラー: ${errors.join(" / ")}`);
  console.log(`E2E OK (Brave ${collected}件, 4象限の点 ${dots})`);
} catch (e) {
  failed = true;
  console.error("E2E FAILED:", e.message);
} finally {
  await browser.close();
  stopVite();
  jev.close();
  claude.close();
  brave.close();
}
process.exit(failed ? 1 : 0);
