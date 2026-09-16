#!/usr/bin/env bash
# 公式 Figma スキルをローカルの .claude/skills/ に取得する。
#
# なぜリポジトリにコミットしないか:
#   figma/mcp-server-guide には LICENSE ファイルが無く、README に
#   「By using the Figma MCP server and the related resources (including these skills),
#    you agree to the Figma Developer Terms」と書かれている。
#   OSS ライセンスではないため、第三者のリポジトリへ再配布する形にはしない。
#   各自が Figma Developer Terms に同意のうえ取得する、という形にしてある。
set -euo pipefail

DEST="${1:-../.claude/skills}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ figma/mcp-server-guide を取得中..."
git clone --depth 1 -q https://github.com/figma/mcp-server-guide "$TMP/guide"

mkdir -p "$DEST"
for d in "$TMP"/guide/skills/*/; do
  name="$(basename "$d")"
  rm -rf "${DEST:?}/$name"
  cp -R "$d" "$DEST/$name"
  echo "  ✓ $name"
done

cat > "$DEST/README.md" <<'NOTE'
# .claude/skills

ここの figma-* は [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) から
`design-agent/tools/fetch-figma-skills.sh` で取得したものです。

Figma Developer Terms (https://www.figma.com/legal/developer-terms/) が適用されます。
リポジトリにはコミットしていません（.gitignore 済み）。更新するときは再度スクリプトを実行してください。
NOTE

echo "→ 完了: $DEST"
