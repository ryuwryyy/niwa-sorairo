/**
 * ゴールゲート。3つ全部を通らないと、その画面は完了扱いにならない。
 *
 *  G1 spec-coverage  : UX仕様の mustHave 要素が Figma 上に実在するか（構造）
 *  G2 token-fidelity : 色・字種がデザイントークンの値と一致するか（規律）
 *  G3 visual-review  : スクリーンショット評価 0-5 点（見た目）
 *
 * G1/G2 は Figma から読んだ実測値で機械判定する。主観が入らない。
 * G3 だけが視覚モデルの判断で、ここにだけ humanish な揺れが残る。
 */

const norm = h => h.replace("#", "").toLowerCase();

export function gateSpecCoverage(mustHave, foundNames) {
  const found = new Set(foundNames);
  const missing = mustHave.filter(id => !found.has(id));
  return {
    id: "G1",
    name: "spec-coverage",
    score: mustHave.length ? (mustHave.length - missing.length) / mustHave.length : 1,
    threshold: 1.0,
    pass: missing.length === 0,
    missing
  };
}

export function gateTokenFidelity(observed, tokens) {
  const allowed = new Set(Object.values(tokens.color).map(c => norm(c.hex)));
  const allowedFamilies = new Set(Object.values(tokens.type.family));

  const strayColors = [...new Set(observed.colors.map(norm))].filter(c => !allowed.has(c));
  const strayFonts = [...new Set(observed.fonts)].filter(f => !allowedFamilies.has(f));

  const total = observed.colors.length + observed.fonts.length;
  const bad = strayColors.length + strayFonts.length;

  return {
    id: "G2",
    name: "token-fidelity",
    score: total ? (total - bad) / total : 1,
    threshold: 1.0,
    pass: bad === 0,
    strayColors,
    strayFonts
  };
}

export function gateVisualReview(review) {
  const blockers = review.issues?.filter(i => i.severity === "blocker") ?? [];
  return {
    id: "G3",
    name: "visual-review",
    score: review.score ?? 0,
    threshold: 4.0,
    pass: (review.score ?? 0) >= 4.0 && blockers.length === 0,
    blockers,
    issues: review.issues ?? []
  };
}

export function evaluate(gates) {
  return {
    pass: gates.every(g => g.pass),
    gates,
    /** 次の試行で何を直すべきか。修正指示に直結する形で返す。 */
    fixes: gates.filter(g => !g.pass).flatMap(g => {
      if (g.id === "G1") return g.missing.map(m => `仕様要素 "${m}" が Figma 上に存在しない。作成すること。`);
      if (g.id === "G2") return [
        ...g.strayColors.map(c => `#${c} はトークン外の色。最も近いトークン値に置換すること。`),
        ...g.strayFonts.map(f => `"${f}" はトークン外の書体。type.family の値に置換すること。`)
      ];
      return g.issues.map(i => `[${i.severity}] ${i.where}: ${i.what} → ${i.fix}`);
    })
  };
}
