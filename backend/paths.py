"""Cross-platform path helpers.

Rules:
- All media paths stored in SQLite use POSIX-style relative paths (``clips/shot_1.mp4``).
- Runtime resolution always goes through ``resolve_data_path`` / ``DATA_DIR / stored``.
"""

from __future__ import annotations

from pathlib import Path


def relative_data_path(full_path: Path, data_dir: Path) -> str:
    """Store a path relative to ``data/`` using forward slashes (portable across OS)."""
    return full_path.relative_to(data_dir).as_posix()


def resolve_data_path(stored: str, data_dir: Path) -> Path:
    """Resolve a DB-stored relative path on any platform."""
    if not stored:
        return data_dir
    normalized = stored.replace("\\", "/").strip("/")
    if not normalized:
        return data_dir
    return data_dir.joinpath(*normalized.split("/"))


def ffmpeg_safe_path(path: Path) -> str:
    """Absolute path string safe for ffmpeg/ffprobe CLI (concat demuxer, -i, etc.)."""
    return path.resolve().as_posix()


def ffmpeg_concat_file_line(path: Path) -> str:
    """One line for ffmpeg concat demuxer list files."""
    safe = ffmpeg_safe_path(path).replace("'", "'\\''")
    return f"file '{safe}'"
