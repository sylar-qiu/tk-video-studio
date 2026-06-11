#!/usr/bin/env bash
# 将已有亚马逊类目名更新为 英文（中文）；若仍是默认 18 个种子类目，请先跑 sync-amazon-categories.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PY="$ROOT/.venv/bin/python"
SCRIPT="$ROOT/scripts/fix-translations.py"

if [[ ! -f "$SCRIPT" ]]; then
  echo "Missing $SCRIPT — run: git pull" >&2
  exit 1
fi

if [[ ! -x "$PY" ]]; then
  echo "Creating virtualenv..."
  python3 -m venv "$ROOT/.venv"
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q -r "$ROOT/backend/requirements.txt"
fi

COUNT="$("$PY" - <<'PY'
import sys
sys.path.insert(0, "backend")
from database import SessionLocal
from models import ProductCategory
db = SessionLocal()
try:
    print(db.query(ProductCategory).count())
finally:
    db.close()
PY
)"

if [[ "$COUNT" -lt 100 ]]; then
  echo "Found only $COUNT categories (default seed data)." >&2
  echo "Run this first to import the Amazon tree:" >&2
  echo "  ./deploy/sync-amazon-categories.sh" >&2
  exit 1
fi

echo "Syncing category translations (direct DB)…"
"$PY" "$SCRIPT" --db
