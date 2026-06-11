#!/usr/bin/env bash
# 停止 deploy/start-prod.sh 启动的 uvicorn（默认端口 8000）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8000
VENV_PY="$ROOT/.venv/bin/python"

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
  local cmd
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ "$cmd" == *"uvicorn main:app"* ]] || return 1
  [[ "$cmd" == *"$VENV_PY"* || "$cmd" == *".venv/bin/python"* ]] || return 1
  return 0
}

collect_pids() {
  local seen="|"
  local pid cmd

  if command -v lsof >/dev/null 2>&1; then
    while read -r pid; do
      [[ -z "$pid" ]] && continue
      is_studio_uvicorn "$pid" || continue
      case "$seen" in *"|$pid|"*) continue ;; esac
      seen="${seen}${pid}|"
      echo "$pid"
    done < <(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  fi

  if command -v pgrep >/dev/null 2>&1; then
    while read -r pid; do
      [[ -z "$pid" ]] && continue
      case "$seen" in *"|$pid|"*) continue ;; esac
      seen="${seen}${pid}|"
      echo "$pid"
    done < <(pgrep -f "${VENV_PY} -m uvicorn main:app" 2>/dev/null || true)
  fi
}

PIDS=()
while IFS= read -r pid; do
  [[ -n "$pid" ]] && PIDS+=("$pid")
done < <(collect_pids)

if [[ ${#PIDS[@]} -eq 0 ]]; then
  log "No tk-video-studio process found on port ${PORT}."
  exit 0
fi

for pid in "${PIDS[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    log "Stopping PID ${pid} ..."
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

log "Stopped."
