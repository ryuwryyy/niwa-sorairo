# このリポジトリ

- 手入れ(庭アプリ)と API → Vercel `https://teire-app.vercel.app`(`main` へのマージで自動デプロイ)
- 聴く(デザインリサーチ道具、`research/`)→ GitHub Pages `https://ryuwryyy.github.io/niwa-sorairo/`(`.github/workflows/pages.yml`)
- 2つのサイトは分けておく。聴くは Vercel の API をドメインをまたいで呼ぶ(`api/_cors.js`)

## 変更・リリースするとき
- 手順はスキル `ship-research`。マージ前の点検はエージェント `release-checker`
- `npm run check`(単体テスト・両ビルド・FigJamプラグイン構文)と `npm run e2e`(偽 Jev・偽 Claude でブラウザ通し)が CI と同じ
- テストや CI から本物の Jev・Claude・Brave を呼ばない(課金されるのはそこだけ)。キーは Vercel の環境変数と `.env.local` にだけ置く

## SNS・インタビューのリサーチを頼まれたら
- スキル `social-deepdive`。X・Instagram は Brave Search API(公開ページの検索)で集める。直接の自動収集(スクレイピング)はしない

## UI を作るとき
- スキル `design-md-sources`(DESIGN.md の参照先)

## X・SNS のリンクが貼られたら
- `.claude/hooks/sns-link-lookup.mjs`(UserPromptSubmit フック)が Brave Search で公開情報を探し、`[sns-link-lookup]` として渡してくる。それを使って答え、検索結果の抜粋であることを伝える
- フックが「見つからない」「キー未設定」と言ってきたら、書かれた検索語で WebSearch を試し、それでも無ければ推測せず本文の貼り付けを頼む
- 必要な設定: 環境変数 `BRAVE_API_KEY` と、ネットワーク許可に `api.search.brave.com`
