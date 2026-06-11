#!/usr/bin/env bash
# 将类目名更新为 英文（中文）—— 只改数据库，需先 git pull 拿到 scripts/fix-translations.py
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PY="${PY:-python3}"
SCRIPT="$ROOT/scripts/fix-translations.py"

if [[ ! -f "$SCRIPT" ]]; then
  echo "Missing $SCRIPT — run: git pull" >&2
  exit 1
fi

echo "Syncing category translations (direct DB)…"
"$PY" "$SCRIPT" --db
