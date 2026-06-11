"""Load studio.config.json with optional environment overrides."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_NAME = "studio.config.json"
LOCAL_CONFIG_NAME = "studio.config.local.json"


@dataclass(frozen=True)
class StudioSettings:
    root: Path
    config_path: Path | None
    data_dir: Path
    backend_host: str
    backend_port: int
    frontend_host: str
    frontend_port: int
    ffmpeg: str | None
    ffprobe: str | None

    def to_public_dict(self) -> dict[str, Any]:
        """Fields safe to expose in API / web UI (read-only)."""
        return {
            "config_path": str(self.config_path) if self.config_path else None,
            "data_dir": str(self.data_dir),
            "backend_host": self.backend_host,
            "backend_port": self.backend_port,
            "frontend_host": self.frontend_host,
            "frontend_port": self.frontend_port,
            "ffmpeg": self.ffmpeg,
            "ffprobe": self.ffprobe,
        }


_settings: StudioSettings | None = None


def project_root() -> Path:
    if os.environ.get("TK_ROOT", "").strip():
        return Path(os.environ["TK_ROOT"]).expanduser().resolve()
    return Path(__file__).resolve().parent.parent


def _config_candidates(root: Path) -> list[Path]:
    if os.environ.get("STUDIO_CONFIG", "").strip():
        return [Path(os.environ["STUDIO_CONFIG"]).expanduser().resolve()]
    return [
        root / LOCAL_CONFIG_NAME,
        root / DEFAULT_CONFIG_NAME,
    ]


def _read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Config root must be a JSON object: {path}")
    return data


def _resolve_dir(value: str, root: Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = root / path
    return path.resolve()


def _platform_default_data_dir() -> str:
    """When no studio.config.json and no TK_DATA_DIR."""
    if sys.platform == "win32":
        return "C:/data/tk-video-studio"
    if sys.platform == "linux":
        return "/data/tk-video-studio"
    # macOS 等本地开发：项目内 data/
    return "data"


def _resolve_data_dir_raw(merged: dict[str, Any]) -> str:
    override = os.environ.get("TK_DATA_DIR", "").strip()
    if override:
        return override
    if "data_dir" in merged and merged["data_dir"] is not None and str(merged["data_dir"]).strip():
        return str(merged["data_dir"]).strip()
    return _platform_default_data_dir()


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    return int(raw)


def load_settings(*, root: Path | None = None, reload: bool = False) -> StudioSettings:
    global _settings
    if _settings is not None and not reload:
        return _settings

    root = root or project_root()
    merged: dict[str, Any] = {}
    config_path: Path | None = None

    for candidate in _config_candidates(root):
        if candidate.is_file():
            merged = _read_json(candidate)
            config_path = candidate
            break

    backend = merged.get("backend") or {}
    frontend = merged.get("frontend") or {}
    ffmpeg_cfg = merged.get("ffmpeg") or {}

    data_dir_raw = _resolve_data_dir_raw(merged)
    backend_host = os.environ.get("TK_BACKEND_HOST", "").strip() or str(backend.get("host") or "127.0.0.1")
    backend_port = _env_int("TK_BACKEND_PORT", int(backend.get("port") or 8000))
    frontend_host = os.environ.get("TK_FRONTEND_HOST", "").strip() or str(frontend.get("host") or "127.0.0.1")
    frontend_port = _env_int("TK_FRONTEND_PORT", int(frontend.get("port") or 5173))
    ffmpeg = os.environ.get("TK_FFMPEG", "").strip() or ffmpeg_cfg.get("ffmpeg")
    ffprobe = os.environ.get("TK_FFPROBE", "").strip() or ffmpeg_cfg.get("ffprobe")

    _settings = StudioSettings(
        root=root,
        config_path=config_path,
        data_dir=_resolve_dir(data_dir_raw, root),
        backend_host=backend_host,
        backend_port=backend_port,
        frontend_host=frontend_host,
        frontend_port=frontend_port,
        ffmpeg=str(ffmpeg).strip() if ffmpeg else None,
        ffprobe=str(ffprobe).strip() if ffprobe else None,
    )
    return _settings


def get_settings() -> StudioSettings:
    return load_settings()
