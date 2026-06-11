#!/usr/bin/env bash
# 生产环境长期运行：构建前端 + 单端口 8000 提供页面与 API
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PY="$ROOT/.venv/bin/python"
NPM="$(command -v npm || true)"

if [[ ! -x "$PY" ]]; then
  echo "Creating virtualenv..."
  python3 -m venv "$ROOT/.venv"
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q -r "$ROOT/backend/requirements.txt"
fi

if [[ -z "$NPM" ]]; then
  echo "Error: npm not found. Install Node.js 18+." >&2
  exit 1
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT/frontend" && npm install)
fi

echo "Building frontend..."
(cd "$ROOT/frontend" && npm run build)

read -r HOST PORT <<< "$("$PY" - <<'PY'
import sys
sys.path.insert(0, "backend")
from settings_loader import get_settings

s = get_settings()
print(s.backend_host, s.backend_port)
PY
)"

# 生产环境：对外监听，固定 8000（与云防火墙一致）
if [[ "$HOST" == "127.0.0.1" || "$HOST" == "localhost" ]]; then
  HOST="0.0.0.0"
fi
PORT=8000

echo "Starting TK Video Studio (production)"
echo "  URL:  http://${HOST}:${PORT}/"
echo "  API:  http://${HOST}:${PORT}/docs"
echo "  Data: $("$PY" - <<'PY'
import sys
sys.path.insert(0, "backend")
from settings_loader import get_settings
print(get_settings().data_dir)
PY
)"

cd "$ROOT/backend"
exec "$PY" -m uvicorn main:app --host "$HOST" --port "$PORT"
