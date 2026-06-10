from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

BEIJING = ZoneInfo("Asia/Shanghai")


def beijing_now() -> datetime:
    """Return naive datetime in Asia/Shanghai (Beijing time)."""
    return datetime.now(BEIJING).replace(tzinfo=None)


def file_mtime_beijing(path) -> datetime | None:
    """Read file mtime as naive Beijing wall clock."""
    from pathlib import Path

    p = Path(path)
    if not p.is_file():
        return None
    return datetime.fromtimestamp(p.stat().st_mtime, tz=BEIJING).replace(tzinfo=None)


def format_api_datetime(dt: datetime) -> str:
    """Serialize naive DB datetime (Beijing wall clock) with +08:00 offset."""
    if dt.tzinfo is not None:
        return dt.astimezone(BEIJING).isoformat(timespec="seconds")
    return dt.replace(tzinfo=BEIJING).isoformat(timespec="seconds")
