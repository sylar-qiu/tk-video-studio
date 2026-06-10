from __future__ import annotations

from config import DATA_DIR, FADE_DURATION_SEC
from paths import resolve_data_path
from models import ConcatProject, Shot
from services.ffmpeg import _clip_duration_sec

FADE_MS = int(FADE_DURATION_SEC * 1000)


def calc_export_duration_ms(db, project: ConcatProject) -> int:
    """Estimate export/preview length from actual clip files and transitions."""
    if project.source == "batch" and project.scenes:
        total = 0
        for scene in project.scenes:
            total += _calc_items_duration_ms(db, scene.get("items") or [])
        return total
    return _calc_items_duration_ms(db, project.items)


def _calc_items_duration_ms(db, items: list[dict]) -> int:
    if not items:
        return 0

    total = 0
    for index, item in enumerate(items):
        shot_id = item.get("shot_id")
        if not shot_id:
            continue
        shot = db.get(Shot, shot_id)
        if not shot:
            continue

        ms = max(shot.end_ms - shot.start_ms, 0)
        if shot.clip_path:
            clip = resolve_data_path(shot.clip_path, DATA_DIR)
            if clip.is_file():
                ms = int(_clip_duration_sec(clip) * 1000)

        if index > 0 and item.get("transition") == "fade":
            ms -= FADE_MS
        total += max(ms, 0)

    return max(total, 0)
