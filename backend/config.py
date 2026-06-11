from __future__ import annotations

from pathlib import Path

from settings_loader import get_settings

_settings = get_settings()

ROOT = _settings.root
DATA_DIR = _settings.data_dir

RAW_DIR = DATA_DIR / "raw"
PROXY_DIR = DATA_DIR / "proxy"
CLIPS_DIR = DATA_DIR / "clips"
THUMB_DIR = DATA_DIR / "thumbs"
EXPORT_DIR = DATA_DIR / "exports"
PREVIEW_DIR = DATA_DIR / "previews"
BGM_DIR = DATA_DIR / "bgm"
DB_PATH = DATA_DIR / "studio.db"

BACKEND_HOST = _settings.backend_host
BACKEND_PORT = _settings.backend_port
FRONTEND_HOST = _settings.frontend_host
FRONTEND_PORT = _settings.frontend_port

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
