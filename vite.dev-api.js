import { handleJevRequest } from "./api/_jev-core.js";
import { handleAnalyzeRequest } from "./api/_analyze-core.js";
import { handleBraveRequest } from "./api/_brave-core.js";

// 開発時のみ: /api/jev・/api/analyze・/api/brave を本番と同じ処理(api/_*-core.js)で受ける。キーはサーバー側に留まる
export const devApi = (env) => ({
  name: "research-dev-api",
  configureServer(server) {
    const routes = { "/api/jev": handleJevRequest, "/api/analyze": handleAnalyzeRequest, "/api/brave": handleBraveRequest };
    for (const [path, handle] of Object.entries(routes)) {
      server.middlewares.use(path, (req, res) => {
        let raw = "";
        req.on("data", (c) => { raw += c; });
        req.on("end", async () => {
          const { status, body } = req.method === "POST"
            ? await handle(raw, env)
            : { status: 405, body: { error: { message: "Method Not Allowed" } } };
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        });
      });
    }
  },
});
