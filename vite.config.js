import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { devApi } from "./vite.dev-api.js";
import { devApiPlugin } from "./server/lib/devApi.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      devApi(env),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/apple-touch-icon.png",
        ],
        manifest: {
          name: "手入れ — Teire",
          short_name: "手入れ",
          description: "名前を知り、季節を待ち、手を入れる。庭仕事の記録帳。",
          lang: "ja",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait-primary",
          background_color: "#ECEAE1",
          theme_color: "#ECEAE1",
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          navigateFallback: "/index.html",
          // /research は聴く（GitHub Pages）、/studio は別アプリ（空色 Studio）。SW の SPA フォールバックから除外する
          navigateFallbackDenylist: [/^\/api/, /^\/research/, /^\/studio/],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          // Studio のバンドル（dist/assets/studio-*）は庭アプリの SW に precache させない
          globIgnores: ["**/studio/**", "**/assets/studio-*"],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
              handler: "NetworkOnly",
            },
          ],
        },
      }),
      // 開発時: api/studio/*.js（Vercel Functions）を /api/studio/* にマウント
      devApiPlugin({ dir: "api", prefix: "/api/studio/", env }),
    ],
    server: {
      port: 5173,
      // 開発時のみ: /api/claude を Anthropic に中継し、キーはサーバー側で付与する。
      // これによりキーがブラウザに渡らない。
      proxy: {
        "/api/claude": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          rewrite: () => "/v1/messages",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("x-api-key", env.ANTHROPIC_API_KEY || "");
              proxyReq.setHeader("anthropic-version", "2023-06-01");
            });
          },
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        input: {
          main: "index.html",
          studio: "studio/index.html",
        },
      },
    },
  };
});
