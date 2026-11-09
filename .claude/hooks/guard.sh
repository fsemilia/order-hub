#!/usr/bin/env bash
# PreToolUse: block edits that are almost always mistakes in this repo.
file=$(jq -r '.tool_input.file_path // empty')
[[ -z "$file" ]] && exit 0
rel="${file#"$CLAUDE_PROJECT_DIR"/}"

# Secrets: .env files are never written by the agent (only .env.example).
if [[ "$rel" =~ (^|/)\.env($|\.) && "$rel" != *.env.example ]]; then
  echo "Blocked: do not write $rel. Update .env.example and tell the user which variable to set." >&2
  exit 2
fi

# Applied migrations are immutable: create a new migration instead.
if [[ "$rel" == prisma/migrations/*/migration.sql && -f "$file" ]]; then
  echo "Blocked: $rel is an existing migration. Create a new one with npm run db:migrate." >&2
  exit 2
fi

# Generated code is rebuilt by prisma generate.
if [[ "$rel" == generated/* ]]; then
  echo "Blocked: $rel is generated. Edit prisma/schema.prisma and run npm run db:generate." >&2
  exit 2
fi
exit 0
