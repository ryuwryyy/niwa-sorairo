# 手入れ — Teire

名前を知り、季節を待ち、手を入れる。成果のいらない庭仕事の記録帳。

本番: https://teire-app.vercel.app (`main` へのマージで Vercel が自動デプロイ)
デザインリサーチ道具「聴く」: https://ryuwryyy.github.io/niwa-sorairo/ (GitHub Pages。庭アプリとは別の場所)

通知ゼロ・スコアゼロ・streakゼロ。開いた時だけ季節(七十二候)が応えるモードレス設計。

## 3つの機能

| 画面 | 内容 |
|---|---|
| 今月の手入れ | 57種(もみじ・桜・柑橘・果樹・グラスなど)の月別作業。剪定/作業/収穫/肥料/虫/水/見頃に分けて「今月の大事な作業」から並べる。★わが家の木・手入れ済みの印・用語ミニ辞典つき |
| 名前判定 | 写真から植物を同定。二段推論(形態観察→図鑑照合)で誤同定を抑え、剪定・手入れ・病害虫まで一度に引く。対象の植栽なら今月の手入れへ直接飛べる |
| 庭づくり | 162種を自由に配植するアイソメトリック・シミュレーション。先頭の「植栽リスト」は今月の手入れと同じ植物。自動保存 |

初めて開いた人には「はじめての方へ」の案内が出る(ヘッダーの「使い方」で再表示)。

## すぐ動かす

```bash
npm install
npm run dev            # 庭アプリ http://localhost:5173
npm run dev:research   # 聴く http://localhost:5174
```

AI機能(名前判定・添え書き)を使う場合のみ、APIキーの設定が必要です。

```bash
cp .env.example .env.local
# .env.local を開き ANTHROPIC_API_KEY に自分のキーを設定
```

キーがなくても**庭づくりと今月の手入れは完全に動きます**(AI機能だけがエラーメッセージを返す)。

## APIキーの扱い ⚠️

**キーをフロントエンドのコードに書かないこと。** ビルド後のJSは誰でも読めるため、
公開した瞬間に盗まれて他人があなたの請求で使い始めます。

このプロジェクトは最初からその事故が起きない構造にしてあります。

- **開発時** — `vite.config.js` のプロキシが `/api/claude` を中継し、キーをサーバー側で付与する。
  キーはブラウザに渡らない
- **本番** — `worker/` の Cloudflare Worker を経由する。キーは Worker のsecretに保存

`VITE_` 接頭辞のついた環境変数はブラウザに露出します。**キーには絶対に使わないでください**
(だから `ANTHROPIC_API_KEY` には接頭辞が付いていません)。

## ディレクトリ構成

```
src/
├── App.jsx              タブ切り替えと共通ヘッダー
├── main.jsx             エントリポイント
├── theme.js             デザイントークン(色・書体・盤面座標)
├── data/
│   ├── sekki72.js       七十二候 72件 + 今日の候を返す関数
│   ├── species.js       庭づくりの植物 162種
│   └── plants.js        今月の手入れの植栽 57種 + 月別作業の生成 + 用語ミニ辞典
├── lib/
│   ├── api.js           Claude API通信・二段推論の同定ロジック
│   ├── image.js         写真のJPEG正規化(HEIC対策)
│   ├── sprite.js        植物スプライトのSVG生成
│   └── random.js        決定的擬似乱数
├── components/Bits.jsx  共通UI部品
└── views/
    ├── Identify.jsx     名前判定
    ├── Monthly.jsx      今月の手入れ
    └── Garden.jsx       庭づくり
worker/index.js          本番用のAPI中継(Cloudflare Workers)
```

## デプロイ

### フロントエンド(Netlify / Vercel)

```bash
npm run build   # dist/ に出力
```

`netlify.toml` が同梱済み。GitHubリポジトリを繋げばそのままビルドが通ります。
Vercelの場合もビルドコマンド `npm run build`、出力先 `dist` で動きます。

