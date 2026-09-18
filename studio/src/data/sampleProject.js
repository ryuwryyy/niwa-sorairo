/**
 * デモ用の案件。API キーが 1 つも無くてもアプリ全体を触れるようにするための「完成例」。
 * 画像は一切含まない（IndexedDB を汚さない）。参照はカンヌの「原理」1 件だけ。
 */
import { emptyProject, newRef } from "../store";

export const SAMPLE_NAME = "【サンプル】一保堂ではない、京都の小さな茶舗";

export function makeSampleProject() {
  const base = emptyProject(SAMPLE_NAME);

  return {
    ...base,
    meta: { client: "つちや茶舗（架空）", brand: "TSUCHIYA TEA", deliverable: "kv", language: "ja" },
    consult: {
      ...base.consult,
      context:
        "京都・西陣で四代続く小さな茶舗。近年は観光客向けの土産需要に頼っており、日常的に飲む地元客が減っている。来春、日常づかいの新ブランドを立ち上げる。予算は小さく、媒体は店頭ポスター・SNS・ECのキービジュアルのみ。",
      audience: "京都市内に住む 28〜45 歳。コーヒーは毎日飲むが、日本茶は「作法が要りそう」で敬遠している人。",
      constraints:
        "撮影予算なし（生成画像＋現像で作る）。ロゴは既存のものを Figma で載せる。抹茶の緑を主役にしない（他社と同質化するため）。宗教的・儀式的な演出は避ける。",
      frames: {
        "issue-tree": {
          root: "なぜ、日常的にお茶を飲む地元客が減ったのか？",
          branches: ["価格", "作法のハードル", "器具の不在", "味の記憶がない", "買う場所がない"],
          evidence: [
            "急須を持っていない家庭が多い（店頭ヒアリング 20 件中 14 件）",
            "「おいしい淹れ方が分からない」という声が最頻出",
            "土産需要は伸びているが、リピート購入は 1 割未満",
          ],
          cut: "価格は原価構造上いじれないので今回は扱わない",
          focus: "作法のハードル（=「きちんと淹れねば」という思い込み）",
        },
        "get-to-by": {
          get: "日本茶を「作法が要る飲み物」だと思って敬遠している京都の生活者",
          to: "お茶は、湯を注いで待つだけの、静かな休憩時間だと思ってもらう",
          by: "作法ではなく「待っている時間」そのものを美しく描くことで",
        },
        "lighthouse-question": {
          question: "「何もしていない時間」は、どうすれば贅沢に見えるのか？",
        },
      },
      issueTree: [
        {
          id: "it1",
          text: "なぜ日常的にお茶を飲む地元客が減ったのか",
          children: [
            {
              id: "it1a",
              text: "作法のハードル",
              children: [
                { id: "it1a1", text: "「きちんと淹れねば」という思い込み", children: [] },
                { id: "it1a2", text: "急須を持っていない", children: [] },
              ],
            },
            {
              id: "it1b",
              text: "味の記憶がない",
              children: [{ id: "it1b1", text: "家で淹れた記憶が childhood に無い", children: [] }],
            },
            { id: "it1c", text: "買う場所がない（今回は扱わない）", children: [] },
          ],
        },
      ],
      hypotheses: [
        {
          id: "h1",
          text: "お茶が敬遠されるのは味ではなく「正しく淹れねば」という作法の重さのせいで、待ち時間を主役にすれば心理的な敷居が下がる。",
          evidence: "店頭ヒアリングで最頻出の声は「おいしい淹れ方が分からない」。味への不満はほぼ出ていない。",
          confidence: 72,
          chosen: true,
        },
        {
          id: "h2",
          text: "地元客が減ったのは観光客向けの見た目に寄せすぎたためで、パッケージを生活側に戻せば戻ってくる。",
          evidence: "土産需要は伸びているがリピートは 1 割未満。ただし地元客の離脱理由は未検証。",
          confidence: 38,
          chosen: false,
        },
      ],
      hmw: [
        "How might we make the waiting itself feel like the luxury?",
        "どうすれば「作法」を一切見せずに、日本茶の静けさを伝えられるか？",
      ],
      brief: {
        problem: "日本茶は味ではなく「作法が要りそう」という思い込みで敬遠され、日常の選択肢から外れている。",
        insight: "人が求めているのはお茶の知識ではなく、何もしなくていい 3 分間である。",
        audience: "京都市内に住む 28〜45 歳の、コーヒーは毎日飲むが日本茶は敬遠している生活者",
        promise: "湯を注いで、待つ。それだけでいい。",
        tone: ["serene", "wabi", "warm"],
        oneLiner: "作法を知らない人を、静かな3分間へ、「待つ時間の美しさ」によって",
        lighthouse: "「何もしていない時間」は、どうすれば贅沢に見えるのか？",
        successCriteria: [
          "1秒で「お茶の時間」だと分かる",
          "急須・作法・和装が一切写っていない",
          "店頭ポスターと SNS で同じ1枚が成立する",
        ],
      },
      aiRun: null,
    },
    refs: {
      board: [
        newRef({
          source: "cannes",
          title: "Nikka Whisky — Dear Difference",
          pageUrl: "https://www.nikka.com/",
          role: "composition",
          weight: 3,
          passPixels: false,
          principles: [
            "series layout where only one element changes across a fixed grid",
            "vertical type flow with wide, deliberate margins",
            "low-chroma palette where difference reads through value and texture",
          ],
          notes:
            "固定グリッドの中で一要素だけを変える。余白を広く取り、彩度ではなく明度と質感で差をつくる。日本的だが様式に頼らない。",
          license: "unknown",
        }),
        newRef({
          source: "cannes",
          title: "De'Longhi — Tiny Coffee Shops",
          pageUrl: "https://www.delonghi.com/",
          role: "texture",
          weight: 2,
          passPixels: false,
          principles: [
            "visible handmade texture: brush marks, raw wood edges, woven cloth",
            "shallow depth of field and low camera height to fake full scale",
          ],
          notes: "手の痕跡を残す。作り込みすぎず、素材の粗さを見せる。",
          license: "unknown",
        }),
      ],
      cannesPicks: ["2026-design-gold-dear-difference", "2026-industry-craft-gp-tiny-coffee-shops"],
      queries: { pinterest: "still life tea steam minimal", adobe: "japanese tea still life", cse: "" },
    },
    direction: {
      ...base.direction,
      axes: {
        minimal_maximal: 18,
        warm_cool: 38,
        quiet_loud: 16,
        classic_future: 40,
        handmade_digital: 26,
        playful_serious: 68,
      },
      medium: "photo",
      technique: ["film_35", "macro"],
      composition: "negative_space",
      lighting: "soft_window",
      camera: "tele_85",
      texture: ["washi", "dust"],
      palette: {
        mode: "manual",
        colors: ["#E8E3D8", "#6F7A63", "#B85C38"],
        harmony: "analogous",
      },
      typography: { intent: "headline_zone", zone: "top", copy: "" },
      subject:
        "a single unglazed stoneware cup of pale green tea on a worn wooden counter, one thin ribbon of steam rising and bending in the light",
      scene: "in a quiet old Kyoto machiya at mid-morning, the street outside just out of focus behind paper screens",
      mood: ["serene", "wabi", "ephemeral"],
      mustInclude: ["one cup only", "visible steam"],
      mustAvoid: ["teapot", "kimono", "tatami", "matcha whisk", "people"],
      aspect: "16:9",
      model: "",
      variants: 2,
      size: "1K",
    },
    handoff: { ...base.handoff },
  };
}

export default makeSampleProject;
