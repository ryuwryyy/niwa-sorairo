/**
 * デモ画像（生成モデル未接続時）。
 *
 * 方向ステージの変数（アスペクト比・配色・構図・見出しゾーン）から、Canvas で「構図の雛形」を描く。
 * 本物の生成の代わりではなく、下流（配色抽出 → トークン → spec → Figma）を鍵無しで一周させるためのもの。
 * 右下に DEMO の注記を入れ、生成物と取り違えないようにする。
 */

const FALLBACK = ["#E8E3D8", "#6F7A63", "#B85C38", "#2C2A26"];

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgba = (hex, a = 1) => {
  const c = hexToRgb(hex) || { r: 128, g: 128, b: 128 };
  return `rgba(${c.r},${c.g},${c.b},${a})`;
};
const luminance = (hex) => {
  const c = hexToRgb(hex) || { r: 128, g: 128, b: 128 };
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
};

/** 決定的な擬似乱数（同じ入力なら同じ画像） */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function subjectShape(ctx, comp, w, h, subject, accent, ink) {
  const cx = w / 2, cy = h / 2;
  const circle = (x, y, r, fill) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
  const rect = (x, y, rw, rh, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, rw, rh); };
  switch (comp) {
    case "centered": circle(cx, cy, h * 0.22, subject); circle(cx + h * 0.16, cy - h * 0.16, h * 0.035, accent); break;
    case "thirds": circle(w * (2 / 3), h * (2 / 3), h * 0.17, subject); circle(w * (2 / 3) + h * 0.12, h * (2 / 3) - h * 0.14, h * 0.03, accent); break;
    case "golden": rect(w * 0.618 - h * 0.14, h * 0.382 - h * 0.14, h * 0.28, h * 0.28, subject); circle(w * 0.618 + h * 0.1, h * 0.382 + h * 0.1, h * 0.03, accent); break;
    case "diagonal": ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 6); rect(-w, -h * 0.07, w * 2, h * 0.14, subject); ctx.restore(); circle(w * 0.78, h * 0.3, h * 0.03, accent); break;
    case "grid": for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) rect(w * 0.2 + i * w * 0.16, h * 0.25 + j * h * 0.2, w * 0.1, h * 0.12, (i === 2 && j === 1) ? accent : subject); break;
    case "pattern_break": for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) circle(w * 0.15 + i * w * 0.14, h * 0.2 + j * h * 0.2, h * 0.045, (i === 3 && j === 2) ? accent : subject); break;
    case "extreme_closeup": circle(w * 0.6, h * 0.62, h * 0.75, subject); circle(w * 0.45, h * 0.35, h * 0.06, accent); break;
    case "birds_eye": for (let r = 5; r >= 1; r--) circle(cx, cy, h * 0.08 * r, r % 2 ? subject : rgba(subject, 0.35)); circle(cx, cy, h * 0.03, accent); break;
    case "low_angle": ctx.beginPath(); ctx.moveTo(w * 0.3, h); ctx.lineTo(w * 0.45, h * 0.15); ctx.lineTo(w * 0.55, h * 0.15); ctx.lineTo(w * 0.7, h); ctx.closePath(); ctx.fillStyle = subject; ctx.fill(); circle(w * 0.5, h * 0.1, h * 0.035, accent); break;
    case "frame_in_frame": ctx.lineWidth = h * 0.06; ctx.strokeStyle = subject; ctx.strokeRect(w * 0.12, h * 0.12, w * 0.76, h * 0.76); circle(cx, cy, h * 0.12, subject); circle(cx + h * 0.09, cy - h * 0.09, h * 0.025, accent); break;
    case "layered_depth": [[0.25, 0.7, 0.32, 0.25], [0.55, 0.6, 0.26, 0.5], [0.72, 0.5, 0.18, 0.9]].forEach(([x, y, r, a]) => circle(w * x, h * y, h * r, rgba(subject, a))); circle(w * 0.72, h * 0.42, h * 0.03, accent); break;
    case "silhouette": circle(w * 0.5, h * 0.55, h * 0.2, ink); rect(w * 0.42, h * 0.55, w * 0.16, h * 0.45, ink); circle(w * 0.75, h * 0.28, h * 0.03, accent); break;
    case "split": rect(0, 0, w / 2, h, subject); circle(w * 0.75, h * 0.5, h * 0.06, accent); break;
    case "negative_space":
    default: circle(w * 0.7, h * 0.68, h * 0.08, subject); circle(w * 0.7 + h * 0.06, h * 0.68 - h * 0.06, h * 0.018, accent); break;
  }
}

/**
 * @param {object} o
 * @param {string} o.aspect "16:9" など
 * @param {string[]} o.palette hex[]（先頭が主色）
 * @param {string} o.composition directionVars.composition の id
 * @param {string} o.zone directionVars.zones の id（見出しゾーン）
 * @param {string} o.label 右下の注記に添える語
 * @param {number} o.maxPx 長辺のピクセル数
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function renderPlaceholder({ aspect = "16:9", palette = [], composition = "negative_space", zone = "top", label = "", maxPx = 1600, seed = 7 } = {}) {
  const [aw, ah] = String(aspect).split(":").map((n) => Number(n) || 1);
  const w = aw >= ah ? maxPx : Math.round((maxPx * aw) / ah);
  const h = aw >= ah ? Math.round((maxPx * ah) / aw) : maxPx;
  const cols = (palette || []).filter((c) => hexToRgb(c));
  const [bg, subject, accent] = cols.length >= 3 ? cols : FALLBACK;
  const ink = cols.find((c) => luminance(c) < 0.25) || FALLBACK[3];

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");

  // 地: 主色に微妙なグラデーション
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(bg, 1));
  grad.addColorStop(1, luminance(bg) > 0.5 ? rgba(bg, 0.85) : rgba(bg, 1));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  if (luminance(bg) > 0.5) { ctx.fillStyle = "rgba(0,0,0,0.05)"; ctx.fillRect(0, h * 0.6, w, h * 0.4); }

  // 主題（副色）と差し色（10%）
  subjectShape(ctx, composition, w, h, subject, accent, ink);

  // 見出しゾーン: 少しだけ明るく空ける
  const Z = { top: [0, 0, w, h / 3], bottom: [0, (h * 2) / 3, w, h / 3], left: [0, 0, w / 3, h], right: [(w * 2) / 3, 0, w / 3, h], center: [w / 4, h / 3, w / 2, h / 3] };
  const z = Z[zone] || Z.top;
  ctx.fillStyle = luminance(bg) > 0.5 ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)";
  ctx.fillRect(...z);

  // 粒子（決定的）
  const rand = rng(seed * 7919 + w);
  ctx.fillStyle = luminance(bg) > 0.5 ? "rgba(0,0,0,0.045)" : "rgba(255,255,255,0.05)";
  for (let i = 0; i < 2400; i++) ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);

  // 注記
  const fs = Math.max(11, Math.round(h * 0.018));
  ctx.font = `500 ${fs}px "Zen Kaku Gothic New", system-ui, sans-serif`;
  ctx.textAlign = "right"; ctx.textBaseline = "bottom";
  ctx.fillStyle = luminance(bg) > 0.5 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)";
  ctx.fillText(`DEMO PLACEHOLDER · ${composition} · ${aspect}${label ? ` · ${label}` : ""}`, w - fs, h - fs);

  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  return { blob, width: w, height: h };
}

export default renderPlaceholder;
