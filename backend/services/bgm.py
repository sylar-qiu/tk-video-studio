from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from config import BGM_DIR
from models import BgmTrack, ConcatProject

_BGM_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}


def bgm_track_to_dict(track: BgmTrack) -> dict:
    return {
        "id": track.id,
        "original_name": track.original_name,
        "created_at": track.created_at,
    }


def list_bgm_tracks(db: Session) -> list[BgmTrack]:
    return db.query(BgmTrack).order_by(BgmTrack.created_at.desc()).all()


def get_bgm_track(db: Session, track_id: int) -> BgmTrack:
    track = db.get(BgmTrack, track_id)
    if not track:
        raise HTTPException(404, "背景音乐不存在")
    path = BGM_DIR / track.filename
    if not path.is_file():
        raise HTTPException(404, "背景音乐文件不存在")
    return track


async def create_bgm_track(db: Session, file: UploadFile) -> BgmTrack:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _BGM_EXTENSIONS:
        raise HTTPException(400, "不支持的音频格式，请上传 mp3 / wav / m4a / aac")

    stored = f"track_{uuid.uuid4().hex}{ext}"
    dest = BGM_DIR / stored
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    track = BgmTrack(
        filename=stored,
        original_name=file.filename or stored,
    )
    db.add(track)
    db.commit()
    db.refresh(track)
    return track


def assign_project_bgm(db: Session, project: ConcatProject, track: BgmTrack | None) -> None:
    if track is None:
        project.bgm_track_id = None
        project.bgm_filename = ""
        project.bgm_original_name = ""
        project.bgm_enabled = False
        return

    project.bgm_track_id = track.id
    project.bgm_filename = track.filename
    project.bgm_original_name = track.original_name


def clear_project_bgm_selection(project: ConcatProject) -> None:
    project.bgm_track_id = None
    project.bgm_filename = ""
    project.bgm_original_name = ""
    project.bgm_enabled = False
