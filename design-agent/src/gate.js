/**
 * ゴールゲート。3つ全部を通らないと、その画面は完了扱いにならない。
 *
 *  G1 spec-coverage  : UX仕様の mustHave 要素が Figma 上に実在するか（構造）
 *  G2 token-fidelity : 色・余白・角丸・字種がトークンに束縛されているか（規律）
 *  G3 visual-review  : セクション単位のスクリーンショット評価 0-5 点（見た目）
 *
 * G1/G2 は Figma から読んだ実測値で機械判定する。主観が入らない。
 *
 * 【ゼロ値の扱い】padding/gap が 0 のスロットは分母から外す。
 * 「余白ゼロ」に対応するトークンは存在せず、束縛しようがない。
 * radius は当初から 0 を除外していたのに space だけ数えていたため、
 * 実測で 155/305 と出ていた。内訳を測ると未束縛150は全てゼロ値で、
 * 非ゼロの余白155は155すべて束縛済みだった。推測せず測って確かめること。
 *
 * 【2026-09-16 修正】G2 は当初 color しか見ていなかった。
 * 製品仕様には「色・字種・余白」と書いてあるのに余白と角丸を測っていなかったため、
 * 「トークン束縛率 100%」という報告が実態より強い主張になっていた。
 * figma/mcp-server-guide の figma-generate-library が
 *   「Variables BEFORE components」「Bind visual properties to variables」
 *   （fills/strokes・spacing・radii・typography すべて）
 * と明示しているのに合わせ、4系統すべてを測る形に直した。
 */

const norm = h => h.replace("#", "").toLowerCase();
const ratio = (bound, slots) => (slots === 0 ? 1 : bound / slots);

export function gateSpecCoverage(mustHave, foundNames) {
  const found = new Set(foundNames);
  const missing = mustHave.filter(id => !found.has(id));
  return {
    id: "G1", name: "spec-coverage",
    score: mustHave.length ? (mustHave.length - missing.length) / mustHave.length : 1,
    threshold: 1.0, pass: missing.length === 0, missing
  };
}

/**
 * @param {object} o
 * @param {{slots:number,bound:number,stray:string[]}} o.color   SOLID paint の束縛状況
 * @param {{slots:number,bound:number,offScale:number[]}} o.space padding / gap
 * @param {{slots:number,bound:number,offScale:number[]}} o.radius 角丸
 * @param {string[]} o.fonts 使われている書体ファミリ
 */
export function gateTokenFidelity(o, tokens) {
  const allowedFamilies = new Set(Object.values(tokens.type.family));
  const allowedHex = new Set(Object.values(tokens.color).map(c => norm(c.hex)));

  const strayColors = [...new Set((o.color?.stray ?? []).map(norm))].filter(c => !allowedHex.has(c));
  const strayFonts = [...new Set(o.fonts ?? [])].filter(f => !allowedFamilies.has(f));

  const parts = {
    color: ratio(o.color?.bound ?? 0, o.color?.slots ?? 0),
    space: ratio(o.space?.bound ?? 0, o.space?.slots ?? 0),
    radius: ratio(o.radius?.bound ?? 0, o.radius?.slots ?? 0),
    font: strayFonts.length ? 0 : 1
  };
  const score = (parts.color + parts.space + parts.radius + parts.font) / 4;

  return {
    id: "G2", name: "token-fidelity",
    score, threshold: 1.0,
    pass: score === 1 && strayColors.length === 0 && strayFonts.length === 0,
    parts,
    counts: {
      color: `${o.color?.bound ?? 0}/${o.color?.slots ?? 0}`,
      space: `${o.space?.bound ?? 0}/${o.space?.slots ?? 0}`,
      radius: `${o.radius?.bound ?? 0}/${o.radius?.slots ?? 0}`
    },
    strayColors, strayFonts,
    offScaleSpace: o.space?.offScale ?? [],
    offScaleRadius: o.radius?.offScale ?? []
  };
}

/**
 * G3 は「セクション単位」のレビュー結果を要求する。
 * figma-generate-design の指示:
 *   "Screenshot individual sections, not just the full view.
 *    A full-view screenshot at reduced resolution hides text truncation,
 *    wrong colors, and placeholder text."
 * 全景1枚だけのレビューは不十分として弾く。
 */
export function gateVisualReview(review, { requireSections = true } = {}) {
  const issues = review?.issues ?? [];
  const blockers = issues.filter(i => i.severity === "blocker");
  const sections = review?.sections ?? [];
  const missingSections = requireSections && sections.length === 0;

  return {
    id: "G3", name: "visual-review",
    score: review?.score ?? 0, threshold: 4.0,
    pass: (review?.score ?? 0) >= 4.0 && blockers.length === 0 && !missingSections,
    blockers, issues,
    sectionsReviewed: sections.length,
    missingSections
  };
}

export function evaluate(gates) {
  return {
    pass: gates.every(g => g.pass),
    gates,
    fixes: gates.filter(g => !g.pass).flatMap(g => {
      if (g.id === "G1") return g.missing.map(m => `仕様要素 "${m}" が Figma 上に存在しない。作成すること。`);
      if (g.id === "G2") return [
        ...(g.parts.color < 1 ? [`色の束縛が ${g.counts.color}。未束縛の paint を変数に束縛すること。`] : []),
        ...(g.parts.space < 1 ? [`余白の束縛が ${g.counts.space}。padding / itemSpacing を space トークンに束縛すること。`] : []),
        ...(g.parts.radius < 1 ? [`角丸の束縛が ${g.counts.radius}。cornerRadius を radius トークンに束縛すること。`] : []),
        ...g.offScaleSpace.map(v => `余白 ${v}px はトークンスケール外。最も近いスケール値に寄せるか、スケール自体を見直すこと。`),
        ...g.offScaleRadius.map(v => `角丸 ${v}px はトークンスケール外。`),
        ...g.strayColors.map(c => `#${c} はトークン外の色。`),
        ...g.strayFonts.map(f => `"${f}" はトークン外の書体。`)
      ];
      if (g.missingSections) return ["セクション単位のレビューが無い。全景1枚だけでは文字切れを見落とす。各セクションを個別に撮って採点すること。"];
      return g.issues.map(i => `[${i.severity}] ${i.where}: ${i.what} → ${i.fix}`);
    })
  };
}
