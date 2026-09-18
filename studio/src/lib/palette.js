/**
 * 生成画像 → 配色トークン。
 *
 * - `document` には import 時に触れない（canvas はダウンサンプル関数の中だけ）。テストから素の配列を渡せる。
 * - 抽出は「≤96px へ縮小 → k-means（決定的な種）」。share は各クラスタの画素比。
 * - 役割割当は明度・彩度・面積のヒューリスティック（DESIGN.md §5-1）。
 */

/* ---------- 色の基本演算 ---------- */

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** WCAG 相対輝度 0..1 */
export function luminance(hex) {
  const c = hexToRgb(hex);
  if (!c) return 0;
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** WCAG コントラスト比 1..21 */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** a を b 側に t（0..1）だけ寄せる */
export function mix(a, b, t = 0.5) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  if (!ca || !cb) return a;
  return rgbToHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t);
}

export function saturation(hex) {
  const c = hexToRgb(hex);
  if (!c) return 0;
  return rgbToHsl(c.r, c.g, c.b).s;
}

/** 背景に対して読める文字色（#FFFFFF か #111111） */
export function readableOn(hex) {
  return contrastRatio(hex, "#FFFFFF") >= contrastRatio(hex, "#111111") ? "#FFFFFF" : "#111111";
}

/* ---------- 画素のサンプリング（ブラウザのみ） ---------- */

function loadImageEl(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = src;
  });
}

/**
 * 画像を maxPx 以内に縮小して RGBA 配列を返す。
 * @param {Blob|string} source Blob か画像 URL（同一オリジン / プロキシ済みであること）
 * @returns {Promise<{ data: Uint8ClampedArray, width: number, height: number }>}
 */
export async function samplePixels(source, { maxPx = 96 } = {}) {
  if (typeof document === "undefined") throw new Error("samplePixels はブラウザでのみ使えます");
  const isBlob = typeof Blob !== "undefined" && source instanceof Blob;
  const url = isBlob ? URL.createObjectURL(source) : source;
  try {
    const img = await loadImageEl(url, !isBlob);
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || maxPx) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || maxPx) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
  } finally {
    if (isBlob) URL.revokeObjectURL(url);
  }
}

/* ---------- k-means ---------- */

/** 決定的な擬似乱数（同じ画像なら同じ配色が出るように） */
function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** RGBA 配列 → [{r,g,b}] （透明・極端な白飛び黒潰れも残す。除外は役割割当側で判断） */
export function pixelsFromRgba(data, { step = 1 } = {}) {
  const out = [];
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] < 24) continue;
    out.push([data[i], data[i + 1], data[i + 2]]);
  }
  return out;
}

/**
 * k-means で代表色を求める。
 * @param {number[][]} pixels [[r,g,b], …]
 * @returns {Array<{hex:string, share:number, r:number, g:number, b:number}>} share 降順
 */
export function kmeans(pixels, { k = 6, iterations = 12, seed = 7 } = {}) {
  const px = pixels.filter((p) => Array.isArray(p) && p.length >= 3);
  if (!px.length) return [];
  const K = Math.max(1, Math.min(k, px.length));
  const rand = rng(seed);

  // k-means++ 風の初期化（決定的）
  const centers = [px[Math.floor(rand() * px.length)].slice(0, 3)];
  while (centers.length < K) {
    let best = null, bestD = -1;
    // 距離の遠い候補をサンプリングして選ぶ（全探索だと重い）
    const tries = Math.min(px.length, 256);
    for (let t = 0; t < tries; t++) {
      const cand = px[Math.floor(rand() * px.length)];
      let d = Infinity;
      for (const c of centers) {
        const dd = (cand[0] - c[0]) ** 2 + (cand[1] - c[1]) ** 2 + (cand[2] - c[2]) ** 2;
        if (dd < d) d = dd;
      }
      if (d > bestD) { bestD = d; best = cand; }
    }
    centers.push((best || px[0]).slice(0, 3));
  }

  const assign = new Int32Array(px.length);
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < px.length; i++) {
      const p = px[i];
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const k0 = centers[c];
        const d = (p[0] - k0[0]) ** 2 + (p[1] - k0[1]) ** 2 + (p[2] - k0[2]) ** 2;
        if (d < bd) { bd = d; bi = c; }
      }
      if (assign[i] !== bi) { assign[i] = bi; moved = true; }
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      const s = sums[assign[i]], p = px[i];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3]) centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
    if (!moved && it > 0) break;
  }

  const counts = centers.map(() => 0);
  for (let i = 0; i < px.length; i++) counts[assign[i]]++;

  return centers
    .map((c, i) => ({
      r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]),
      hex: rgbToHex(c[0], c[1], c[2]),
      share: counts[i] / px.length,
    }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}

/**
 * 画像から配色を抽出する。
 * @param {Blob|string|{pixels:number[][]}} source Blob / URL / テスト用の素の画素
 * @returns {Promise<Array<{hex:string, share:number}>>}
 */
