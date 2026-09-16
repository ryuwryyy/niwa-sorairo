/**
 * 決定論的レンダラ（Playwright + Chromium）。
 *
 * なぜ画像生成モデルだけに頼らないか:
 *   生成画像は「雰囲気」は出せるが、同じ仕様から同じ絵が出ない。
 *   Figma 側と突き合わせて収束させたいので、仕様から必ず同じ絵が出る
 *   基準画像が要る。Images 2.5 は方向性の探索、こちらは検証の基準。
 *   この二枚看板がパイプラインの肝。
 */
import fs from "node:fs";
import path from "node:path";

export class Renderer {
  /**
   * @param {object}  o
   * @param {string}  o.html    レンダリングするHTML
   * @param {number}  o.width   ビューポート幅
   * @param {number} [o.height] 高さ。省略時は内容に合わせて自動
   * @param {string}  o.out     出力PNGパス
   * @param {number} [o.scale]  デバイスピクセル比
   * @param {boolean}[o.fullPage] 内容全体を撮る（高さ自動）
   */
  async shot({ html, width = 1440, height, out, scale = 1, fullPage = height == null }) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined
    });
    try {
      const page = await browser.newPage({
        viewport: { width, height: height ?? 800 },
        deviceScaleFactor: scale
      });
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts?.ready);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, fullPage });
      const box = await page.evaluate(() => ({ h: document.documentElement.scrollHeight }));
      return { out, width, height: fullPage ? box.h : height };
    } finally { await browser.close(); }
  }
}
