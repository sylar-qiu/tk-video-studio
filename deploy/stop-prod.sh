#!/usr/bin/env bash
# 仅停止本项目在 8000 端口的 uvicorn，不会动 8080 等其他端口服务。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8000
BACKEND_DIR="$ROOT/backend"
VENV_PY="$ROOT/.venv/bin/python"
PY="$VENV_PY"

pid_file() {
  if [[ ! -x "$PY" ]]; then
    return 0
  fi
  local data_dir
  data_dir="$(cd "$ROOT" && "$PY" - <<'PY' 2>/dev/null)
import sys
sys.path.insert(0, "backend")
from settings_loader import get_settings
print(get_settings().data_dir)
PY
)" || true
  [[ -n "$data_dir" ]] && echo "${data_dir}/logs/tk-video-studio.pid"
}

QUIET=0
if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=1
fi

log() {
  if [[ "$QUIET" == 0 ]]; then
    echo "$@"
  fi
}

is_studio_uvicorn() {
  local pid="$1"
  local cmd cwd

  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ -n "$cmd" ]] || return 1
  [[ "$cmd" == *"uvicorn main:app"* ]] || return 1
  [[ "$cmd" == *"$VENV_PY"* ]] || return 1
  [[ "$cmd" == *"--port $PORT"* || "$cmd" == *"--port=${PORT}"* ]] || return 1

  if [[ -r "/proc/$pid/cwd" ]]; then
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    [[ "$cwd" == "$BACKEND_DIR" ]] || return 1
  fi

  return 0
}

if ! command -v lsof >/dev/null 2>&1; then
  echo "Error: lsof not found; refuse to stop processes without port ${PORT} check." >&2
  exit 1
fi

PIDS=()
while read -r pid; do
  [[ -z "$pid" ]] && continue
  if is_studio_uvicorn "$pid"; then
    PIDS+=("$pid")
  else
    log "Skip PID ${pid} on :${PORT} (not tk-video-studio)."
  fi
done < <(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null || true)

PID_FILE="$(pid_file || true)"
if [[ ${#PIDS[@]} -eq 0 && -n "${PID_FILE:-}" && -f "$PID_FILE" ]]; then
  pid_from_file="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid_from_file" ]] && is_studio_uvicorn "$pid_from_file"; then
    PIDS=("$pid_from_file")
  fi
fi

if [[ ${#PIDS[@]} -eq 0 ]]; then
  rm -f "${PID_FILE:-}"
  log "No tk-video-studio process found on port ${PORT}."
  exit 0
fi

for pid in "${PIDS[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    log "Stopping tk-video-studio PID ${pid} (port ${PORT}) ..."
    kill -TERM "$pid" 2>/dev/null || true
  fi
done

for _ in 1 2 3 4 5; do
  alive=0
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null && alive=1
  done
  [[ "$alive" == 0 ]] && break
  sleep 1
done

for pid in "${PIDS[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    log "Force killing PID ${pid} ..."
    kill -KILL "$pid" 2>/dev/null || true
  fi
done

rm -f "${PID_FILE:-}"
log "Stopped."
