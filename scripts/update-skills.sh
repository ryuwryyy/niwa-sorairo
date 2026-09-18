#!/usr/bin/env bash
# .claude/skills/ に取り込んである外部スキルを上流から取り込み直す。
#   使い方: npm run skills:update
# 取り込み元:
#   - https://github.com/mattpocock/skills      (MIT) engineering / productivity / misc
#   - https://github.com/turntuptechnologies-ai/skills (MIT) skills/*
# 名前衝突: turntup の handoff は handoff-session として取り込む（mattpocock の handoff と重複するため）。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$root/.claude/skills"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$dest" "$root/.claude/skills-licenses"

echo "==> mattpocock/skills"
git clone --depth 1 https://github.com/mattpocock/skills.git "$tmp/mp" >/dev/null 2>&1
for d in "$tmp"/mp/skills/{engineering,productivity,misc}/*/; do
  [ -f "$d/SKILL.md" ] || continue
  name="$(basename "$d")"
  rm -rf "$dest/$name"
  cp -r "$d" "$dest/$name"
  echo "  + $name"
done
cp "$tmp/mp/LICENSE" "$root/.claude/skills-licenses/LICENSE.mattpocock-skills"

echo "==> turntuptechnologies-ai/skills"
git clone --depth 1 https://github.com/turntuptechnologies-ai/skills.git "$tmp/tt" >/dev/null 2>&1
for d in "$tmp"/tt/skills/*/; do
  [ -f "$d/SKILL.md" ] || continue
  name="$(basename "$d")"
  [ "$name" = "handoff" ] && name="handoff-session"
  rm -rf "$dest/$name"
  cp -r "$d" "$dest/$name"
  [ "$name" = "handoff-session" ] && sed -i.bak 's/^name: handoff$/name: handoff-session/' "$dest/$name/SKILL.md" && rm -f "$dest/$name/SKILL.md.bak"
  echo "  + $name"
done
cp "$tmp/tt/LICENSE" "$root/.claude/skills-licenses/LICENSE.turntup-skills"
cp "$tmp"/tt/hooks/load-handoff.sh "$tmp"/tt/hooks/compact-preserve.sh "$root/.claude/hooks/"
chmod +x "$root/.claude/hooks/"*.sh

echo "==> done: $(find "$dest" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ') skills"
echo "CLAUDE.md のスキル早見表に新しいスキルが載っているか確認すること。"
