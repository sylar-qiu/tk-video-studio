from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path

from config import DATA_DIR, PREVIEW_DIR
from paths import resolve_data_path
from database import SessionLocal
from models import ConcatProject, Shot
from services.ffmpeg import _clip_duration_sec, concat_shots

_building_lock = threading.Lock()
_building_ids: set[int] = set()
# Bump when concat pipeline changes so cached previews rebuild.
CONCAT_PIPELINE_REV = "v4"


def _friendly_preview_error(exc: Exception) -> str:
    raw = str(exc).strip()
    if not raw:
        return "预览合成失败"
    if "xfade" in raw or "frame rate" in raw.lower():
        return "分镜帧率不一致，合成失败"
    if "镜头未就绪" in raw:
        return raw
    if len(raw) > 200:
        return "预览合成失败，请稍后重试"
    return raw


def _preview_video_path(project_id: int) -> Path:
    return PREVIEW_DIR / f"project_{project_id}.mp4"


def _preview_meta_path(project_id: int) -> Path:
    return PREVIEW_DIR / f"project_{project_id}.json"


def compute_preview_fingerprint(db, project: ConcatProject) -> str:
    parts: list[str] = []
    for item in project.items:
        shot_id = item.get("shot_id")
        transition = item.get("transition", "cut")
        mtime = 0
        if shot_id:
            shot = db.get(Shot, shot_id)
            if shot and shot.clip_path:
                clip = resolve_data_path(shot.clip_path, DATA_DIR)
                if clip.is_file():
                    mtime = int(clip.stat().st_mtime)
        parts.append(f"{shot_id}:{transition}:{mtime}")
    parts.append(CONCAT_PIPELINE_REV)
    payload = "|".join(parts)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _read_meta(project_id: int) -> dict:
    path = _preview_meta_path(project_id)
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _write_meta(project_id: int, data: dict) -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    _preview_meta_path(project_id).write_text(
        json.dumps(data, ensure_ascii=False),
        encoding="utf-8",
    )


def is_preview_current(project_id: int, fingerprint: str) -> bool:
    video = _preview_video_path(project_id)
    meta = _read_meta(project_id)
    return (
        video.is_file()
        and meta.get("fingerprint") == fingerprint
        and meta.get("status") == "ready"
    )


def is_preview_building(project_id: int) -> bool:
    with _building_lock:
        return project_id in _building_ids


def preview_status(project_id: int, fingerprint: str) -> dict:
    meta = _read_meta(project_id)
    video = _preview_video_path(project_id)

    if is_preview_current(project_id, fingerprint):
        duration_ms = int(_clip_duration_sec(video) * 1000)
        mtime = int(video.stat().st_mtime)
        return {
            "status": "ready",
            "preview_url": f"/api/files/preview/{project_id}?v={mtime}",
            "progress": 1.0,
            "error": "",
            "duration_ms": duration_ms,
        }

    if is_preview_building(project_id) or meta.get("status") == "building":
        return {
            "status": "building",
            "preview_url": None,
            "progress": float(meta.get("progress", 0.05)),
            "error": "",
            "duration_ms": 0,
        }

    if meta.get("fingerprint") == fingerprint and meta.get("status") == "error":
        return {
            "status": "error",
            "preview_url": None,
            "progress": meta.get("progress", 0.0),
            "error": meta.get("error") or "预览生成失败",
            "duration_ms": 0,
        }

    return {
        "status": "missing",
        "preview_url": None,
        "progress": 0.0,
        "error": "",
        "duration_ms": 0,
    }


def build_project_preview(project_id: int) -> None:
    with _building_lock:
        if project_id in _building_ids:
            return
        _building_ids.add(project_id)

    db = SessionLocal()
    try:
        project = db.get(ConcatProject, project_id)
        if not project or not project.items:
            _write_meta(project_id, {
                "fingerprint": "",
                "status": "error",
                "error": "脚本为空",
                "progress": 0.0,
            })
            return

        fingerprint = compute_preview_fingerprint(db, project)
        if is_preview_current(project_id, fingerprint):
            return

        output = _preview_video_path(project_id)
        output.unlink(missing_ok=True)
        _preview_meta_path(project_id).unlink(missing_ok=True)
        _write_meta(project_id, {
            "fingerprint": fingerprint,
            "status": "building",
            "error": "",
            "progress": 0.05,
        })

        shot_ids = [item["shot_id"] for item in project.items]
        transitions = [item.get("transition", "cut") for item in project.items[1:]]

        shots = db.query(Shot).filter(Shot.id.in_(shot_ids)).all()
        shot_map = {s.id: s for s in shots}
        ordered = [shot_map[sid] for sid in shot_ids if sid in shot_map]

        missing = [s for s in ordered if s.status != "ready" or not s.clip_path]
        if missing:
            raise RuntimeError(f"镜头未就绪: {[s.id for s in missing]}")

        clip_paths = [resolve_data_path(s.clip_path, DATA_DIR) for s in ordered]

        def progress_cb(pct: float) -> None:
            _write_meta(project_id, {
                "fingerprint": fingerprint,
                "status": "building",
                "error": "",
                "progress": 0.05 + pct * 0.9,
            })

        concat_shots(
            clip_paths,
            transitions,
            output,
            progress_callback=progress_cb,
            fast=True,
        )

        _write_meta(project_id, {
            "fingerprint": fingerprint,
            "status": "ready",
            "error": "",
            "progress": 1.0,
        })
    except Exception as exc:
        _preview_video_path(project_id).unlink(missing_ok=True)
        fp = ""
        try:
            project = db.get(ConcatProject, project_id)
            if project:
                fp = compute_preview_fingerprint(db, project)
        except Exception:
            pass
        _write_meta(project_id, {
            "fingerprint": fp,
            "status": "error",
            "error": _friendly_preview_error(exc),
            "progress": 0.0,
        })
    finally:
        with _building_lock:
            _building_ids.discard(project_id)
        db.close()


def delete_project_preview(project_id: int) -> None:
    _preview_video_path(project_id).unlink(missing_ok=True)
    _preview_meta_path(project_id).unlink(missing_ok=True)
    with _building_lock:
        _building_ids.discard(project_id)
