// Jev に投げる「問い」の定義。Jev は文章を書かず、ここで決めた選択肢から選ぶだけ。
// 選択肢は画面で編集できるよう「ラベル: 説明」の1行1件のテキストで持つ。

export const DEFAULT_TOPICS = `見た目・UI: 画面のデザイン、色、文字の大きさや読みやすさ、アイコン
使いやすさ: 操作が分かりにくい、迷う、手順が多い、目的の画面にたどり着けない
機能要望: 欲しい機能、こうしてほしいという改善の提案
不具合・速度: バグ、落ちる、動かない、読み込みが遅い、ログインできない
価格・プラン: 料金、課金、サブスク、無料プランの制限
サポート: 問い合わせ、返信、対応の質
その他: 上記のどれにも当てはまらない`;

export const DEFAULT_CATEGORIES = `ペイン: 困っていること、不満、面倒な手間、失敗した体験
ニーズ・ゴール: 本当に達成したいこと、理想の状態、大事にしている価値
行動・習慣: 実際にやっていること、手順、頻度、使っている道具やサービス
感情: そのときの気持ち、不安、ストレス、嬉しさ、驚き
動機・判断理由: なぜそれを選んだか、始めたきっかけ、決め手
アイデア・要望: こういう機能が欲しい、こうだったらいいという発言
背景・属性: 仕事、生活環境、家族、スキルなど前提となる情報
雑談・その他: 相づち、挨拶、リサーチ上の意味が薄い発言`;

export const DEFAULT_STAGES = `きっかけ: 課題に気づく、必要になる、始めようと思う
情報収集: 調べる、人に聞く、レビューやSNSを見る
比較・検討: 候補を比べる、試す、決める
導入・初回利用: 登録、初期設定、最初に使ってみる
日常の利用: 普段の使い方、繰り返し行う作業
トラブル・問い合わせ: うまくいかない、調べ直す、サポートに連絡する
継続・離脱: 使い続ける、やめる、乗り換える、人に勧める
該当なし: 行動の流れに位置づけられない発言`;

/** "ラベル: 説明" の行を {ラベル: 説明|null} に */
export function parseLabels(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^(.+?)\s*[:：]\s*(.*)$/);
    const label = (m ? m[1] : t).trim().slice(0, 60);
    if (label && !(label in out)) out[label] = m && m[2].trim() ? m[2].trim() : null;
  }
  return out;
}

/** 「該当なし」に当たる選択肢(名前で探し、無ければ最後) */
export const noneLabel = (labels) =>
  Object.keys(labels).find((l) => /該当なし|なし|その他/.test(l)) ?? Object.keys(labels).at(-1);

/** ペインに当たる選択肢(名前で探し、無ければ最初) */
export const painLabel = (labels) =>
  Object.keys(labels).find((l) => /ペイン|不満|困/.test(l)) ?? Object.keys(labels)[0];

// ---- ソーシャルリスニング ----

export const SENTIMENTS = {
  "ポジティブ": "満足、称賛、好意、おすすめしている",
  "ネガティブ": "不満、怒り、失望、困っている",
  "混在": "良い点と悪い点の両方を述べている",
  "中立": "事実の共有や質問で、感情がはっきりしない",
};

export const INTENTS = {
  "不満・苦情": "問題点を訴えている",
  "要望・提案": "改善や機能を求めている",
  "称賛・推奨": "褒めている、人に勧めている",
  "質問・困りごと": "使い方が分からず助けを求めている",
  "比較・乗り換え": "他の製品と比べている、乗り換えた・乗り換えを考えている",
  "情報共有・その他": "ニュースや感想の共有、上記以外",
};

export function socialQuestions({ context, topicsText }) {
  const subject = context?.trim() || "この製品・サービス";
  return {
    relevant: {
      type: "noul",
      instructions: `この投稿は「${subject}」の利用体験・評判・要望について語っているか?`,
      criteria: {
        true: "利用した感想、困りごと、要望、比較など、体験に関わる内容",
        false: "宣伝、キャンペーン応募、無関係な話題、同名の別物",
      },
    },
    sentiment: { type: "choice", instructions: "投稿者の感情の向きは?", criteria: SENTIMENTS },
    topic: {
      type: "choice",
      instructions: "この投稿が主に話題にしている体験の領域はどれか?",
      criteria: parseLabels(topicsText),
    },
    intent: { type: "choice", instructions: "投稿者の意図は?", criteria: INTENTS },
    severity: {
      type: "score",
      instructions: "投稿者が体験した問題はどれくらい深刻か?",
      criteria: [
        "問題はない、または褒めている",
        "軽い不満や小さな違和感",
        "作業が止まる・明確に不便など、はっきりした問題",
        "利用をやめる、強い怒り、お金やデータの損失など深刻",
      ],
    },
  };
}

export const socialState = (post, context) => ({
  "調査対象": context?.trim() || null,
  "投稿": post.text,
});

// ---- インタビュー整理 ----

export function interviewQuestions({ categoriesText, stagesText }) {
  return {
    category: {
      type: "choice",
      instructions: "この発言をアフィニティ図で分類するなら、どのグループに入るか?",
      criteria: parseLabels(categoriesText),
    },
    stage: {
      type: "choice",
      instructions: "この発言はユーザーの行動の流れ(ジャーニー)のどの段階の話か?",
      criteria: parseLabels(stagesText),
    },
    action: {
      type: "noul",
      instructions: "この発言は、ユーザーが実際に行った・行っている具体的な行動や手順を述べているか?",
      criteria: {
        true: "〜した、〜している、〜で調べた、など具体的な行動",
        false: "気持ち、意見、要望、仮定の話、相づち",
      },
    },
    importance: {
      type: "score",
      instructions: "デザインリサーチの発見として、この発言はどれくらい重要か?",
      criteria: [
        "リサーチ上の価値はほぼない",
        "参考程度",
        "設計のヒントになる示唆がある",
        "設計や優先順位を変えうる重要な発見",
      ],
    },
  };
}

export const interviewState = (seg, prev, theme) => ({
  "調査テーマ": theme?.trim() || null,
  "話者": seg.speaker || null,
  "直前の文脈": prev ? prev.text.slice(-160) : null,
  "発言": seg.text,
});
