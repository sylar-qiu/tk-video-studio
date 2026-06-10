from __future__ import annotations

import json
import shutil
import threading
import uuid
from pathlib import Path
from typing import BinaryIO

from sqlalchemy.orm import Session

from config import BGM_DIR, CLIPS_DIR, DATA_DIR, PROXY_DIR, RAW_DIR, THUMB_DIR
from paths import relative_data_path, resolve_data_path
from database import SessionLocal
from models import Asset, ExportJob, Shot
from services.ffmpeg import (
    apply_export_audio,
    asset_thumb_path,
    concat_shots,
    extract_shot_clip,
    make_asset_thumbnail,
    make_thumbnail,
    new_export_path,
    parse_duration_ms,
    parse_video_size,
    probe_video,
)


def save_upload_stream(file_obj: BinaryIO, original_name: str) -> tuple[str, Path, int]:
    """Stream file contents to disk in chunks, avoiding OOM on large files.

    Returns (filename, dest_path, file_size_in_bytes).
    """
    ext = Path(original_name).suffix.lower() or ".mp4"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = RAW_DIR / filename
    file_size = 0
    with open(dest, "wb") as f:
        while True:
            chunk = file_obj.read(64 * 1024)  # 64KB chunks
            if not chunk:
                break
            f.write(chunk)
            file_size += len(chunk)
    return filename, dest, file_size


def process_asset_upload(asset_id: int) -> None:
    db = SessionLocal()
    try:
        asset = db.get(Asset, asset_id)
        if not asset:
            return
        raw_path = RAW_DIR / asset.filename
        probe = probe_video(raw_path)
        asset.duration_ms = parse_duration_ms(probe)
        asset.width, asset.height = parse_video_size(probe)
        make_asset_thumbnail(raw_path, asset_thumb_path(asset_id), 0)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def process_shot_extract(shot_id: int) -> None:
    db = SessionLocal()
    try:
        shot = db.get(Shot, shot_id)
        if not shot:
            return
        asset = db.get(Asset, shot.asset_id)
        if not asset:
            shot.status = "failed"
            db.commit()
            return

        shot.status = "processing"
        db.commit()

        raw_path = RAW_DIR / asset.filename
        clip_name = f"shot_{shot_id}.mp4"
        thumb_name = f"shot_{shot_id}.jpg"

        clip_path = CLIPS_DIR / clip_name
        clip_path.parent.mkdir(parents=True, exist_ok=True)
        thumb_path = THUMB_DIR / thumb_name

        duration_s = max((shot.end_ms - shot.start_ms) / 1000.0, 0.1)

        def progress_cb(pct: float):
            # For shot extraction, progress is approximate since we can't
            # easily measure ffmpeg's encode progress against the clip length.
            # We'll use it to update the export job if this were an export;
            # for shot extraction, skip DB updates.
            pass

        extract_shot_clip(raw_path, clip_path, shot.start_ms, shot.end_ms)
        make_thumbnail(clip_path, thumb_path, 0)

        shot.clip_path = relative_data_path(clip_path, DATA_DIR)
        shot.thumb_path = relative_data_path(thumb_path, DATA_DIR)
        shot.status = "ready"
        if not shot.name:
            shot.name = f"镜头 {shot_id}"
        from services.resource_stats import on_shot_became_library_video

        on_shot_became_library_video(db, shot)
        db.commit()
    except Exception:
        db.rollback()
        shot = db.get(Shot, shot_id)
        if shot:
            shot.status = "failed"
            db.commit()
        raise
    finally:
        db.close()


def process_export_job(job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.get(ExportJob, job_id)
        if not job:
            return

        job.status = "processing"
        job.progress = 0.05
        db.commit()

        shot_ids = json.loads(job.shot_ids_json)
        transitions = json.loads(job.transitions_json)

        shots = db.query(Shot).filter(Shot.id.in_(shot_ids)).all()
        shot_map = {s.id: s for s in shots}
        ordered = [shot_map[sid] for sid in shot_ids if sid in shot_map]

        missing = [s for s in ordered if s.status != "ready" or not s.clip_path]
        if missing:
            job.status = "failed"
            job.error = f"镜头未就绪: {[s.id for s in missing]}"
            db.commit()
            return

        clip_paths = [resolve_data_path(s.clip_path, DATA_DIR) for s in ordered]
        output = new_export_path(job.name.replace(" ", "_"))
        temp_video = output.with_name(f"{output.stem}_vid{output.suffix}")

        def progress_cb(pct: float):
            try:
                job.progress = 0.05 + pct * 0.75
                db.commit()
            except Exception:
                pass

        concat_shots(
            clip_paths,
            transitions,
            temp_video,
            progress_callback=progress_cb,
        )

        job.progress = 0.85
        db.commit()

        bgm_path = None
        if job.bgm_enabled and job.bgm_filename:
            candidate = BGM_DIR / job.bgm_filename
            if candidate.is_file():
                bgm_path = candidate

        apply_export_audio(
            temp_video,
            output,
            include_shot_audio=job.include_shot_audio,
            shot_audio_volume=job.shot_audio_volume,
            bgm_path=bgm_path,
            bgm_volume=job.bgm_volume,
        )
        temp_video.unlink(missing_ok=True)

        job.output_path = relative_data_path(output, DATA_DIR)
        job.status = "done"
        job.progress = 1.0
        from services.resource_stats import on_export_became_video

        on_export_became_video(db, job)
        db.commit()

        try:
            make_thumbnail(output, THUMB_DIR / f"export_{job_id}.jpg", 0)
        except Exception:
            pass
    except Exception as exc:
        db.rollback()
        job = db.get(ExportJob, job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)
            db.commit()
        raise
    finally:
        db.close()


def delete_asset_files(asset: Asset) -> None:
    """Remove all files associated with an asset (raw, proxy, clips, thumbs)."""
    for d in (RAW_DIR, PROXY_DIR):
        p = d / asset.filename
        if p.exists():
            p.unlink()

    thumb = asset_thumb_path(asset.id)
    if thumb.exists():
        thumb.unlink()

    # Delete associated shot clip files
    for shot in asset.shots:
        if shot.clip_path:
            p = resolve_data_path(shot.clip_path, DATA_DIR)
            if p.exists():
                p.unlink()
        if shot.thumb_path:
            p = resolve_data_path(shot.thumb_path, DATA_DIR)
            if p.exists():
                p.unlink()


def delete_shot_files(shot: Shot) -> None:
    """Remove files for a single shot."""
    if shot.clip_path:
        p = resolve_data_path(shot.clip_path, DATA_DIR)
        if p.exists():
            p.unlink()
    if shot.thumb_path:
        p = resolve_data_path(shot.thumb_path, DATA_DIR)
        if p.exists():
            p.unlink()


def delete_export_files(job: ExportJob) -> None:
    if job.output_path:
        p = resolve_data_path(job.output_path, DATA_DIR)
        if p.exists():
            p.unlink()
    thumb = THUMB_DIR / f"export_{job.id}.jpg"
    if thumb.exists():
        thumb.unlink()


def run_in_background(fn, *args) -> None:
    thread = threading.Thread(target=fn, args=args, daemon=True)
    thread.start()
