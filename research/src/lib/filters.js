// 公式アカウント・広告・宣伝を、Jev や Claude に渡す前に外す(ルールなので無料)。
// 外した投稿は理由つきで残し、画面で確かめられるようにする。
// ルールで拾えない分は、Jev の「発信元」の問い(sourceQuestion)で外す。

/** 本文に出る広告・宣伝のしるし。[理由, 正規表現] */
const TEXT_RULES = [
  ["広告表記", /[#＃](?:pr|ad|sponsored|gifted)(?![a-z0-9_])|[#＃](?:広告|プロモーション|タイアップ|案件|提供)|[【\[［(（]\s*(?:pr|広告|ad|sponsored|提供)\s*[】\]］)）]/i],
  ["キャンペーン", /(?:フォロー|follow).{0,12}(?:リポスト|RT|リツイート|いいね)|抽選で|プレゼントキャンペーン|応募(?:方法|期間|はこちら|条件)|当選(?:者|発表)|giveaway/i],
  ["告知・集客", /(?:セミナー|ウェビナー|webinar|勉強会|イベント)(?:を)?(?:開催|のお知らせ|申込|申し込み|参加者募集)|登壇(?:します|決定|のお知らせ)|参加者(?:を)?募集|申込(?:受付|はこちら)|お申し込みはこちら|詳細はこちら|発売中|予約受付/i],
  ["求人", /(?:採用|求人|メンバー|デザイナー)(?:を)?募集(?:中|しています)|採用(?:中|情報)|中途採用|新卒採用|カジュアル面談|we.?re hiring|[#＃]hiring|[#＃]求人/i],
  ["販促", /クーポン|セール(?:開催|中)|割引コード|[%％]\s*off|期間限定(?:で|価格|セール)|今なら|無料配布/i],
  ["アフィリエイト", /amzn\.to|a\.r10\.to|楽天ROOM|アフィリエイト|[#＃]アフィリエイト/i],
];

/** 表示名に出る公式・企業・メディアのしるし */
const OFFICIAL_NAME = /公式|official|株式会社|（株）|\(株\)|有限会社|合同会社|\binc\b|\bltd\b|\bcorp\b|\bllc\b|編集部|広報|ニュース|\bnews\b|メディア|マガジン|magazine|採用担当|recruit/i;
/** @ハンドルに出るしるし(本人の名前と紛れにくいものだけ) */
const OFFICIAL_HANDLE = /official|_pr$|^pr_|_jp_?info$|news|media|recruit|hiring|_jobs?$|press/i;

export const EXCLUDE_DEFAULTS = { on: true, maxPerAuthor: 5, blockHandles: "", blockWords: "", useJev: true };

const splitList = (s) => String(s || "").split(/[\s,、，]+/).map((w) => w.replace(/^@/, "").trim()).filter(Boolean);
const bare = (text) => text.replace(/https?:\/\/\S+/g, "").replace(/[#＃]\S+/g, "").replace(/@\w+/g, "").replace(/\s+/g, "");
const templateKey = (text) => bare(text).slice(0, 60);

/** 1件の投稿を外す理由(外さないなら空配列) */
export function ruleReasons(post, { blockHandles = [], blockWords = [] } = {}) {
  const text = String(post.text || "");
  const handle = String(post.author || "").replace(/^@/, "");
  const name = String(post.authorName || "");
  const out = [];
  for (const [reason, re] of TEXT_RULES) if (re.test(text)) out.push(reason);
  if (OFFICIAL_NAME.test(name) || (handle && OFFICIAL_HANDLE.test(handle))) out.push("公式・企業・メディア");
  if (bare(text).length < 8) out.push("リンク・タグだけ");
  else if ((text.match(/[#＃]\S+/g) || []).length >= 6) out.push("ハッシュタグの羅列");
  if (handle && blockHandles.some((h) => h.toLowerCase() === handle.toLowerCase())) out.push("除外リスト(@)");
  const hit = blockWords.find((w) => text.includes(w) || name.includes(w));
  if (hit) out.push(`除外リスト(${hit})`);
  return out;
}

/**
 * 投稿の束にルールを当てる。重複除去(dedupe)より前に呼ぶ(同じ文面が何人から出ているかを数えるため)。
 * @returns {{kept: object[], excluded: (object & {reasons: string[]})[]}}
 */
export function applyRules(posts, opts = {}) {
  const o = { ...EXCLUDE_DEFAULTS, ...opts };
  if (!o.on) return { kept: posts, excluded: [] };
  const ctx = { blockHandles: splitList(o.blockHandles), blockWords: splitList(o.blockWords) };

  // 同じ文面を3人以上が投稿 → キャンペーンや定型文
  const authorsByText = new Map();
  for (const p of posts) {
    const k = templateKey(p.text || "");
    if (k.length < 8) continue;
    if (!authorsByText.has(k)) authorsByText.set(k, new Set());
    authorsByText.get(k).add(p.author || p.url || p);
  }

  const perAuthor = new Map();
  const kept = [], excluded = [];
  for (const p of posts) {
    const reasons = ruleReasons(p, ctx);
    if ((authorsByText.get(templateKey(p.text || ""))?.size || 0) >= 3) reasons.push("定型文(複数アカウント)");
    if (p.author && o.maxPerAuthor > 0) {
      const n = (perAuthor.get(p.author) || 0) + 1;
      perAuthor.set(p.author, n);
      if (n > o.maxPerAuthor && !reasons.length) reasons.push(`同じ投稿者の${o.maxPerAuthor}件目以降`);
    }
    (reasons.length ? excluded : kept).push(reasons.length ? { ...p, reasons } : p);
  }
  return { kept, excluded };
}

/** 理由ごとの件数(多い順) */
export function reasonCounts(excluded) {
  const m = new Map();
  for (const p of excluded) for (const r of p.reasons) m.set(r, (m.get(r) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

// ---- Jev の問い: 発信元 ----
// 「個人の声」を最後に置く(キーワード照合のデモでは、何にも当たらないと最後の選択肢になる)
export const PERSONAL = "個人の声";
export const sourceQuestion = () => ({
  source: {
    type: "choice",
    instructions: "この投稿を書いたのは誰で、何のためか? 最も近いものを選ぶ",
    criteria: {
      "企業・公式": "企業やブランド、サービス運営者の公式アカウントによる発信",
      "広告・PR": "広告、PR案件、アフィリエイト、提供を受けた紹介",
      "メディア・まとめ": "メディア、ニュース、まとめアカウント、記事の見出しの転載",
      "告知・求人": "イベントやセミナーの告知、求人、キャンペーン",
      "自己宣伝": "制作者や実務者が、自分の講座・サービス・作品・記事を売り込む",
      [PERSONAL]: "個人が自分の体験や意見、感情を語っている(仕事の悩みや現場の気づきも含む)",
    },
  },
});

/** Jev の答えで、個人の声として残すか。迷うもの(個人の確率が一定以上)は残す */
export const isPersonal = (answer, min = 0.3) =>
  !answer || answer.choice === PERSONAL || (answer.probabilities?.[PERSONAL] ?? 0) >= min;
