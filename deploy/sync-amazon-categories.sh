#!/usr/bin/env bash
# 服务器一次性同步：导入亚马逊类目树 + 应用中文翻译（写 studio.db）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PY="$ROOT/.venv/bin/python"
IMPORT="$ROOT/scripts/import-vevor-categories.py"
FIX="$ROOT/scripts/fix-translations.py"

if [[ ! -x "$PY" ]]; then
  echo "Creating virtualenv..."
  python3 -m venv "$ROOT/.venv"
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q -r "$ROOT/backend/requirements.txt"
fi

for f in "$IMPORT" "$FIX"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing $f — run: git pull" >&2
    exit 1
  fi
done

echo "==> Step 1/2: Import Amazon category tree (replaces existing categories)…"
"$PY" "$IMPORT" --db --yes

echo ""
echo "==> Step 2/2: Apply Chinese translations…"
"$PY" "$FIX" --db

echo ""
echo "Done. Refresh the web UI to see ~1069 categories (incl. 未分类)."
