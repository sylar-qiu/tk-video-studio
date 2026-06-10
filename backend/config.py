from __future__ import annotations

import os
from pathlib import Path

# Project root (tk-video-studio/). Override with TK_ROOT if needed.
ROOT = Path(os.environ.get("TK_ROOT", "")).expanduser().resolve() if os.environ.get("TK_ROOT") else Path(__file__).resolve().parent.parent

# Local media + SQLite. Override with TK_DATA_DIR to put data on another drive (common on Windows).
_data_override = os.environ.get("TK_DATA_DIR", "").strip()
DATA_DIR = Path(_data_override).expanduser().resolve() if _data_override else ROOT / "data"

RAW_DIR = DATA_DIR / "raw"
PROXY_DIR = DATA_DIR / "proxy"
CLIPS_DIR = DATA_DIR / "clips"
THUMB_DIR = DATA_DIR / "thumbs"
EXPORT_DIR = DATA_DIR / "exports"
PREVIEW_DIR = DATA_DIR / "previews"
BGM_DIR = DATA_DIR / "bgm"
DB_PATH = DATA_DIR / "studio.db"

FADE_DURATION_SEC = 0.5
BGM_FADE_OUT_SEC = 3.0
BGM_DEFAULT_VOLUME = 0.35

# Unified 9:16 thumbnail output (display ~100×178px in UI)
THUMB_WIDTH = 360
THUMB_HEIGHT = 640

# High-quality encode fallback (only when stream copy is impossible)
ENCODE_CRF = 15
ENCODE_PRESET = "slow"

for d in (RAW_DIR, PROXY_DIR, CLIPS_DIR, THUMB_DIR, EXPORT_DIR, PREVIEW_DIR, BGM_DIR):
    d.mkdir(parents=True, exist_ok=True)