### AI機能を本番で使う場合(任意)

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # キーはここにだけ入れる
npx wrangler deploy worker/index.js
```

発行されたURLをフロント側の環境変数に設定します。

```
VITE_API_ENDPOINT=https://teire-api.<あなた>.workers.dev
```

`worker/index.js` の `ALLOWED_ORIGINS` を自分の本番ドメインに書き換えてください
(`*` のままにすると誰でもあなたのキーを使えてしまいます)。

## 設計メモ(引き継ぎ用)

**なぜ庭の描画にAIを使わないか** — 初期版はAIにSVGを生成させていましたが、
出力が途中で切れると壊れるため、作図エンジンを内蔵する方式に反転しました。
結果、生成が20秒→即時になり、オフラインでも動きます。AIは添え書きの一文だけを担当します。

**なぜ input の accept に .heic を書かないか** — iOSは「HEICを受け取れない」と伝えると
自動でJPEGに変換して渡します。`.heic` を含めると生のHEICが来てデコードに失敗します。
これが写真アップロードが動かない典型原因でした。

**手入れ対象の追加方法** — `src/data/plants.js` の `PLANTS` に1件足します。
`prune`(剪定月)・`fert`(肥料月)・`harvest`(収穫月)・`pests`(見回り月)・`see`(見頃)・`extra`(その木だけの作業)を
書けば、月ごとの作業一覧は `tasksFor()` が自動で組み立てます。`sp` に species.js の名前を入れると庭づくりにも並びます。

**植物の追加方法(庭づくり)** — `src/data/species.js` に1行足すだけです。
`arch` に既存の描画型(kabudachi / layered / dome / round / shrub / flower / bamboo / tuft / fern / moss)を
指定し、葉色と実の色を決めれば、スプライトは自動生成されます。

## CI/CD(すべて無料)

| いつ | 何が | どこで |
|---|---|---|
| PR・`main` への push | 単体テスト、両ビルド、FigJamプラグイン構文(`npm run check`)と、偽 Jev・偽 Claude でのブラウザ通しテスト(`npm run e2e`) | `.github/workflows/ci.yml` |
| claude/* の PR で CI が成功 | 自動でマージし、聴くを再デプロイ(「hold」ラベルで止められる) | `.github/workflows/automerge.yml` |
| `main` へのマージ | 庭アプリと API を本番へ | Vercel(Git連携) |
| `main` へのマージ(`research/` などが変わったとき) | 聴くを GitHub Pages へ | `.github/workflows/pages.yml` |
| Vercel のデプロイ完了 | トップ・API(入力検証で弾かれる空リクエストのみ)・CORS を確認 | `.github/workflows/smoke.yml` |

テストと CI は本物の Jev・Claude を呼ばないので、API の課金は発生しない。
初回だけ GitHub の Settings → Pages → Source を「GitHub Actions」にする。
手順の詳細は `.claude/skills/ship-research/`、マージ前の点検は `.claude/agents/release-checker.md`。

## 聴く — Jevリサーチ(GitHub Pages)

庭アプリとは別ページのデザインリサーチ道具。TypeSafe AI の **Jev**(文章を生成せず、決めた選択肢から判断と確率だけを返す System One モデル)で、
大量の声を一瞬で仕分けます。

| 画面 | 入力 | Jevへの問い(1件ごと) | 出力 |
|---|---|---|---|
| ソーシャルリスニング | X / Instagram / レビューの投稿を貼り付け、またはCSV | 体験に関係あるか・感情・話題(編集可)・意図・深刻度 | 話題×感情の棒、まず読むべき投稿、確信度の低い「要確認」、手修正、CSV |
| インタビュー整理 | 文字起こし・議事録(話者形式を自動判別し、聞き手を除外) | アフィニティ分類(編集可)・ジャーニー段階・具体的な行動か・重要度 | アフィニティ図、行動フロー、FigJam / Miro / Mermaid / CSV 書き出し |

| 深掘りレポート | **Braveで集める**(Brave Search API で X・Instagram の公開投稿と、その投稿者への返信を検索)、またはCSV(本文+元URL)・貼り付け | Jev: 使えるか・具体性・感情語(好き/いい/最高/感動/やばい/悪い/嫌い/最悪/くそ)・強さ(少し〜めっちゃ)。上位N件にClaudeがカテゴリーを作り、Jevがタグ付け | 感情語グループの要約・感情の動き・インサイト、4象限マップ(嫌悪↔好意 × 少し↔めっちゃ)、一段深いUI/UX洞察、アートディレクションのデコンテ。FigJam / Markdown / CSV |

- **FigJam** — `figma-plugin/` の開発用プラグインに「FigJamへ(コピー)」の内容を貼ると、セクション+付箋のアフィニティ図と、矢印つきの行動フローを配置(手順は `figma-plugin/README.md`)
- **Miro** — 「Miroへ(コピー)」は分類ごとの列に並べたタブ区切りテキスト。ボードに貼ると付箋になる。フローは Mermaid で
- **キー** — `.env.local` / Vercel の環境変数に `TYPESAFE_API_KEY`(Jev)。Brave での収集は `BRAVE_API_KEY`(`api/brave.js` → `api/_brave-core.js`。新規は毎月5ドル分の無料クレジット、画面に Powered by Brave を表示)。深掘りレポートの文章部分は `ANTHROPIC_API_KEY`(Claude、`api/analyze.js` → `api/_analyze-core.js`、構造化出力でJSONを受ける)。未設定でも「デモ判定」(キーワード照合。Jevではない)で画面は試せる
- **構成** — `api/jev.js`(Vercel関数)→ `api/_jev-core.js`(検証・上限・並列実行・公式SDK `@typesafe-ai/sdk`)。開発時は `vite.config.js` が同じ処理を `/api/jev` で受ける

**なぜ Jev か** — 分類は「文章を書く」必要がなく、選択肢と確率が返れば十分。JSONを生成させる方式より速く、出力が壊れない。
確率が返るので、確信度の低いものだけを人が見直す運用にできる。
**限界** — Jev は要約を書かないので、フローの各ステップは発言の原文(短縮)。要約ラベルが要るなら、既存の `/api/claude` で後段に一言書かせる構成が次の一手。
X / Instagram を直接スクレイピングはしない(各社の規約で禁止)。Brave が索引した公開ページを検索するので、本文は検索結果の抜粋で、返信もスレッドのすべてではない。

## 今後の拡張候補

- 判定精度の向上 — PlantNet-300K(Kaggle)で専用CNNを学習し、上位候補をClaudeに事前情報として渡すハイブリッド構成
- 病害診断 — PlantVillageデータセットで葉の病斑分類を追加
- 「うちの庭」の強化 — 判定した樹を★わが家の木へ自動登録する
