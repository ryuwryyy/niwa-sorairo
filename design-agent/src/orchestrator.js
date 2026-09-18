/**
 * 1画面ずつ、ゲートを通るまで回し続けるループ。
 *
 * 設計上の約束:
 *  - 1画面 = 1状態機械。前の画面が通るまで次に行かない（ステップバイステップ）
 *  - 失敗は必ず「次の試行への指示」に変換される（fixes が次のプロンプトに入る）
 *  - 詰まったら自分で調べる → それでも駄目なら人間に聞く。黙って諦めない
 *  - 途中で落ちても state から再開できる
 */
import fs from "node:fs";
import { gateSpecCoverage, gateTokenFidelity, gateVisualReview, evaluate } from "./gate.js";
import { toDTCG, checkScale } from "./tokens/dtcg.js";
import * as stages from "./stages.js";
import { escalate } from "./escalate.js";

export class Orchestrator {
  constructor({ product, spec, state, astra, images, figma, tokens, outDir = ".out", log = console.log }) {
    Object.assign(this, { product, spec, state, astra, images, figma, tokens, outDir, log });
  }

  async run({ only = null } = {}) {
    const screens = this.spec.screens.filter(s => !only || only.includes(s.id));
    this.state.data.runs++;
    this.state.save();

    for (const screen of screens) {
      await this.runScreen(screen);           // ← 直列。1画面ずつ最後までやる
      const st = this.state.screen(screen.id);
      if (st.status === "escalated") {
        this.log(`⏸ ${screen.id} は人間の判断待ちです。残りの画面を先に進めます。`);
      }
    }

    const done = this.state.isComplete(screens.map(s => s.id));
    this.log(done ? "\nGOAL REACHED — 全画面がゲートを通過" : "\nNOT DONE — 未通過あり。state を見て再実行してください。");
    return { done, summary: this.state.summary(screens.map(s => s.id)) };
  }

  async runScreen(screen) {
    const st = this.state.screen(screen.id);
    if (st.status === "passed") { this.log(`✓ ${screen.id} — 通過済み、スキップ`); return; }

    const max = this.product.goal.maxIterationsPerScreen;
    const escAfter = this.product.goal.escalateAfterFailedAttempts;
    let fixes = [], guidance = null, lastError = null;

    while (st.attempts < max) {
      st.attempts++;
      st.status = "building";
      this.state.save();
      this.log(`\n── ${screen.id} ${screen.name} — 試行 ${st.attempts}/${max}`);

      try {
        const mock = await stages.mockup({
          images: this.images, astra: this.astra, product: this.product,
          screen, outDir: `${this.outDir}/mockups`, fixes
        });
        st.mockupPath = mock.file;

        // 画像をそのまま構築へ渡さない。読めた値と読めなかった値を分けてから渡す。
        const extracted = await stages.extract({
          astra: this.astra, screen, mockupPath: mock.file,
          toDataUrl: f => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`
        });
        st.extractedConfidence = extracted.confidence ?? null;
        if (extracted.divergence?.length) {
          this.log(`  仕様と生成画像のズレ ${extracted.divergence.length}件（仕様を優先）`);
        }

        const built = await stages.figmaBuild({
          astra: this.astra, figma: this.figma, product: this.product,
          screen, tokens: this.tokens, extracted,
          fixes: guidance ? [...fixes, `調査結果を踏まえること:\n${guidance}`] : fixes
        });
        if (built?.screenId) st.nodeId = built.screenId;

        st.status = "verifying"; this.state.save();
        const a = await stages.audit({ figma: this.figma, screenNodeId: st.nodeId });
        const review = await stages.visualReview({
          astra: this.astra, screen,
          figmaShotUrl: (await this.figma.screenshot(st.nodeId))?.url ?? null,
          mockupUrl: null
        });

        const dtcg = toDTCG(this.product.designTokens);
        const result = evaluate([
          gateSpecCoverage(screen.mustHave, a.specIds ?? []),
          gateTokenFidelity({
            color: a.color,
            space: { ...a.space, offScale: checkScale(dtcg, a.space?.used ?? [], "space").offScale },
            radius: { ...a.radius, offScale: checkScale(dtcg, a.radius?.used ?? [], "radius").offScale },
            fonts: a.fonts ?? []
          }, this.product.designTokens),
          gateVisualReview(review)
        ]);

        st.lastScores = result.gates.map(g => ({ id: g.id, score: +g.score.toFixed(2), pass: g.pass }));
        st.history.push({ attempt: st.attempts, pass: result.pass, fixes: result.fixes });
        lastError = null;

        if (result.pass) {
          st.status = "passed"; this.state.save();
          this.log(`✓ ${screen.id} 通過（${st.attempts}回目）`);
          return;
        }

        fixes = result.fixes;
        this.log(`  未通過 — 指摘 ${fixes.length}件`);
        fixes.forEach(f => this.log(`    → ${f}`));

      } catch (e) {
        lastError = e.message;
        st.history.push({ attempt: st.attempts, error: lastError });
        this.log(`  失敗: ${lastError}`);
      }

      this.state.save();

      // 一定回数ごとに「調べる / 聞く」へ切り替える
      if (st.attempts % escAfter === 0) {
        const r = await escalate({
          astra: this.astra, state: this.state, screen,
          attempt: st.attempts, fixes, lastError
        });
        if (r.kind === "research") { guidance = r.guidance; this.log(`  ⌕ 調査結果を次の試行に反映`); }
        else { st.status = "escalated"; this.state.save(); this.log(`  ? 人間に質問を投げました`); return; }
      }
    }

    st.status = "escalated"; this.state.save();
    this.log(`  上限 ${max} 回に到達。人間の判断へ回します。`);
    await escalate({ astra: this.astra, state: this.state, screen, attempt: st.attempts, fixes, lastError });
  }
}
