#!/usr/bin/env bash
# 初始化 studio.config.json 与数据目录（Ubuntu 服务器示例）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLE="$ROOT/studio.config.server.example.json"
CONFIG="$ROOT/studio.config.json"

if [[ ! -f "$CONFIG" ]]; then
  if [[ -f "$EXAMPLE" ]]; then
    cp "$EXAMPLE" "$CONFIG"
    echo "Created $CONFIG from server example."
  else
    cp "$ROOT/studio.config.example.json" "$CONFIG"
    echo "Created $CONFIG from default example."
  fi
else
  echo "Config already exists: $CONFIG"
  "$ROOT/deploy/ensure-auth-config.py"
fi

DATA_DIR="$(python3 - <<PY
import json, sys
from pathlib import Path
cfg = json.loads(Path("$CONFIG").read_text())
print(cfg.get("data_dir", "data"))
PY
)"

if [[ "$DATA_DIR" != /* ]]; then
  DATA_DIR="$ROOT/$DATA_DIR"
fi

if [[ ! -d "$DATA_DIR" ]]; then
  echo "Creating data dir: $DATA_DIR"
  sudo mkdir -p "$DATA_DIR"
  sudo chown -R "$USER:$USER" "$DATA_DIR"
else
  echo "Data dir exists: $DATA_DIR"
fi

echo "Done. Edit $CONFIG if needed, then: python3 start.py --check"
