/**
 * 詰まったときの手当て。「必ずゴールに到達する」ための最後の砦。
 *
 * 順番が大事:
 *   1. 同じ失敗を繰り返していないか見る（同一fixが3回続いたら手詰まり）
 *   2. Web で調べる（APIの仕様変更・未知のエラーはだいたいこれで解ける）
 *   3. それでも駄目なら人間に聞く。ただし放置はしない — 質問は state に積み、
 *      回答が来るまで他の画面の処理を進める（ブロックしない）
 */
export async function escalate({ astra, state, screen, attempt, fixes, lastError }) {
  const hist = state.screen(screen.id).history;
  const recent = hist.slice(-3).map(h => JSON.stringify(h.fixes));
  const stuck = recent.length === 3 && new Set(recent).size === 1;

  const problem = [
    `画面: ${screen.id} ${screen.name}`,
    `試行回数: ${attempt}`,
    lastError ? `直近のエラー: ${lastError}` : null,
    fixes.length ? `未解決の指摘:\n- ${fixes.join("\n- ")}` : null,
    stuck ? "同じ指摘が3回連続で出ている。アプローチ自体が間違っている可能性が高い。" : null
  ].filter(Boolean).join("\n");

  state.note("escalate", { screen: screen.id, attempt, stuck });

  // --- 2. Web調査 ---
  if (astra?.available) {
    try {
      const answer = await astra.research(
        `Figma Plugin API と UIデザイン自動生成の文脈で、次の問題の解決策を調べてください。` +
        `公式ドキュメントや GitHub の実例を優先し、具体的なコード修正案を示してください。\n\n${problem}`
      );
      state.note("research", { screen: screen.id, answer: answer.slice(0, 4000) });
      return { kind: "research", guidance: answer };
    } catch (e) {
      state.note("research-failed", { screen: screen.id, error: String(e.message) });
    }
  }

  // --- 3. 人間に聞く（非ブロッキング） ---
  const question = stuck
    ? `${screen.id} ${screen.name} が同じ指摘で${attempt}回止まっています。仕様のほうを見直すべきでしょうか。未解決:\n- ${fixes.join("\n- ")}`
    : `${screen.id} ${screen.name} が${attempt}回で通りません。判断をお願いします。\n${problem}`;
  state.ask(screen.id, question, { fixes, lastError });
  return { kind: "ask-human", question };
}