export async function extractPalette(source, { k = 6, maxPx = 96, pixels = null } = {}) {
  let px = pixels;
  if (!px) {
    if (source && Array.isArray(source.pixels)) px = source.pixels;
    else if (Array.isArray(source)) px = source;
    else {
      const sampled = await samplePixels(source, { maxPx });
      px = pixelsFromRgba(sampled.data);
    }
  }
  return kmeans(px, { k }).map(({ hex, share }) => ({ hex, share: Math.round(share * 1000) / 1000 }));
}

/* ---------- 役割割当 ---------- */

const ROLE_KEYS = ["bg", "surface", "ink", "inkSoft", "primary", "secondary", "accent", "line", "onPrimary"];
export const COLOR_ROLES = ROLE_KEYS;

export const ROLE_LABELS = {
  bg: "背景", surface: "面", ink: "文字", inkSoft: "文字（弱）",
  primary: "主", secondary: "副", accent: "差し色", line: "罫線", onPrimary: "主の上の文字",
};

function darken(hex, t) { return mix(hex, "#000000", t); }
function lighten(hex, t) { return mix(hex, "#FFFFFF", t); }

/**
 * 抽出配色 → tokens.color。面積・明度・彩度で役割を決める。
 * @param {Array<{hex:string, share?:number}>} palette
 * @returns {{bg,surface,ink,inkSoft,primary,secondary,accent,line,onPrimary}}
 */
export function assignRoles(palette = []) {
  const list = (palette || [])
    .map((p) => (typeof p === "string" ? { hex: p, share: 1 / Math.max(1, palette.length) } : p))
    .filter((p) => hexToRgb(p.hex))
    .map((p) => {
      const c = hexToRgb(p.hex);
      const { s, l } = rgbToHsl(c.r, c.g, c.b);
      return { hex: rgbToHex(c.r, c.g, c.b), share: Number(p.share) || 0, s, l, lum: luminance(p.hex) };
    });

  if (!list.length) {
    const bg = "#F7F5F0", ink = "#1B1B1B", primary = "#1F3A5F";
    return {
      bg, surface: "#FFFFFF", ink, inkSoft: mix(ink, bg, 0.35), primary,
      secondary: "#C9D6DF", accent: "#E76F51", line: mix(bg, ink, 0.2), onPrimary: readableOn(primary),
    };
  }

  const used = new Set();
  const take = (score) => {
    let best = null, bestV = -Infinity;
    for (const c of list) {
      if (used.has(c.hex)) continue;
      const v = score(c);
      if (v > bestV) { bestV = v; best = c; }
    }
    if (best) used.add(best.hex);
    return best;
  };

  // 明るく面積の広い色 → 背景
  const bgC = take((c) => c.lum * 1.4 + c.share);
  // 暗い色 → 文字
  const inkC = take((c) => (1 - c.lum) * 1.4 + c.share * 0.4);
  // 中明度で最も鮮やかな色 → 主
  const mid = (c) => 1 - Math.abs(c.l - 0.45) * 1.6;
  const primaryC = take((c) => c.s * 1.6 + Math.max(0, mid(c)));
  const secondaryC = take((c) => c.s * 1.1 + Math.max(0, mid(c)) * 0.6 + c.share * 0.4);
  // 面積が小さくて鮮やかな色 → 差し色
  const accentC = take((c) => c.s * 1.8 + (1 - c.share) * 0.8);

  let bg = bgC ? bgC.hex : "#F7F5F0";
  let ink = inkC ? inkC.hex : "#1B1B1B";
  if (luminance(bg) < 0.4) bg = lighten(bg, 0.82);           // 背景が暗すぎるときは明るく寄せる
  if (luminance(ink) > luminance(bg)) ink = darken(bg, 0.86); // 反転していたら作り直す

  // WCAG AA（4.5:1）を満たすまで文字色を沈める
  let guard = 0;
  while (contrastRatio(ink, bg) < 4.5 && guard++ < 24) ink = darken(ink, 0.12);
  if (contrastRatio(ink, bg) < 4.5) ink = "#111111";
  if (contrastRatio(ink, bg) < 4.5) bg = "#FFFFFF";

  let primary = primaryC ? primaryC.hex : mix(ink, bg, 0.3);
  // 主色は背景から十分離す（ボタン地として使うため）
  let g2 = 0;
  while (contrastRatio(primary, bg) < 3 && g2++ < 20) primary = darken(primary, 0.12);

  const secondary = secondaryC ? secondaryC.hex : mix(primary, bg, 0.6);
  const accent = accentC ? accentC.hex : mix(primary, "#E76F51", 0.5);

  return {
    bg,
    surface: mix(bg, "#FFFFFF", 0.55),
    ink,
    inkSoft: mix(ink, bg, 0.38),
    primary,
    secondary,
    accent,
    line: mix(bg, ink, 0.2),
    onPrimary: readableOn(primary),
  };
}

/** 役割の入れ替え UI 用。指定した役割に hex を割り当てた新しいトークンを返す。 */
export function setRole(colors, role, hex) {
  const next = { ...colors, [role]: hex };
  if (role === "primary") next.onPrimary = readableOn(hex);
  if (role === "bg") {
    next.surface = mix(hex, "#FFFFFF", 0.55);
    next.line = mix(hex, next.ink || "#111111", 0.2);
  }
  if (role === "ink") next.inkSoft = mix(hex, next.bg || "#FFFFFF", 0.38);
  return next;
}
