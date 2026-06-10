#!/usr/bin/env bash
# macOS / Linux wrapper — delegates to cross-platform start.py
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
exec python3 start.py "$@"
