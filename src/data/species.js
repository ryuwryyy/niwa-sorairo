// 庭づくりで植えられる植物 45種
// arch: 描画の型 / fol,hi: 葉色 / dots: 花や実の色 / h: 樹高係数
export const SPECIES = [
  // — 高木 —
  { name: "アオダモ", cat: "高木", arch: "kabudachi", fol: "#57754B", hi: "#6E8A5C", trunk: "#5A5148", h: 1 },
  { name: "ヒメシャラ", cat: "高木", arch: "kabudachi", fol: "#57754B", hi: "#6E8A5C", trunk: "#96604A", h: 0.95 },
  { name: "シマトネリコ", cat: "高木", arch: "kabudachi", fol: "#6A8A55", hi: "#82A068", h: 0.95 },
  { name: "ジューンベリー", cat: "高木", arch: "kabudachi", fol: "#5E7B50", hi: "#78955F", dots: "#B04A44", h: 0.9 },
  { name: "エゴノキ", cat: "高木", arch: "kabudachi", fol: "#5E7B50", hi: "#78955F", dots: "#F0EDE0", h: 0.9 },
  { name: "ハイノキ", cat: "高木", arch: "kabudachi", fol: "#5E7850", hi: "#729064", h: 0.85 },
  { name: "イロハモミジ", cat: "高木", arch: "layered", fol: "#57754B", hi: "#6E8A5C", trunk: "#4A4038", h: 1 },
  { name: "コハウチワカエデ", cat: "高木", arch: "layered", fol: "#667B4C", hi: "#8A9A5E", trunk: "#4A4038", h: 0.9 },
  { name: "ハナミズキ", cat: "高木", arch: "layered", fol: "#5E7B50", hi: "#78955F", dots: "#E0B7C4", trunk: "#4A4038", h: 0.9 },
  { name: "サクラ", cat: "高木", arch: "layered", fol: "#D9A9B8", hi: "#E7C2CE", trunk: "#4A4038", h: 1.05 },
  { name: "カツラ", cat: "高木", arch: "dome", fol: "#6F8A5A", hi: "#88A06C", h: 1 },
  { name: "シラカシ", cat: "高木", arch: "dome", fol: "#3F5A42", hi: "#4F6B4F", h: 1.15 },
  { name: "ソヨゴ", cat: "高木", arch: "dome", fol: "#4A6448", hi: "#5E7050", dots: "#B0472F", h: 0.95 },
  { name: "常緑ヤマボウシ", cat: "高木", arch: "dome", fol: "#49644A", hi: "#5E7050", dots: "#F1EEE0", h: 1 },
  { name: "キンモクセイ", cat: "高木", arch: "dome", fol: "#47603F", hi: "#57754B", dots: "#E8A13C", h: 0.9 },
  { name: "ヤマモモ", cat: "高木", arch: "dome", fol: "#42604A", hi: "#527057", dots: "#A8432E", h: 1.05 },
  { name: "クロチク", cat: "高木", arch: "bamboo", fol: "#5E7050", hi: "#729064", trunk: "#3E3A34", h: 1 },
  // — 果樹・中木 —
  { name: "ウメ", cat: "果樹・中木", arch: "round", fol: "#667A54", hi: "#7A8C62", dots: "#E5B7C6", h: 0.8 },
  { name: "サルスベリ", cat: "果樹・中木", arch: "round", fol: "#6E8A5C", hi: "#84A06E", dots: "#C86E8A", h: 0.85 },
  { name: "カキ", cat: "果樹・中木", arch: "round", fol: "#5C7A4E", hi: "#729060", dots: "#DD8A3C", h: 0.9 },
  { name: "イチジク", cat: "果樹・中木", arch: "round", fol: "#5C7A4E", hi: "#79955F", h: 0.85 },
  { name: "レモン", cat: "果樹・中木", arch: "round", fol: "#45623F", hi: "#57754B", dots: "#E5C34A", h: 0.8 },
  { name: "オリーブ", cat: "果樹・中木", arch: "round", fol: "#87977E", hi: "#A6B294", h: 0.9 },
  { name: "フェイジョア", cat: "果樹・中木", arch: "round", fol: "#8C9A85", hi: "#AAB6A0", h: 0.8 },
  // — 低木 —
  { name: "ブルーベリー", cat: "低木", arch: "shrub", fol: "#57754B", hi: "#6E8A5C", dots: "#5A6E9C" },
  { name: "ナンテン", cat: "低木", arch: "shrub", fol: "#5E6B47", hi: "#728059", dots: "#B0472F" },
  { name: "ローズマリー", cat: "低木", arch: "shrub", fol: "#6E7F6A", hi: "#84937E", dots: "#A8B4D0" },
  { name: "アセビ", cat: "低木", arch: "shrub", fol: "#4A6448", hi: "#5E7854", dots: "#EFE9DA" },
  { name: "ヒュウガミズキ", cat: "低木", arch: "shrub", fol: "#7A8B5E", hi: "#90A172", dots: "#E4D28A" },
  { name: "アジサイ", cat: "低木", arch: "flower", fol: "#5E7B50", hi: "#78955F", dots: "#8FA3C8", big: true },
  { name: "ツツジ", cat: "低木", arch: "flower", fol: "#4F6B4A", hi: "#5E7B57", dots: "#C9647E" },
  { name: "サザンカ", cat: "低木", arch: "flower", fol: "#47603F", hi: "#57754B", dots: "#C7526B" },
  { name: "ジンチョウゲ", cat: "低木", arch: "flower", fol: "#4F6B4A", hi: "#5E7B57", dots: "#D8A9B8" },
  { name: "クチナシ", cat: "低木", arch: "flower", fol: "#3F5A42", hi: "#4F6B4F", dots: "#F0EDDC" },
  { name: "ユキヤナギ", cat: "低木", arch: "flower", fol: "#7A8B5E", hi: "#90A172", dots: "#F3F1E6" },
  { name: "マホニア", cat: "低木", arch: "fern", fol: "#4F6B4A", hi: "#5E7B57" },
  // — 草花・下草 —
  { name: "ススキ", cat: "草花・下草", arch: "tuft", fol: "#A89B6E", hi: "#C4B98A", dots: "#E6DCC0" },
  { name: "フウチソウ", cat: "草花・下草", arch: "tuft", fol: "#8FA36A", hi: "#A9BB7E" },
  { name: "ラベンダー", cat: "草花・下草", arch: "tuft", fol: "#7E8C74", hi: "#94A28A", dots: "#9A8FC0" },
  { name: "ヤブラン", cat: "草花・下草", arch: "tuft", fol: "#4F6B4A", hi: "#5E7B57", dots: "#9A85B8" },
  { name: "ギボウシ", cat: "草花・下草", arch: "fern", fol: "#6F8A5C", hi: "#8AA46F" },
  { name: "ベニシダ", cat: "草花・下草", arch: "fern", fol: "#6B7F52", hi: "#7F9364" },
  { name: "クリスマスローズ", cat: "草花・下草", arch: "flower", fol: "#5E7350", hi: "#728760", dots: "#D8CBD8" },
  { name: "タマリュウ", cat: "草花・下草", arch: "moss", fol: "#4F6B4A", hi: "#5E7B57" },
  { name: "苔", cat: "草花・下草", arch: "moss", fol: "#77875F", hi: "#8A9A6B" },
];

export const SPEC_MAP = Object.fromEntries(SPECIES.map((s) => [s.name, s]));
export const CATS = ["高木", "果樹・中木", "低木", "草花・下草"];
