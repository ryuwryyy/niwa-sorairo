// デモ判定: TYPESAFE_API_KEY が無いときに画面を試すためのキーワード照合。
// Jev ではない。画面には常に「デモ判定」と表示し、結果を分析に使わないこと。

const LEXICON = {
  "ポジティブ": ["好き", "最高", "便利", "助かる", "神", "嬉しい", "良い", "いい", "快適", "おすすめ", "ありがとう", "感動", "楽", "素晴らしい", "わかりやすい", "分かりやすい"],
  "ネガティブ": ["最悪", "使いにくい", "使いづらい", "不便", "困", "バグ", "落ち", "遅", "分かりにく", "わかりにく", "イライラ", "やめ", "解約", "高い", "ひどい", "できない", "消え", "面倒", "めんどう", "不安", "つらい", "ストレス"],
  "不満・苦情": ["最悪", "ひどい", "使いにくい", "不便", "イライラ", "なんで", "なぜ"],
  "要望・提案": ["欲しい", "ほしい", "してほしい", "対応して", "あったら", "できたら", "希望"],
  "称賛・推奨": ["最高", "おすすめ", "神", "好き", "助かる", "便利"],
  "質問・困りごと": ["？", "?", "どうやって", "わからない", "分からない", "教えて"],
  "比較・乗り換え": ["乗り換え", "比べ", "より", "に移行", "戻"],
  "アイデア・要望": ["欲しい", "ほしい", "だったらいい", "あれば", "できたら"],
  "感情": ["不安", "嬉し", "イライラ", "楽しい", "怖", "ほっと", "焦", "モヤモヤ", "ストレス"],
  "行動・習慣": ["毎日", "毎朝", "いつも", "使って", "してい", "調べ", "メモ", "開いて", "週に"],
  "背景・属性": ["仕事", "会社", "家族", "子ども", "年", "住んで", "職"],
  "動機・判断理由": ["きっかけ", "理由", "決め手", "だから", "ので選"],
  "ペイン": ["大変", "ストレス", "切れ", "挫折", "嫌", "がっかり", "面倒", "困", "固まっ"],
  "ニーズ・ゴール": ["理想", "本当は", "安心", "ためにやって"],
  "きっかけ": ["きっかけ", "生まれ", "始めた", "不安になった"],
  "情報収集": ["検索", "調べ", "記事", "聞きました", "LINE"],
  "比較・検討": ["決め手", "比較", "迷", "比べ"],
  "導入・初回利用": ["最初の設定", "登録", "初めて", "設定"],
  "日常の利用": ["毎", "いつも", "普段", "ようにしています", "月末", "すぐ"],
  "トラブル・問い合わせ": ["切れ", "固まっ", "通知", "問い合わせ", "オフに"],
  "継続・離脱": ["乗り換え", "やめ", "続け", "移せない"],
};
const ACTION = ["しました", "しています", "して", "撮", "検索", "読み", "入力", "つけて", "見て", "話します", "オフに"];

const words = (label, desc) => [
  ...(LEXICON[label] || []),
  ...String(desc || "").split(/[、,・\s]+/).map((w) => w.replace(/[をがはにでとも]$/, "")).filter((w) => w.length >= 2),
];

const count = (text, list) => list.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);

function softmax(scores) {
  const e = scores.map((s) => Math.exp(s * 1.4));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

export function demoAnswers(state, questions) {
  const text = typeof state === "string" ? state : String(state?.["投稿"] ?? state?.["発言"] ?? JSON.stringify(state));
  const neg = count(text, LEXICON["ネガティブ"]);
  const answers = {};

  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "choice") {
      const labels = Object.keys(q.criteria);
      const scores = labels.map((l) => count(text, words(l, q.criteria[l])));
      // 何にも当たらなければ「その他/該当なし/中立」系に寄せる
      if (scores.every((s) => s === 0)) {
        const fallback = labels.findIndex((l) => /その他|該当なし|中立|雑談/.test(l));
        scores[fallback >= 0 ? fallback : labels.length - 1] = 0.8;
      }
      const p = softmax(scores);
      const best = p.indexOf(Math.max(...p));
      answers[name] = {
        type: "choice",
        choice: labels[best],
        confidence: p[best],
        probabilities: Object.fromEntries(labels.map((l, i) => [l, p[i]])),
      };
    } else if (q.type === "noul") {
      const hits = name === "relevant" ? 1 : count(text, ACTION);
      answers[name] = { type: "noul", noul: Math.min(0.95, 0.3 + hits * 0.25) };
    } else if (q.type === "score") {
      const max = q.criteria.length - 1;
      const s = Math.min(max, neg + (name === "importance" ? Math.min(2, Math.floor(text.length / 60)) : 0));
      answers[name] = {
        type: "score",
        score: s,
        confidence: 0.5,
        legend: Object.fromEntries(q.criteria.map((c, i) => [i, c])),
        probabilities: Object.fromEntries(q.criteria.map((_, i) => [i, i === s ? 0.6 : 0.4 / max])),
      };
    }
  }
  return answers;
}
