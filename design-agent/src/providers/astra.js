/**
 * GPT-6 Astra (OpenAI Responses API) — 推論・仕様生成・視覚レビューを担当。
 * 2026-09-03 リリース。text+image 入力 / text 出力、1.05M コンテキスト。
 * モデルIDは環境変数で差し替え可能にしてある（モデルが変わっても壊れないため）。
 */
const BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

async function backoff(fn, { tries = 5, label = "astra" } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      // 4xx（レート制限以外）はリトライしても直らない
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      const wait = Math.min(2 ** i * 1000, 16000);
      console.error(`[${label}] retry ${i + 1}/${tries} in ${wait}ms — ${e.message}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw last;
}

export class Astra {
  constructor({ apiKey = process.env.OPENAI_API_KEY, model = process.env.ASTRA_MODEL ?? "gpt-6-astra", effort = "high" } = {}) {
    this.apiKey = apiKey; this.model = model; this.effort = effort;
  }

  get available() { return Boolean(this.apiKey); }

  async #post(body) {
    const res = await fetch(`${BASE}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = new Error(`${res.status} ${await res.text()}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  #text(out) {
    for (const item of out.output ?? []) {
      if (item.type === "message") {
        for (const c of item.content ?? []) if (c.type === "output_text") return c.text;
      }
    }
    throw new Error("no output_text in response");
  }

  /** 構造化出力。schema を強制するので、後段のコードが壊れない。 */
  async json({ system, user, schema, schemaName = "result", images = [] }) {
    if (!this.available) throw new Error("OPENAI_API_KEY 未設定");
    const content = [{ type: "input_text", text: user }];
    for (const url of images) content.push({ type: "input_image", image_url: url });
    const out = await backoff(() => this.#post({
      model: this.model,
      reasoning: { effort: this.effort },
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content }
      ],
      text: { format: { type: "json_schema", name: schemaName, schema, strict: true } }
    }));
    return JSON.parse(this.#text(out));
  }

  /** ゴール達成手段が分からないときの Web 調査。ユーザーに聞く前に必ずここを通す。 */
  async research(question) {
    if (!this.available) throw new Error("OPENAI_API_KEY 未設定");
    const out = await backoff(() => this.#post({
      model: this.model,
      reasoning: { effort: "medium" },
      tools: [{ type: "web_search" }],
      input: [{ role: "user", content: [{ type: "input_text", text: question }] }]
    }), { label: "astra.research" });
    return this.#text(out);
  }
}
