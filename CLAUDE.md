# 手入れ — Teire / エージェント運用ルール

## 0. 最優先ルール

このリポジトリは `.claude/skills/` に外部スキル集を取り込んである（どちらも MIT、ライセンスは `.claude/skills-licenses/`）。

- [mattpocock/skills](https://github.com/mattpocock/skills) — engineering / productivity / misc
- [turntuptechnologies-ai/skills](https://github.com/turntuptechnologies-ai/skills) — 開発フロー一式

### ルール A: スキルを自己流より優先する

1. 依頼を読んだら、まず下の早見表で該当スキルを探す。
2. 1つでも当たれば、**他の作業に着手する前に** Skill ツールで呼ぶ（複数該当なら 要件を固める系 → 実装系 → 検証・レビュー系 の順）。
3. 迷ったら `ask-matt`（スキルのルーター）を呼ぶ。
4. どれも当たらないときだけスキルなしで進める。その場合は理由を一言添える。
5. ユーザーが `/grill-me` のようにスキル名を直接書いたら、その通りに呼ぶ。

### ルール B: 敵対的検証（`adversarial-verify`）は必須

**レビュー・点検・監査・バグ指摘・PR レビューの結果を報告する前に、必ず `adversarial-verify` を呼ぶ。**
対象は「指摘を出すあらゆる場面」で、少なくとも次のタイミングでは省略しない。

- ユーザーに指摘・問題点・改善提案を報告する直前
- Issue を起票する直前 / PR を提出する直前 / 差し戻しの直前
- `code-review`・`skill-lint`・`pre-pr-checks`・`run-agent-team` の reviewer の出力を確定させるとき

手順は「各指摘を**誤検出だと仮定**し、①証拠を原文引用できるか ②基準のどの項目への違反か ③別の場所で実は満たされていないか、の 3 点で反証を試み、反証に失敗した指摘だけを確定する」。反証できなかった指摘を勝手に落とさない。棄却したものは理由付きで残す。指摘が 3 件以上、または最終ゲートのときは検証用サブエージェント（指摘を出した側とは別コンテキスト）に任せる。詳細は `.claude/skills/adversarial-verify/SKILL.md`。

初回のみ `setup-matt-pocock-skills` を実行して、課題管理（GitHub / Linear / ローカル）・triage ラベル・ドキュメント置き場を確定させる。

## 1. スキル早見表

### 要件を固める・合意する

| 状況 | スキル |
|---|---|
| どのスキルを使うか迷う | `ask-matt` |
| 何を作るか曖昧・要件を詰めたい | `grill-me` / `grill-with-docs`（ドキュメントも作る） |
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
| バグを直す | `debug-root-cause`（根本原因） / `diagnosing-bugs`（診断ループ） |
| モジュール設計・境界を決める | `codebase-design` |
| 用語集・ADR（CONTEXT.md） | `domain-modeling` |
| アーキテクチャの改善点を洗う | `improve-codebase-architecture` |
| マージ衝突を解く | `resolving-merge-conflicts` |
| チームで大きめの Issue を回す | `run-agent-team` |

### 検証・レビュー（出力前に必ず `adversarial-verify`）

| 状況 | スキル |
|---|---|
| **指摘を確定させる（必須ゲート）** | **`adversarial-verify`** |
| 差分をレビューする | `code-review` |
| format / lint / typecheck / test を一括実行 | `pre-pr-checks` |
| SKILL.md を点検する | `skill-lint` |
| ドキュメントと実装の乖離を直す | `doc-sync` |
| 公開前のセキュリティ点検 | `repo-publish-security` |

### 出す・回す

| 状況 | スキル |
|---|---|
| Issue を起票する | `create-issue` |
| PR を作る | `create-pr` |
| PR の CI を green にする | `pr-babysit` |
| issue / 外部 PR を捌く | `triage` |
| リリース・タグ・CHANGELOG | `release` |
| 依存を更新する | `dependency-update` |
| ライブラリを選ぶ | `library-eval` |
| README を書く / 整える | `write-readme` |

### 調べる・伝える・引き継ぐ

| 状況 | スキル |
|---|---|
| 一次情報で調べ物を固める | `research` |
| 市場・競合を調べる | `market-research` |
| 論文・先行研究を調べる | `literature-review` |
| 会話を引き継ぎ書にする | `handoff`（会話の要約） / `handoff-session`（`.claude/handoff/latest.md` に保存・復元） |
| 人にしかできない手順を案内する | `wizard` |
| 学びたい・教えてほしい | `teach` |
| skill / CLAUDE.md / AGENTS.md を書く | `writing-for-agents` |

補助・新規プロジェクト向け: `new-project-init`、`scaffold-react-app`、`scaffold-cf-worker`、`scaffold-deno-api`、`scaffold-python-tool`、`scaffold-wxt-extension`、`setup-pre-commit`、`git-guardrails-claude-code`、`migrate-to-shoehorn`、`scaffold-exercises`、`setup-matt-pocock-skills`。

> `handoff` は名前が両リポジトリで衝突するため、turntup 版を `handoff-session` にリネームして取り込んでいる。

## 2. 自動化（フック）

`.claude/settings.json` で以下を常時有効にしている。セッションを開くたびに上のルールが自動で読み込まれる。

| フック | 動作 |
|---|---|
| `SessionStart`（startup / resume / clear / compact） | `.claude/hooks/skills-reminder.sh` — スキル優先ルールと敵対的検証の必須ルールを注入し、利用可能スキル名を列挙 |
| `SessionStart`（startup / clear / compact） | `.claude/hooks/load-handoff.sh` — `.claude/handoff/latest.md` があれば引き継ぎ書を読み込む |
| `PreCompact` | `.claude/hooks/compact-preserve.sh` — compact 前に重要な状態を保全 |

スキル本体の更新は `npm run skills:update`（上流から取り込み直す。`scripts/update-skills.sh`）。

## 3. このプロジェクトについて

観葉・庭木の手入れ記録アプリ「手入れ（Teire）」。Vite + React（`src/`）、サーバーレス関数は `api/`、Cloudflare Worker は `worker/`。

- `npm run dev` で開発サーバー（http://localhost:5173）
- AI 機能（名前判定・添え書き）は `ANTHROPIC_API_KEY` が必要。キーがなくても庭づくりと手入れ暦は動く。
- 秘密鍵・API キーをコミットしない（`.env*` は gitignore 済み）。
- 通知ゼロ・スコアゼロ・streak ゼロというモードレス設計の方針を壊す提案はしない。
