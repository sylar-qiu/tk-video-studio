"""Locate ffmpeg/ffprobe from studio config, env, or PATH."""

from __future__ import annotations

import os
import shutil
import sys


def ffmpeg_bin() -> str:
    from settings_loader import get_settings

    return os.environ.get("TK_FFMPEG") or get_settings().ffmpeg or "ffmpeg"


def ffprobe_bin() -> str:
    from settings_loader import get_settings

    return os.environ.get("TK_FFPROBE") or get_settings().ffprobe or "ffprobe"


def find_ffmpeg() -> str | None:
    return shutil.which(ffmpeg_bin())


def find_ffprobe() -> str | None:
    return shutil.which(ffprobe_bin())


def require_ffmpeg() -> str:
    path = find_ffmpeg()
    if not path:
        hint = (
            "Install FFmpeg and add it to PATH, or set TK_FFMPEG to the executable path."
        )
        if sys.platform == "win32":
            hint += " Windows: winget install Gyan.FFmpeg  or  choco install ffmpeg"
        elif sys.platform == "darwin":
            hint += " macOS: brew install ffmpeg"
        else:
            hint += " Linux: apt install ffmpeg  or  yum install ffmpeg"
        raise RuntimeError(f"ffmpeg not found. {hint}")
    return path


def require_ffprobe() -> str:
    path = find_ffprobe()
    if not path:
        raise RuntimeError(
            "ffprobe not found. Install FFmpeg (includes ffprobe) or set TK_FFPROBE."
        )
    return path
