# このリポジトリ

- 手入れ(庭アプリ)と API → Vercel `https://teire-app.vercel.app`(`main` へのマージで自動デプロイ)
- 聴く(デザインリサーチ道具、`research/`)→ GitHub Pages `https://ryuwryyy.github.io/niwa-sorairo/`(`.github/workflows/pages.yml`)
- 2つのサイトは分けておく。聴くは Vercel の API をドメインをまたいで呼ぶ(`api/_cors.js`)

## 0. 最優先ルール(スキル)

`.claude/skills/` に、このリポジトリ固有のスキルと、取り込んだ外部スキル集(どちらも MIT、ライセンスは `.claude/skills-licenses/`)が入っている。

- [mattpocock/skills](https://github.com/mattpocock/skills) — engineering / productivity / misc
- [turntuptechnologies-ai/skills](https://github.com/turntuptechnologies-ai/skills) — 開発フロー一式

### ルール A: スキルを自己流より優先する

1. 依頼を読んだら、まず下の早見表で該当スキルを探す。
2. 1つでも当たれば、**他の作業に着手する前に** Skill ツールで呼ぶ(複数該当なら 要件を固める系 → 実装系 → 検証・レビュー系 の順)。
3. どれも当たらないときだけスキルなしで進める。その場合は理由を一言添える。
4. ユーザーが `/grill-me` のようにスキル名を直接書いたら、その通りに呼ぶ。

**全スキルをエージェントから自動で呼べる。** 上流の 14 個(`ask-matt` `grill-me` `grill-with-docs` `handoff` `implement` `improve-codebase-architecture` `setup-matt-pocock-skills` `teach` `to-questionnaire` `to-spec` `to-tickets` `triage` `wait-what` `wayfinder`)は元々 frontmatter に `disable-model-invocation: true` を持ちユーザー起動専用だったが、取り込み時に剥がしている(`npm run skills:update` でも毎回剥がれる)。「ユーザーが打つまで待つ」スキルは無い。

ただし `grill-me` / `grill-with-docs` / `teach` は長い対話を始めるスキルなので、呼ぶときは**何を詰めるためのインタビューか一言添えてから**始めること。

### ルール B: 敵対的検証(`adversarial-verify`)は必須

**レビュー・点検・監査・バグ指摘・PR レビューの結果を報告する前に、必ず `adversarial-verify` を呼ぶ。**
対象は「指摘を出すあらゆる場面」で、少なくとも次のタイミングでは省略しない。

- ユーザーに指摘・問題点・改善提案を報告する直前
- Issue を起票する直前 / PR を提出する直前 / 差し戻しの直前
- `code-review`・`skill-lint`・`pre-pr-checks`・`run-agent-team`・`release-checker` の出力を確定させるとき

手順は「各指摘を**誤検出だと仮定**し、①証拠を原文引用できるか ②基準のどの項目への違反か ③別の場所で実は満たされていないか、の 3 点で反証を試み、反証に失敗した指摘だけを確定する」。反証できなかった指摘を勝手に落とさない。棄却したものは理由付きで残す。指摘が 3 件以上、または最終ゲートのときは検証用サブエージェント(指摘を出した側とは別コンテキスト)に任せる。詳細は `.claude/skills/adversarial-verify/SKILL.md`。

初回のみ `setup-matt-pocock-skills` を呼んで、課題管理・triage ラベル・ドキュメント置き場を確定させる(ユーザーへの確認が要る項目があるため、実行はユーザーが在席しているときに)。

## 1. スキル早見表

### このリポジトリ固有(最優先で当てる)

| 状況 | スキル |
|---|---|
| このリポジトリを変更・テスト・リリースする | `ship-research` |
| マージ前の点検(鍵漏れ・有料 API 呼び出し) | エージェント `release-checker` |
| SNS・インタビューのリサーチ | `social-deepdive` |
| UI を作る・整える | `design-md-sources` |
| ポスター・表紙・キービジュアル・デコンテ | `mono-color` |

### 要件を固める・合意する

| 状況 | スキル |
|---|---|
| どのスキルを使うか迷う | `ask-matt` |
| 何を作るか曖昧・要件を詰めたい | `grill-me` / `grill-with-docs`(ドキュメントも作る) |
| 計画や判断を叩きたい | `grilling` |
| 話がかみ合っていない | `wait-what` |
| 会話を仕様にまとめる | `to-spec` |
| 仕様をチケットに割る | `to-tickets` |
| 大きな仕事の道筋を引く | `wayfinder` |
| 誰かに判断を委ねたい | `to-questionnaire` |

### 実装する

| 状況 | スキル |
|---|---|
| 仕様・チケットを実装する | `implement` |
| テストから書く | `tdd` |
| 試作で設計を確かめる | `prototype` |
| バグを直す | `debug-root-cause`(根本原因) / `diagnosing-bugs`(診断ループ) |
| モジュール設計・境界を決める | `codebase-design` |
| 用語集・ADR(CONTEXT.md) | `domain-modeling` |
| アーキテクチャの改善点を洗う | `improve-codebase-architecture` |
| マージ衝突を解く | `resolving-merge-conflicts` |
| チームで大きめの Issue を回す | `run-agent-team` |

### 検証・レビュー(出力前に必ず `adversarial-verify`)

| 状況 | スキル |
|---|---|
| **指摘を確定させる(必須ゲート)** | **`adversarial-verify`** |
| 差分をレビューする | `code-review` |
| format / lint / typecheck / test を一括実行 | `pre-pr-checks`(このリポジトリでは `npm run check` / `npm run e2e`) |
| SKILL.md を点検する | `skill-lint` |
| ドキュメントと実装の乖離を直す | `doc-sync` |
| 公開前のセキュリティ点検 | `repo-publish-security` |

### 出す・回す

| 状況 | スキル |
|---|---|
| Issue を起票する | `create-issue` |
| PR を作る | `create-pr`(このリポジトリの手順は `ship-research` が優先) |
| PR の CI を green にする | `pr-babysit` |
| issue / 外部 PR を捌く | `triage` |
| リリース・タグ・CHANGELOG | `release`(このリポジトリの手順は `ship-research` が優先) |
| 依存を更新する | `dependency-update` |
| ライブラリを選ぶ | `library-eval` |
| README を書く / 整える | `write-readme` |

### 調べる・伝える・引き継ぐ

| 状況 | スキル |
|---|---|
| 一次情報で調べ物を固める | `research` |
| 市場・競合を調べる | `market-research` |
| 論文・先行研究を調べる | `literature-review` |
| 会話を引き継ぎ書にする | `handoff`(会話の要約) / `handoff-session`(`.claude/handoff/latest.md` に保存・復元) |
| 人にしかできない手順を案内する | `wizard` |
| 学びたい・教えてほしい | `teach` |
| skill / CLAUDE.md / AGENTS.md を書く | `writing-for-agents` |

補助・新規プロジェクト向け: `new-project-init`、`scaffold-react-app`、`scaffold-cf-worker`、`scaffold-deno-api`、`scaffold-python-tool`、`scaffold-wxt-extension`、`setup-pre-commit`、`git-guardrails-claude-code`、`migrate-to-shoehorn`、`scaffold-exercises`、`setup-matt-pocock-skills`。

> `handoff` は名前が両リポジトリで衝突するため、turntup 版を `handoff-session` にリネームして取り込んでいる。

外部スキルの更新は `npm run skills:update`(`scripts/update-skills.sh`)。このリポジトリ固有のスキル(`ship-research`・`social-deepdive`・`design-md-sources`・`mono-color`)には触れない。

## 2. 変更・リリースするとき

- **マージとデプロイは確認なしで進めてよい(持ち主の指示)。** 自分の PR は CI(check・e2e)が通ったらマージする。`.github/workflows/automerge.yml` も claude/* の PR を CI 成功後に自動でマージし、聴くを再デプロイする。止めたい PR には「hold」ラベルを付ける
- 手順はスキル `ship-research`。マージ前の点検はエージェント `release-checker`
- `npm run check`(単体テスト・両ビルド・FigJamプラグイン構文)と `npm run e2e`(偽 Jev・偽 Claude でブラウザ通し)が CI と同じ
- テストや CI から本物の Jev・Claude・Brave を呼ばない(課金されるのはそこだけ)。キーは Vercel の環境変数と `.env.local` にだけ置く

## 3. SNS・インタビューのリサーチを頼まれたら

- スキル `social-deepdive`。X・Instagram は Brave Search API(公開ページの検索)で集める。直接の自動収集(スクレイピング)はしない
- 公式アカウント・広告・マーケティングは除く(持ち主の方針。`research/src/lib/filters.js`)
- API の費用を抑える: Claude の要約・洞察・戦略シートは、ボタンを押したときだけ呼ぶ。自動で連続実行しない
- ふるい分けのあとは「声の質チェック」で止める。インサイト抽出/ワード変更/方向の提案のボタンを押すまで先に進めない

## 4. 調べて FigJam に置くとき

- `scripts/research-run.mjs`(本番 API で段階ごとに実行。質チェックで止まる)→ `scripts/figjam-direct.mjs`(Figma 連携の use_figma で直接配置)。手順はスキル `social-deepdive`
- FigJam は持ち主の**個人チーム**に作る(NTT DATA の組織には置かない)

## 5. UI を作るとき

- スキル `design-md-sources`(DESIGN.md の参照先)

## 6. ポスター・表紙・キービジュアル・デコンテの一枚絵を作るとき

- スキル `mono-color`(単色/二色刷りのエディトリアル表現。上流 yanliudesign/mono-color-skill を MIT 部分だけ取り込み。examples 画像は利用許諾が別なので入れない)

## 7. X・SNS のリンクが貼られたら

- `.claude/hooks/sns-link-lookup.mjs`(UserPromptSubmit フック)が Brave Search で公開情報を探し、`[sns-link-lookup]` として渡してくる。それを使って答え、検索結果の抜粋であることを伝える
- フックが「見つからない」「キー未設定」と言ってきたら、書かれた検索語で WebSearch を試し、それでも無ければ推測せず本文の貼り付けを頼む
- 必要な設定: 環境変数 `BRAVE_API_KEY` と、ネットワーク許可に `api.search.brave.com`

## 8. 自動化(フック)

`.claude/settings.json` で常時有効。

| フック | 動作 |
|---|---|
| `SessionStart`(startup / resume / clear / compact) | `.claude/hooks/skills-reminder.sh` — スキル優先ルールと敵対的検証の必須ルールを注入し、利用可能スキル名を列挙 |
| `SessionStart`(startup / clear / compact) | `.claude/hooks/load-handoff.sh` — `.claude/handoff/latest.md` があれば引き継ぎ書を読み込む |
| `PreCompact` | `.claude/hooks/compact-preserve.sh` — compact 前に重要な状態を保全 |
| `UserPromptSubmit` | `.claude/hooks/sns-link-lookup.mjs` — 貼られた SNS リンクを Brave Search で確認 |

## 9. 手入れ(庭アプリ)について

観葉・庭木の手入れ記録アプリ。Vite + React(`src/`)、サーバーレス関数は `api/`、Cloudflare Worker は `worker/`。

- `npm run dev` で開発サーバー(http://localhost:5173)
- AI 機能(名前判定・添え書き)は `ANTHROPIC_API_KEY` が必要。キーがなくても庭づくりと手入れ暦は動く
- 秘密鍵・API キーをコミットしない(`.env*` は gitignore 済み)
- 通知ゼロ・スコアゼロ・streak ゼロというモードレス設計の方針を壊す提案はしない
