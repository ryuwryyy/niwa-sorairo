// 「聴く」の3画面をブラウザで通しで動かす E2E。偽 Jev・偽 Claude を相手にするので課金なし。
//   npm i --no-save playwright && npx playwright install chromium   (初回のみ)
//   npm run e2e
// 失敗すると終了コード1。スクリーンショットは e2e-artifacts/ に残す。
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";
import { startJev, startClaude } from "./mocks.mjs";

const OUT = "e2e-artifacts";
const PORT = 5199;
fs.mkdirSync(OUT, { recursive: true });

const jev = startJev(9911);
const claude = startClaude(9922);
const vite = spawn("node", ["node_modules/vite/bin/vite.js", "--config", "vite.research.config.js", "--port", String(PORT), "--strictPort"], {
  env: {
    ...process.env,
    TYPESAFE_API_KEY: "test-key", TYPESAFE_BASE_URL: "http://localhost:9911",
    ANTHROPIC_API_KEY: "test-key", ANTHROPIC_BASE_URL: "http://localhost:9922",
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
  await page.screenshot({ path: `${OUT}/listening.png`, fullPage: true });

  // インタビュー整理
  await page.getByRole("tab", { name: "インタビュー整理" }).click();
  await panel.getByText("サンプルを入れる").click();
  await panel.getByRole("button", { name: "Jevで仕分ける" }).click();
  await panel.getByRole("button", { name: "行動フロー" }).click({ timeout: 30000 });
  await panel.locator("pre.code").waitFor();
  await page.screenshot({ path: `${OUT}/interview.png`, fullPage: true });

  // 深掘りレポート(CSV → 4ステップ → 書き出し)
  const csv = ["full_text,url", ...Array.from({ length: 60 }, (_, i) =>
    `"${["登録でエラー、入力が消えた。最悪", "このUI最高、迷わない", "決済が少し分かりにくい", "サポートの対応に感動"][i % 4]} ${i}",https://x.com/u/status/${i}`)].join("\n");
  fs.writeFileSync(`${OUT}/posts.csv`, csv);
  await page.getByRole("tab", { name: "深掘りレポート" }).click();
  await panel.locator("input[type=file]").setInputFiles(`${OUT}/posts.csv`);
  await panel.getByRole("button", { name: "まとめて分析する" }).click();
  await panel.getByText("デコンテ(アートディレクション)").waitFor({ timeout: 60000 });
  const dots = await panel.locator("circle.dot").count();
  if (dots < 10) throw new Error(`4象限の点が少なすぎる: ${dots}`);
  await page.screenshot({ path: `${OUT}/report.png`, fullPage: true });

  // スマホ幅で横スクロールが出ない
  await page.setViewportSize({ width: 390, height: 844 });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > 390) throw new Error(`スマホ幅で横スクロール: ${sw}px`);
  if (errors.length) throw new Error(`ページのエラー: ${errors.join(" / ")}`);
  console.log(`E2E OK (4象限の点 ${dots})`);
} catch (e) {
  failed = true;
  console.error("E2E FAILED:", e.message);
} finally {
  await browser.close();
  stopVite();
  jev.close();
  claude.close();
}
process.exit(failed ? 1 : 0);
