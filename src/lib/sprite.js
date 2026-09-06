// 植物スプライトのSVG生成。型(arch)×色×実で150種を描き分ける
export function drawSprite(sp, x, y, s0, rnd) {
  const s = s0 * (sp.h || 1);
  const F = (v) => (+v).toFixed(1);
  const R = (a, b) => a + rnd() * (b - a);
  const pt = (dx, dy) => `${F(x + dx * s)},${F(y + dy * s)}`;
  const blob = (dx, dy, rx, ry, f, o = 1) => `<ellipse cx="${F(x + dx * s)}" cy="${F(y + dy * s)}" rx="${F(rx * s)}" ry="${F(ry * s)}" fill="${f}" opacity="${o}"/>`;
  const dot = (dx, dy, r, f) => `<circle cx="${F(x + dx * s)}" cy="${F(y + dy * s)}" r="${F(r * s)}" fill="${f}"/>`;
  const st = (d, w, c) => `<path d="${d}" stroke="${c}" stroke-width="${F(w * s)}" fill="none" stroke-linecap="round"/>`;
  const fol = sp.fol, hi = sp.hi || sp.fol, tr = sp.trunk || "#6B5B47";
  let o = `<ellipse cx="${F(x)}" cy="${F(y + 2 * s0)}" rx="${F(24 * s)}" ry="${F(6.5 * s)}" fill="#2E4630" opacity="0.28"/>`;

  if (sp.arch === "kabudachi") {
    for (let i = 0; i < 3; i++) { const dx = (i - 1) * 5; o += st(`M${pt(dx, 0)} C${pt(dx + R(-4, 4), -34)} ${pt(dx * 2, -58)} ${pt(dx * 2.4, -76)}`, 2.4 - i * 0.5, tr); }
    for (let i = 0; i < 5; i++) o += blob(R(-24, 24), R(-88, -64), R(10, 17), R(7, 11), i % 2 ? fol : hi, 0.92);
    if (sp.dots) for (let i = 0; i < 4; i++) o += dot(R(-20, 20), R(-84, -66), 1.8, sp.dots);
  } else if (sp.arch === "layered") {
    o += st(`M${pt(0, 0)} C${pt(-2, -24)} ${pt(-8, -38)} ${pt(-16, -50)}`, 3.4, tr);
    o += blob(-8, -56, 30, 9, fol) + blob(4, -68, 23, 8, hi) + blob(-4, -79, 16, 6, fol);
    if (sp.dots) for (let i = 0; i < 5; i++) o += dot(R(-26, 22), R(-80, -52), 1.7, sp.dots);
  } else if (sp.arch === "dome") {
    o += st(`M${pt(0, 0)} L${pt(0, -40)}`, 3.2, tr);
    o += blob(0, -62, 28, 20, fol) + blob(-10, -70, 16, 11, hi, 0.75);
    if (sp.dots) for (let i = 0; i < 5; i++) o += dot(R(-22, 22), R(-76, -52), 1.6, sp.dots);
  } else if (sp.arch === "round") {
    o += st(`M${pt(0, 0)} C${pt(-3, -16)} ${pt(3, -26)} ${pt(-1, -36)}`, 3.6, tr);
    for (let i = 0; i < 3; i++) o += blob(R(-14, 14), R(-56, -40), R(12, 18), R(9, 13), i % 2 ? fol : hi, 0.95);
    if (sp.dots) for (let i = 0; i < 4; i++) o += dot(R(-13, 13), R(-56, -40), 2.2, sp.dots);
  } else if (sp.arch === "shrub") {
    for (let i = 0; i < 3; i++) o += st(`M${pt((i - 1) * 4, 0)} L${pt((i - 1) * 8, -16)}`, 1.6, tr);
    o += blob(0, -24, 18, 12, fol) + blob(-6, -30, 11, 7, hi, 0.8);
    if (sp.dots) for (let i = 0; i < 5; i++) o += dot(R(-14, 14), R(-32, -18), 1.8, sp.dots);
  } else if (sp.arch === "flower") {
    o += blob(0, -14, 20, 13, fol) + blob(-7, -19, 12, 8, hi, 0.7);
    for (let i = 0; i < 6; i++) o += dot(R(-16, 16), R(-26, -8), sp.big ? 4 : 2.4, sp.dots || "#C97B9B");
  } else if (sp.arch === "bamboo") {
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * 7;
      o += st(`M${pt(dx, 0)} L${pt(dx + 2, -84)}`, 2, tr);
      for (let k = 0; k < 4; k++) o += st(`M${pt(dx + 2, -30 - k * 15)} l${F(8 * s)},${F(-6 * s)}`, 1.4, k % 2 ? fol : hi);
    }
  } else if (sp.arch === "tuft") {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.19;
      o += st(`M${pt(0, 0)} Q${pt(Math.cos(a) * 14, Math.sin(a) * 18)} ${pt(Math.cos(a) * 26, Math.sin(a) * 30)}`, 1.5, i % 2 ? fol : hi);
    }
    if (sp.dots) for (let i = 0; i < 4; i++) o += dot(R(-18, 18), R(-30, -20), 1.6, sp.dots);
  } else if (sp.arch === "fern") {
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i - 3.5) * 0.3;
      o += st(`M${pt(0, -2)} Q${pt(Math.cos(a) * 12, -2 + Math.sin(a) * 12)} ${pt(Math.cos(a) * 22, -2 + Math.sin(a) * 22)}`, 1.8, i % 2 ? fol : hi);
    }
  } else if (sp.arch === "moss") {
    o += blob(0, -3, 20, 7, fol) + blob(-8, -6, 10, 4, hi, 0.8);
  }
  return o;
}
