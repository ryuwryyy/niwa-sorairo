/**
 * GPT Image 2.5 (2026-09-08) — 画面ごとのモックアップ画像を1枚生成する。
 *   flare    = 速度重視（探索・ラフ）
 *   sunburst = 品質重視（本番モックアップ）
 *
 * サイズ制約（API仕様）: 各辺 ≤3840 / 各辺 16の倍数 / 長短比 ≤3:1 /
 * 総画素 655,360〜8,294,400。1440x900 は 900 が 16 の倍数でないため、
 * snapSize() が 1440x896 に丸める。ここを黙って間違えると 400 が返る。
 */
const BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

export function snapSize(w, h) {
  const snap = n => Math.max(16, Math.round(n / 16) * 16);
  let W = Math.min(snap(w), 3840), H = Math.min(snap(h), 3840);
  const ratio = Math.max(W, H) / Math.min(W, H);
  if (ratio > 3) throw new Error(`アスペクト比 ${ratio.toFixed(2)}:1 は 3:1 を超えています`);
  const px = W * H;
  if (px < 655360 || px > 8294400) {
    const k = Math.sqrt((px < 655360 ? 655360 : 8294400) / px);
    W = Math.min(snap(W * k), 3840); H = Math.min(snap(H * k), 3840);
  }
  return { width: W, height: H, size: `${W}x${H}` };
}

export class Images25 {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.IMAGE_MODEL ?? "gpt-image-2.5-sunburst",
    quality = "high"
  } = {}) { this.apiKey = apiKey; this.model = model; this.quality = quality; }

  get available() { return Boolean(this.apiKey); }

  /** @returns {Promise<Buffer>} PNG バイト列 */
  async generate({ prompt, width = 1440, height = 900, quality = this.quality }) {
    if (!this.available) throw new Error("OPENAI_API_KEY 未設定");
    const { size } = snapSize(width, height);
    const res = await fetch(`${BASE}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, prompt, size, quality, output_format: "png", n: 1 })
    });
    if (!res.ok) throw new Error(`images25 ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return Buffer.from(j.data[0].b64_json, "base64");
  }
}
