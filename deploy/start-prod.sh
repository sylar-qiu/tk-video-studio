#!/usr/bin/env bash
# 生产环境：构建前端 + 后台启动 uvicorn（8000），SSH 断开仍继续运行
# 用法:
#   ./deploy/start-prod.sh              # 后台守护进程（默认）
#   ./deploy/start-prod.sh --foreground # 前台运行（systemd 用）
set -euo pipefail

FOREGROUND=0
if [[ "${1:-}" == "--foreground" ]]; then
  FOREGROUND=1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STOP="$ROOT/deploy/stop-prod.sh"
if [[ -f "$STOP" ]]; then
  echo "Stopping any existing tk-video-studio instance (port 8000 only)..."
  bash "$STOP" --quiet || bash "$STOP" || true
fi

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

"$PY" "$ROOT/deploy/ensure-auth-config.py"

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

DATA_DIR="$("$PY" - <<'PY'
import sys
sys.path.insert(0, "backend")
from settings_loader import get_settings
print(get_settings().data_dir)
PY
)"
LOG_DIR="$DATA_DIR/logs"
mkdir -p "$LOG_DIR"
PID_FILE="$LOG_DIR/tk-video-studio.pid"
LOG_FILE="$LOG_DIR/tk-video-studio.log"

echo "Starting TK Video Studio (production)"
echo "  URL:  http://${HOST}:${PORT}/"
echo "  API:  http://${HOST}:${PORT}/docs"
echo "  Data: ${DATA_DIR}"

cd "$ROOT/backend"

if [[ "$FOREGROUND" == 1 ]]; then
  exec "$PY" -m uvicorn main:app --host "$HOST" --port "$PORT"
fi

echo "  Log:  ${LOG_FILE}"
echo "  Mode: background (SSH 断开不影响)"

# 新会话 + 脱离终端，避免 SSH 断开时收到 SIGHUP
if command -v setsid >/dev/null 2>&1; then
  setsid nohup "$PY" -m uvicorn main:app --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 </dev/null &
else
  nohup "$PY" -m uvicorn main:app --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 </dev/null &
fi

SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"
disown "$SERVER_PID" 2>/dev/null || true

sleep 1
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Started (PID ${SERVER_PID})."
  echo "Stop: ./deploy/stop-prod.sh"
  echo "Tail log: tail -f ${LOG_FILE}"
else
  echo "Error: server failed to start. Last log lines:" >&2
  tail -n 30 "$LOG_FILE" >&2 || true
  rm -f "$PID_FILE"
  exit 1
fi
