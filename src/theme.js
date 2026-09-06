// 手入れのデザイントークン。藍・苔・熾・和紙の四色を軸にする
export const C = {
  ai: "#26324B",       // 藍 — 主色
  aiDeep: "#1B2438",
  moss: "#6F7F5E",     // 苔 — 副色
  mossPale: "#DDE2D2",
  oki: "#B85C38",      // 熾 — 差し色(剪定適期など「今」を示す)
  washi: "#ECEAE1",    // 和紙 — 背景
  washi2: "#E3E0D4",
  ink: "#2C2A26",
  inkSoft: "#6B675E",
  line: "#CFCBBC",
};

export const font = {
  min: "'Shippori Mincho', 'Hiragino Mincho ProN', serif",
  goth: "'Zen Kaku Gothic New', 'Hiragino Kaku Gothic ProN', sans-serif",
};

// 庭の盤面(アイソメトリック)
export const GRID = { COLS: 9, ROWS: 7, TW: 72, TH: 36 };
export const isoX = (c, r) => 400 + (c - r) * (GRID.TW / 2);
export const isoY = (c, r) => 118 + (c + r) * (GRID.TH / 2);

// 時間帯ごとの空と地面の色
export const SKIES = {
  "朝": ["#D9E4EA", "#EFEBDB"],
  "昼": ["#C3D5DF", "#EAE8D9"],
  "夕暮れ": ["#33405C", "#C08560"],
};
export const GRASS = {
  "朝": ["#9AB86C", "#90AE62"],
  "昼": ["#8FAF60", "#86A557"],
  "夕暮れ": ["#7C9150", "#748A49"],
};
