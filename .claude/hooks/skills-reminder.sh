#!/usr/bin/env bash
# SessionStart フック: 毎セッションの冒頭でスキル運用ルールを必ずコンテキストに入れる。
# 目的は 2 つ:
#   1. .claude/skills/ のスキルを自己流の手順より優先させる
#   2. レビュー・点検の指摘を報告する前に adversarial-verify（敵対的検証）を必ず通す
# 個々のスキルの説明は Claude Code が自動で読み込むため、ここでは名前だけを出して冗長化を避ける。
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
skills_dir="$root/.claude/skills"

[ -d "$skills_dir" ] || exit 0

cat <<'EOS'
[skills] このリポジトリは .claude/skills/ に mattpocock/skills と turntuptechnologies-ai/skills を取り込んでいる。
作業前に必ず CLAUDE.md の「0. 最優先」を読み、次の 2 つを守ること。

1. スキル優先: 依頼に該当するスキルがあれば、他の作業に着手する前に Skill ツールで呼ぶ。迷ったら ask-matt。
2. 敵対的検証は必須: レビュー・点検・監査・指摘・バグ報告・PR レビューの結果をユーザーに報告する前、
   および Issue 化・差し戻し・PR 提出の前に、必ず adversarial-verify を呼んで各指摘に反証を試み、
   生き残った指摘だけを確定として報告する。誤検出は棄却理由付きで残す。この手順は省略しない。
EOS

# このリポジトリでは全スキルをエージェントから呼べる方針で、取り込み時に
# disable-model-invocation を剥がしている（scripts/update-skills.sh）。手作業でコピーした
# スキルに残っていると「呼べるつもりで呼べない」ことになるため、見つけたら警告する。
auto=""
blocked=""
for f in "$skills_dir"/*/SKILL.md; do
  [ -e "$f" ] || continue
  name="$(basename "$(dirname "$f")")"
  if grep -q '^disable-model-invocation: *true' "$f"; then
    blocked="$blocked $name"
  else
    auto="$auto $name"
  fi
done

printf '[skills] 呼べるスキル:%s\n' "$auto"
if [ -n "$blocked" ]; then
  printf '[skills] ⚠ disable-model-invocation が残っていて自分では呼べない:%s\n' "$blocked"
  printf '[skills]   npm run skills:update で剥がせる。それまではユーザーに /名前 の実行を促すこと。\n'
fi
