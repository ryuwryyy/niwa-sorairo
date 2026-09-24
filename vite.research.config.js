// 「聴く」(research/)だけを静的サイトとしてビルドする。GitHub Pages で庭アプリとは別の場所に出す。
//   VITE_API_BASE=https://niwa-sorairo.vercel.app RESEARCH_BASE=/niwa-sorairo/ npm run build:research
// API(/api/jev・/api/analyze)は Vercel に残り、キーはそこから出ない。
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { devApi } from "./vite.dev-api.js";

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL("./research", import.meta.url)),
  base: process.env.RESEARCH_BASE || "/",
  // 開発時は同じ /api/jev・/api/analyze をローカルで受ける(.env.local のキーを使う)
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ""))],
  build: {
    outDir: fileURLToPath(new URL("./dist-research", import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
}));
