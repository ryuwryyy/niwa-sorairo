/**
 * Figma MCP クライアント。use_figma / get_screenshot / create_new_file を叩く。
 *
 * driver = "mcp"  : この実装が自分で Figma MCP に繋ぐ（完全自動運転）
 * driver = "emit" : プラグインJSを標準出力に吐くだけ。MCP接続を持つ
 *                   エージェント（Claude Code / Codex 等）がそれを実行する。
 *
 * emit を残してあるのは、OAuth を持たない実行環境でもパイプラインを
 * 止めないため。ゴール到達の経路は多いほうがいい。
 */
import fs from "node:fs";
import path from "node:path";

export class FigmaDriver {
  constructor({ mode = process.env.FIGMA_DRIVER ?? "emit", fileKey, token = process.env.FIGMA_TOKEN, outDir = ".out" } = {}) {
    this.mode = mode; this.fileKey = fileKey; this.token = token; this.outDir = outDir;
    this.client = null; this.seq = 0;
  }

  async connect() {
    if (this.mode !== "mcp") return;
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const url = new URL(process.env.FIGMA_MCP_URL ?? "https://mcp.figma.com/mcp");
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: `Bearer ${this.token}` } }
    });
    this.client = new Client({ name: "design-agent", version: "0.1.0" }, { capabilities: {} });
    await this.client.connect(transport);
  }

  /** プラグインJSを実行（または書き出す）。戻り値は use_figma の return 値。 */
  async run(code, description) {
    if (this.mode === "emit") {
      fs.mkdirSync(this.outDir, { recursive: true });
      const file = path.join(this.outDir, `step-${String(++this.seq).padStart(3, "0")}.js`);
      fs.writeFileSync(file, code);
      return { emitted: file, description, note: "MCP接続を持つエージェントがこのファイルを use_figma で実行する" };
    }
    const r = await this.client.callTool({
      name: "use_figma",
      arguments: { fileKey: this.fileKey, code, description, skillNames: "figma-use" }
    });
    const text = r.content?.find(c => c.type === "text")?.text ?? "{}";
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  async screenshot(nodeId, maxDimension = 1440) {
    if (this.mode === "emit") return { skipped: true, nodeId };
    const r = await this.client.callTool({
      name: "get_screenshot",
      arguments: { fileKey: this.fileKey, nodeId, maxDimension }
    });
    return r.content ?? [];
  }

  async close() { await this.client?.close?.(); }
}
