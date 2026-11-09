#!/usr/bin/env bash
# PostToolUse: format the file Claude just wrote/edited with Prettier (silently, best effort).
file=$(jq -r '.tool_input.file_path // empty')
[[ -z "$file" || ! -f "$file" ]] && exit 0
case "$file" in
  *.ts|*.tsx|*.mts|*.js|*.mjs|*.json|*.css|*.md|*.yml|*.yaml)
    cd "$CLAUDE_PROJECT_DIR" && npx --no-install prettier --write --log-level silent "$file" >/dev/null 2>&1 || true ;;
esac
exit 0
