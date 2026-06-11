from __future__ import annotations

import json
import re
import shutil
import uuid
from pathlib import Path

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from config import BGM_DIR, DATA_DIR, PREVIEW_DIR, PROXY_DIR, RAW_DIR, THUMB_DIR
from paths import resolve_data_path
from database import get_db
from datetime import datetime

from time_utils import beijing_now

from models import Asset, BgmTrack, ConcatProject, ExportJob, Product, Shot, ShotNameStat, Tag, Work
from schemas import (
    AssetOut,
    AssetUpdate,
    BgmTrackOut,
    ConcatItem,
    ExportCreate,
    ExportOut,
    ExportUpdate,
    ProjectBgmSelect,
    ProjectCreate,
    ProjectOut,
    ProjectPreviewOut,
    ProjectUpdate,
    ScriptScene,
    ShotCreate,
    ShotOut,
    ShotUpdate,
    TagCreate,
    TagOut,
    TagResourceCounts,
    ShotNameOut,
    TagStatsOut,
    SystemInfoOut,
    WorkOut,
    WorkReview,
    WorkUpdate,
)
from services.ffmpeg import _clip_duration_sec, asset_thumb_path, make_asset_thumbnail
from services.bgm import (
    assign_project_bgm,
    clear_project_bgm_selection,
    create_bgm_track,
    get_bgm_track,
    list_bgm_tracks,
)
from services.duration import calc_export_duration_ms
from services.naming import next_batch_project_name, next_export_name, next_project_name
from services.preview import (
    build_project_preview,
    compute_preview_fingerprint,
    delete_project_preview,
    is_preview_building,
    is_preview_current,
    preview_status,
)
from services.products import product_name_map
from services.tasks import (
    delete_asset_files,
    delete_export_files,
    delete_shot_files,
    process_asset_upload,
    process_export_job,
    process_shot_extract,
    run_in_background,
    save_upload_stream,
)
from services.resource_stats import (
    on_asset_created,
    on_asset_deleted,
    on_asset_tags_changed,
    on_export_became_video,
    on_export_deleted,
    on_export_tags_changed,
    on_shot_deleted,
    on_shot_updated,
    on_work_created,
    on_work_deleted,
    on_work_tags_changed,
    shot_display_name,
    tag_counts_dict,
    tag_video_count,
)
from services.tags import create_tag, ensure_tags, list_tags, tag_exists

router = APIRouter(prefix="/api")


def tag_to_out(tag: Tag) -> TagOut:
    counts = TagResourceCounts(**tag_counts_dict(tag))
    return TagOut(name=tag.name, counts=counts, videos=tag_video_count(tag))


def _shot_display_name(name: str) -> str:
    return name.strip() or "未命名分镜"


def _apply_shot_library_filters(
    shots: list,
    *,
    ready_only: bool,
    tagged_only: bool,
    tag: Optional[str],
    product_id: Optional[int],
    name: Optional[str],
) -> list:
    result = []
    for s in shots:
        if ready_only and s.status != "ready":
            continue
        if tagged_only and not s.tags:
            continue
        if tag and tag not in s.tags:
            continue
        if product_id is not None and s.product_id != product_id:
            continue
        if name is not None and _shot_display_name(s.name) != name:
            continue
        result.append(s)
    return result


def asset_to_out(asset: Asset, db: Session) -> AssetOut:
    raw_path = RAW_DIR / asset.filename
    thumb_path = asset_thumb_path(asset.id)
    if not thumb_path.exists() and raw_path.exists():
        try:
            make_asset_thumbnail(raw_path, thumb_path, 0)
        except Exception:
            pass
    names = product_name_map(db)
    return AssetOut(
        id=asset.id,
        product_id=asset.product_id,
        product_name=names.get(asset.product_id) if asset.product_id else None,
        filename=asset.filename,
        original_name=asset.original_name,
        duration_ms=asset.duration_ms,
        width=asset.width,
        height=asset.height,
        file_size=asset.file_size,
        tags=asset.tags,
        created_at=asset.created_at,
        proxy_url=None,
        thumb_url=f"/api/files/thumb/{thumb_path.name}" if thumb_path.exists() else None,
    )


def _shot_clip_url(shot: Shot) -> Optional[str]:
    if not shot.clip_path or shot.status != "ready":
        return None
    clip_path = resolve_data_path(shot.clip_path, DATA_DIR)
    if not clip_path.exists():
        return None
    version = int(clip_path.stat().st_mtime)
    return f"/api/files/clip/{shot.id}?v={version}"


def shot_to_out(shot: Shot, asset: Optional[Asset], db: Session) -> ShotOut:
    names = product_name_map(db)
    clip_duration_ms = None
    if shot.clip_path and shot.status == "ready":
        clip_path = resolve_data_path(shot.clip_path, DATA_DIR)
        if clip_path.is_file():
            clip_duration_ms = int(_clip_duration_sec(clip_path) * 1000)
    return ShotOut(
        id=shot.id,
        asset_id=shot.asset_id,
        product_id=shot.product_id,
        product_name=names.get(shot.product_id) if shot.product_id else None,
        name=shot.name,
        start_ms=shot.start_ms,
        end_ms=shot.end_ms,
        tags=shot.tags,
        thumb_url=f"/api/files/thumb/{Path(shot.thumb_path).name}" if shot.thumb_path else None,
        clip_url=_shot_clip_url(shot),
        status=shot.status,
        duration_ms=max(shot.end_ms - shot.start_ms, 0),
        clip_duration_ms=clip_duration_ms,
        created_at=shot.created_at,
        asset_name=asset.original_name if asset else None,
    )


@router.get("/health")
def health():
    import platform
    import sys

    from services.ffmpeg_bin import find_ffmpeg, find_ffprobe
    from settings_loader import get_settings

    settings = get_settings()
    return {
        "ok": True,
        "platform": platform.system(),
        "python": sys.version.split()[0],
        "data_dir": str(DATA_DIR),
        "config_path": str(settings.config_path) if settings.config_path else None,
        "ffmpeg": find_ffmpeg(),
        "ffprobe": find_ffprobe(),
    }


@router.get("/system/info", response_model=SystemInfoOut)
def system_info():
    import platform
    import sys

    from services.ffmpeg_bin import find_ffmpeg, find_ffprobe
    from settings_loader import get_settings

    pub = get_settings().to_public_dict()
    return SystemInfoOut(
        **pub,
        platform=platform.system(),
        python=sys.version.split()[0],
        ffmpeg_resolved=find_ffmpeg(),
        ffprobe_resolved=find_ffprobe(),
    )


@router.post("/assets/upload", response_model=AssetOut)
async def upload_asset(
    product_id: int = Form(...),
    tags: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "缺少文件名")
    if not db.get(Product, product_id):
        raise HTTPException(404, "产品不存在")

    filename, raw_path, file_size = save_upload_stream(file.file, file.filename)
    if file_size == 0:
        raw_path.unlink(missing_ok=True)
        raise HTTPException(400, "空文件")

    from services.ffmpeg import probe_video, parse_duration_ms, parse_video_size
    probe = probe_video(raw_path)

    asset = Asset(
        filename=filename,
        original_name=file.filename,
        duration_ms=parse_duration_ms(probe),
        width=parse_video_size(probe)[0],
        height=parse_video_size(probe)[1],
        file_size=file_size,
        product_id=product_id,
        created_at=beijing_now(),
    )
    if tags.strip():
        asset.tags = [t.strip() for t in re.split(r"[,，\s]+", tags.strip()) if t.strip()]
        ensure_tags(db, asset.tags)
    db.add(asset)
    db.flush()
    on_asset_created(db, asset)
    db.commit()
    db.refresh(asset)

    run_in_background(process_asset_upload, asset.id)
    return asset_to_out(asset, db)


@router.get("/assets", response_model=list[AssetOut])
def list_assets(
    product_id: Optional[int] = Query(None),
    tag: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Asset)
    if product_id is not None:
        q = q.filter(Asset.product_id == product_id)
    assets = q.order_by(Asset.id.desc()).all()
    if tag:
        assets = [a for a in assets if tag in a.tags]
    return [asset_to_out(a, db) for a in assets]


@router.get("/assets/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "素材不存在")
    return asset_to_out(asset, db)


@router.patch("/assets/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: int, body: AssetUpdate, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "素材不存在")
    if body.product_id is not None:
        if body.product_id and not db.get(Product, body.product_id):
            raise HTTPException(404, "产品不存在")
        asset.product_id = body.product_id
    if body.tags is not None:
        old_tags = list(asset.tags)
        asset.tags = body.tags
        ensure_tags(db, asset.tags)
        on_asset_tags_changed(db, old_tags, asset.tags)
    db.commit()
    db.refresh(asset)
    return asset_to_out(asset, db)


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm import selectinload

    asset = (
        db.query(Asset)
        .options(selectinload(Asset.shots))
        .filter(Asset.id == asset_id)
        .first()
    )
    if not asset:
        raise HTTPException(404, "素材不存在")
    for shot in list(asset.shots):
        on_shot_deleted(db, shot)
    on_asset_deleted(db, asset)
    delete_asset_files(asset)
    db.delete(asset)
    db.commit()
    return {"ok": True}


@router.get("/assets/{asset_id}/stream")
def stream_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "素材不存在")
    path = RAW_DIR / asset.filename
    if not path.exists():
        raise HTTPException(404, "文件不存在")
    return FileResponse(path, media_type="video/mp4")


@router.get("/tags/stats", response_model=list[TagStatsOut])
def list_tag_stats(db: Session = Depends(get_db)):
    rows = list_tags(db)
    return [
        TagStatsOut(
            name=tag.name,
            counts=TagResourceCounts(**tag_counts_dict(tag)),
            videos=tag_video_count(tag),
            total=sum(tag_counts_dict(tag).values()),
        )
        for tag in sorted(
            rows,
            key=lambda t: (-tag_video_count(t), t.name),
        )
    ]


@router.get("/tags", response_model=list[TagOut])
def list_tags_endpoint(db: Session = Depends(get_db)):
    return [tag_to_out(tag) for tag in list_tags(db)]


@router.post("/tags", response_model=TagOut)
def create_tag_endpoint(body: TagCreate, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "标签名称不能为空")
    if tag_exists(db, name):
        raise HTTPException(409, "标签已存在")
    tag = create_tag(db, name)
    return tag_to_out(tag)


@router.post("/shots", response_model=ShotOut)
def create_shot(body: ShotCreate, db: Session = Depends(get_db)):
    asset = db.get(Asset, body.asset_id)
    if not asset:
        raise HTTPException(404, "素材不存在")
    if body.end_ms <= body.start_ms:
        raise HTTPException(400, "结束时间必须大于开始时间")
    if body.end_ms > asset.duration_ms:
        raise HTTPException(400, "结束时间超出素材时长")
    product_id = body.product_id if body.product_id is not None else asset.product_id
    if not product_id:
        raise HTTPException(400, "请选择所属产品")
    if not db.get(Product, product_id):
        raise HTTPException(400, "产品不存在")

    shot = Shot(
        asset_id=body.asset_id,
        name=body.name,
        start_ms=body.start_ms,
        end_ms=body.end_ms,
        status="pending",
        product_id=product_id,
        created_at=beijing_now(),
    )
    shot.tags = body.tags
    ensure_tags(db, shot.tags)
    db.add(shot)
    db.commit()
    db.refresh(shot)

    run_in_background(process_shot_extract, shot.id)
    return shot_to_out(shot, asset, db)


@router.get("/shots/names", response_model=list[ShotNameOut])
def list_shot_names(
    product_id: Optional[int] = Query(None),
    tag: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    shots = db.query(Shot).order_by(Shot.name.asc(), Shot.id.asc()).all()
    names: set[str] = set()
    for s in _apply_shot_library_filters(
        shots,
        ready_only=True,
        tagged_only=True,
        tag=tag,
        product_id=product_id,
        name=None,
    ):
        names.add(_shot_display_name(s.name))

    stat_map = {row.name: row.count_videos for row in db.query(ShotNameStat).all()}
    ordered = sorted(names, key=lambda x: (x != "未命名分镜", x))
    return [ShotNameOut(name=name, video_count=stat_map.get(name, 0)) for name in ordered]


@router.get("/shots", response_model=list[ShotOut])
def list_shots(
    tag: Optional[str] = Query(None),
    tagged_only: bool = Query(False),
    ready_only: bool = Query(False),
    asset_id: Optional[int] = Query(None),
    product_id: Optional[int] = Query(None),
    name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Shot)
    if asset_id is not None:
        q = q.filter(Shot.asset_id == asset_id)
    shots = q.order_by(Shot.asset_id.asc(), Shot.start_ms.asc(), Shot.id.asc()).all()
    assets = {a.id: a for a in db.query(Asset).all()}
    filtered = _apply_shot_library_filters(
        shots,
        ready_only=ready_only,
        tagged_only=tagged_only,
        tag=tag,
        product_id=product_id,
        name=name,
    )
    return [shot_to_out(s, assets.get(s.asset_id), db) for s in filtered]


@router.get("/shots/{shot_id}", response_model=ShotOut)
def get_shot(shot_id: int, db: Session = Depends(get_db)):
    shot = db.get(Shot, shot_id)
    if not shot:
        raise HTTPException(404, "镜头不存在")
    asset = db.get(Asset, shot.asset_id)
    return shot_to_out(shot, asset, db)


@router.patch("/shots/{shot_id}", response_model=ShotOut)
def update_shot(shot_id: int, body: ShotUpdate, db: Session = Depends(get_db)):
    shot = db.get(Shot, shot_id)
    if not shot:
        raise HTTPException(404, "镜头不存在")
    old_name = shot.name
    old_tags = list(shot.tags)
    old_status = shot.status
    if body.name is not None:
        shot.name = body.name
    if body.tags is not None:
        shot.tags = body.tags
        ensure_tags(db, shot.tags)
    if body.product_id is not None:
        if body.product_id and not db.get(Product, body.product_id):
            raise HTTPException(404, "产品不存在")
        shot.product_id = body.product_id
    on_shot_updated(
        db,
        old_name=old_name,
        old_tags=old_tags,
        old_status=old_status,
        shot=shot,
    )
    db.commit()
    db.refresh(shot)
    asset = db.get(Asset, shot.asset_id)
    return shot_to_out(shot, asset, db)


@router.delete("/shots/{shot_id}")
def delete_shot(shot_id: int, db: Session = Depends(get_db)):
    shot = db.get(Shot, shot_id)
    if not shot:
        raise HTTPException(404, "镜头不存在")
    on_shot_deleted(db, shot)
    delete_shot_files(shot)
    db.delete(shot)
    db.commit()
    return {"ok": True}


@router.get("/exports/next-name")
def preview_export_name(db: Session = Depends(get_db)):
    return {"name": next_export_name(db)}


def _project_bgm_url(project: ConcatProject) -> str | None:
    if project.bgm_filename:
        return f"/api/files/bgm/{project.id}"
    return None


def project_to_out(project: ConcatProject, db: Session) -> ProjectOut:
    items_raw = project.items
    items = [ConcatItem(**it) for it in items_raw]
    scenes = [ScriptScene(**s) for s in project.scenes] if project.source == "batch" else []
    if project.source == "batch" and scenes:
        shot_count = sum(len(s.items) for s in scenes)
    else:
        shot_count = len(items)
    duration_ms = calc_export_duration_ms(db, project)
    return ProjectOut(
        id=project.id,
        name=project.name,
        items=items,
        scenes=scenes,
        duration_ms=duration_ms,
        shot_count=shot_count,
        include_shot_audio=project.include_shot_audio,
        shot_audio_volume=project.shot_audio_volume,
        bgm_enabled=project.bgm_enabled,
        bgm_track_id=project.bgm_track_id,
        bgm_filename=project.bgm_filename or None,
        bgm_original_name=project.bgm_original_name or None,
        bgm_volume=project.bgm_volume,
        bgm_url=_project_bgm_url(project),
        source=project.source if project.source in ("manual", "batch") else "manual",
        updated_at=project.updated_at,
        created_at=project.created_at,
    )


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(ConcatProject).order_by(ConcatProject.updated_at.desc()).all()
    return [project_to_out(p, db) for p in projects]


@router.post("/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    is_batch = body.source == "batch"
    default_name = next_batch_project_name(db) if is_batch else next_project_name(db)
    project = ConcatProject(
        name=body.name or default_name,
        items=[],
        source=body.source,
    )
    if is_batch:
        project.scenes = [
            {"id": "scene-1", "name": "场景 1", "items": []},
            {"id": "scene-2", "name": "场景 2", "items": []},
        ]
    db.add(project)
    db.commit()
    db.refresh(project)
    return project_to_out(project, db)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(ConcatProject, project_id)
    if not project:
        raise HTTPException(404, "脚本不存在")
    return project_to_out(project, db)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, body: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(ConcatProject, project_id)
    if not project:
        raise HTTPException(404, "脚本不存在")
    if body.name is not None:
        project.name = body.name.strip() or project.name
    if body.items is not None:
        project.items = [it.model_dump() for it in body.items]
    if body.scenes is not None:
        project.scenes = [s.model_dump() for s in body.scenes]
    if body.include_shot_audio is not None:
        project.include_shot_audio = body.include_shot_audio
    if body.shot_audio_volume is not None:
        project.shot_audio_volume = body.shot_audio_volume
    if body.bgm_enabled is not None:
        project.bgm_enabled = body.bgm_enabled
    if body.bgm_volume is not None:
        project.bgm_volume = body.bgm_volume
    project.updated_at = beijing_now()
    db.commit()
    db.refresh(project)
    return project_to_out(project, db)


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(ConcatProject, project_id)
    if not project:
        raise HTTPException(404, "脚本不存在")
    clear_project_bgm_selection(project)
    delete_project_preview(project_id)
    db.delete(project)
    db.commit()
    return {"ok": True}


@router.get("/projects/{project_id}/preview", response_model=ProjectPreviewOut)
def get_project_preview(project_id: int, db: Session = Depends(get_db)):
    project = db.get(ConcatProject, project_id)
    if not project:
        raise HTTPException(404, "脚本不存在")
    if not project.items:
        return ProjectPreviewOut(status="empty", error="请先添加分镜")

    fingerprint = compute_preview_fingerprint(db, project)
    if is_preview_current(project_id, fingerprint):
        return ProjectPreviewOut(**preview_status(project_id, fingerprint))

    if not is_preview_building(project_id):
        run_in_background(build_project_preview, project_id)

    status = preview_status(project_id, fingerprint)
    if status["status"] == "missing":
        status = {
            **status,
            "status": "building",
            "progress": max(float(status.get("progress", 0)), 0.05),
        }
    return ProjectPreviewOut(**status)


_BGM_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
_BGM_MEDIA = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
}


@router.get("/bgm", response_model=list[BgmTrackOut])
def list_bgm_library(db: Session = Depends(get_db)):
    return list_bgm_tracks(db)


@router.post("/bgm", response_model=BgmTrackOut)
async def upload_bgm_library(file: UploadFile = File(...), db: Session = Depends(get_db)):
    return await create_bgm_track(db, file)


@router.post("/projects/{project_id}/bgm/select", response_model=ProjectOut)
def select_project_bgm(
    project_id: int,
    body: ProjectBgmSelect,
    db: Session = Depends(get_db),
):
    project = db.get(ConcatProject, project_id)
    if not project:
        raise HTTPException(404, "脚本不存在")

    if body.track_id is None:
        clear_project_bgm_selection(project)
    else:
        track = get_bgm_track(db, body.track_id)
        assign_project_bgm(db, project, track)
        project.bgm_enabled = True

    project.updated_at = beijing_now()
    db.commit()
    db.refresh(project)
    return project_to_out(project, db)


@router.post("/projects/{project_id}/bgm", response_model=ProjectOut)
async def upload_project_bgm(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    project = db.get(ConcatProject, project_id)
    if not project:
        raise HTTPException(404, "脚本不存在")

    track = await create_bgm_track(db, file)
    assign_project_bgm(db, project, track)
    project.bgm_enabled = True
    project.updated_at = beijing_now()
    db.commit()
    db.refresh(project)
    return project_to_out(project, db)


@router.delete("/projects/{project_id}/bgm", response_model=ProjectOut)
def delete_project_bgm(project_id: int, db: Session = Depends(get_db)):
    project = db.get(ConcatProject, project_id)
    if not project:
        raise HTTPException(404, "脚本不存在")
    clear_project_bgm_selection(project)
    project.updated_at = beijing_now()
    db.commit()
    db.refresh(project)
    return project_to_out(project, db)


@router.post("/exports", response_model=ExportOut)
def create_export(body: ExportCreate, db: Session = Depends(get_db)):
    if len(body.items) < 1:
        raise HTTPException(400, "至少需要一个镜头")

    project = db.get(ConcatProject, body.project_id)
    if not project:
        raise HTTPException(404, "脚本不存在")

    shot_ids = [item.shot_id for item in body.items]
    transitions = [item.transition for item in body.items[1:]]

    shots = db.query(Shot).filter(Shot.id.in_(shot_ids)).all()
    if len(shots) != len(shot_ids):
        raise HTTPException(400, "部分镜头不存在")

    product_id = body.product_id
    if product_id is None and shots:
        product_id = shots[0].product_id
    if product_id is not None and not db.get(Product, product_id):
        raise HTTPException(404, "产品不存在")

    job = ExportJob(
        name=body.name.strip(),
        project_id=body.project_id,
        product_id=product_id,
        shot_ids_json=json.dumps(shot_ids),
        transitions_json=json.dumps(transitions),
        include_shot_audio=project.include_shot_audio,
        shot_audio_volume=project.shot_audio_volume,
        bgm_enabled=project.bgm_enabled,
        bgm_filename=project.bgm_filename,
        bgm_original_name=project.bgm_original_name,
        bgm_volume=project.bgm_volume,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    run_in_background(process_export_job, job.id)
    return export_to_out(job, db)


@router.get("/exports", response_model=list[ExportOut])
def list_exports(
    project_id: Optional[int] = Query(None),
    product_id: Optional[int] = Query(None),
    tag: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(ExportJob)
    if project_id is not None:
        q = q.filter(ExportJob.project_id == project_id)
    if product_id is not None:
        q = q.filter(ExportJob.product_id == product_id)
    jobs = q.order_by(ExportJob.created_at.desc()).all()
    if tag:
        jobs = [j for j in jobs if tag in j.tags]
    return [export_to_out(j, db) for j in jobs]


@router.get("/exports/{job_id}", response_model=ExportOut)
def get_export(job_id: int, db: Session = Depends(get_db)):
    job = db.get(ExportJob, job_id)
    if not job:
        raise HTTPException(404, "导出任务不存在")
    return export_to_out(job, db)


@router.patch("/exports/{job_id}", response_model=ExportOut)
def update_export(job_id: int, body: ExportUpdate, db: Session = Depends(get_db)):
    job = db.get(ExportJob, job_id)
    if not job:
        raise HTTPException(404, "成品不存在")
    if body.product_id is not None:
        if body.product_id and not db.get(Product, body.product_id):
            raise HTTPException(404, "产品不存在")
        job.product_id = body.product_id
    if body.tags is not None:
        old_tags = list(job.tags)
        job.tags = body.tags
        ensure_tags(db, job.tags)
        on_export_tags_changed(db, old_tags, job)
    db.commit()
    db.refresh(job)
    return export_to_out(job, db)


@router.delete("/exports/{job_id}")
def delete_export(job_id: int, db: Session = Depends(get_db)):
    job = db.get(ExportJob, job_id)
    if not job:
        raise HTTPException(404, "成品不存在")
    work = db.query(Work).filter(Work.export_job_id == job_id).first()
    if work:
        on_work_deleted(db, work)
        db.delete(work)
    on_export_deleted(db, job)
    delete_export_files(job)
    db.delete(job)
    db.commit()
    return {"ok": True}


def export_to_out(job: ExportJob, db: Session) -> ExportOut:
    stream_url = None
    download_url = None
    if job.status == "done" and job.output_path:
        stream_url = f"/api/files/export/{job.id}/stream"
        download_url = f"/api/files/export/{job.id}/download"

    thumb_url = None
    export_thumb = THUMB_DIR / f"export_{job.id}.jpg"
    if export_thumb.exists():
        thumb_url = f"/api/files/export-thumb/{job.id}"
    else:
        try:
            shot_ids = json.loads(job.shot_ids_json)
            if shot_ids:
                shot = db.get(Shot, shot_ids[0])
                if shot and shot.thumb_path:
                    thumb_url = f"/api/files/thumb/{Path(shot.thumb_path).name}"
        except json.JSONDecodeError:
            pass

    work = db.query(Work).filter(Work.export_job_id == job.id).first()
    names = product_name_map(db)

    return ExportOut(
        id=job.id,
        name=job.name,
        project_id=job.project_id,
        product_id=job.product_id,
        product_name=names.get(job.product_id) if job.product_id else None,
        tags=job.tags,
        status=job.status,
        progress=job.progress,
        error=job.error,
        stream_url=stream_url,
        download_url=download_url,
        thumb_url=thumb_url,
        work_id=work.id if work else None,
        work_status=work.status if work else None,
        created_at=job.created_at,
    )


def work_to_out(work: Work, db: Session) -> WorkOut:
    job = db.get(ExportJob, work.export_job_id)
    project = db.get(ConcatProject, work.project_id) if work.project_id else None
    names = product_name_map(db)

    stream_url = None
    download_url = None
    thumb_url = None
    if job and job.status == "done" and job.output_path:
        stream_url = f"/api/files/export/{job.id}/stream"
        download_url = f"/api/files/export/{job.id}/download"
        export_thumb = THUMB_DIR / f"export_{job.id}.jpg"
        if export_thumb.exists():
            thumb_url = f"/api/files/export-thumb/{job.id}"

    return WorkOut(
        id=work.id,
        name=work.name,
        status=work.status,
        project_id=work.project_id,
        project_name=project.name if project else None,
        product_id=work.product_id,
        product_name=names.get(work.product_id) if work.product_id else None,
        tags=work.tags,
        export_job_id=work.export_job_id,
        stream_url=stream_url,
        download_url=download_url,
        thumb_url=thumb_url,
        created_at=work.created_at,
        reviewed_at=work.reviewed_at,
    )


@router.get("/works", response_model=list[WorkOut])
def list_works(
    status: Optional[str] = Query(None),
    product_id: Optional[int] = Query(None),
    tag: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Work)
    if status:
        q = q.filter(Work.status == status)
    if product_id is not None:
        q = q.filter(Work.product_id == product_id)
    works = q.order_by(Work.created_at.desc()).all()
    if tag:
        works = [w for w in works if tag in w.tags]
    return [work_to_out(w, db) for w in works]


@router.post("/exports/{job_id}/publish", response_model=WorkOut)
def publish_export(job_id: int, db: Session = Depends(get_db)):
    job = db.get(ExportJob, job_id)
    if not job:
        raise HTTPException(404, "成品不存在")
    if job.status != "done":
        raise HTTPException(400, "仅已完成的成品可发布为作品")
    existing = db.query(Work).filter(Work.export_job_id == job_id).first()
    now = beijing_now()
    if existing:
        if existing.status == "approved":
            raise HTTPException(400, "该成品已发布")
        existing.status = "approved"
        existing.reviewed_at = now
        db.commit()
        db.refresh(existing)
        return work_to_out(existing, db)

    work = Work(
        name=job.name,
        project_id=job.project_id,
        product_id=job.product_id,
        export_job_id=job.id,
        status="approved",
        reviewed_at=now,
    )
    work.tags = job.tags
    db.add(work)
    db.flush()
    on_work_created(db, work)
    db.commit()
    db.refresh(work)
    return work_to_out(work, db)


@router.patch("/works/{work_id}", response_model=WorkOut)
def update_work(work_id: int, body: WorkUpdate, db: Session = Depends(get_db)):
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(404, "作品不存在")
    old_tags = list(work.tags)
    if body.product_id is not None:
        if body.product_id and not db.get(Product, body.product_id):
            raise HTTPException(404, "产品不存在")
        work.product_id = body.product_id
    if body.tags is not None:
        work.tags = body.tags
        ensure_tags(db, work.tags)
        on_work_tags_changed(db, old_tags, work)
    db.commit()
    db.refresh(work)
    return work_to_out(work, db)


@router.patch("/works/{work_id}/review", response_model=WorkOut)
def review_work(work_id: int, body: WorkReview, db: Session = Depends(get_db)):
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(404, "作品不存在")
    if work.status != "pending":
        raise HTTPException(400, "仅待审核作品可操作")

    work.status = "approved" if body.action == "approve" else "rejected"
    work.reviewed_at = beijing_now()
    db.commit()
    db.refresh(work)
    return work_to_out(work, db)


@router.delete("/works/{work_id}")
def delete_work(work_id: int, db: Session = Depends(get_db)):
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(404, "作品不存在")
    on_work_deleted(db, work)
    db.delete(work)
    db.commit()
    return {"ok": True}


@router.get("/files/proxy/{filename}")
def get_proxy(filename: str):
    path = PROXY_DIR / filename
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type="video/mp4")


@router.get("/files/thumb/{filename}")
def get_thumb(filename: str):
    path = THUMB_DIR / filename
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type="image/jpeg")


@router.get("/files/preview/{project_id}")
def get_project_preview_file(project_id: int, db: Session = Depends(get_db)):
    project = db.get(ConcatProject, project_id)
    if not project:
        raise HTTPException(404)
    path = PREVIEW_DIR / f"project_{project_id}.mp4"
    if not path.is_file():
        raise HTTPException(404)
    fingerprint = compute_preview_fingerprint(db, project)
    if not is_preview_current(project_id, fingerprint):
        raise HTTPException(404)
    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Cache-Control": "private, no-cache"},
    )


@router.get("/files/clip/{shot_id}")
def get_clip(shot_id: int, db: Session = Depends(get_db)):
    shot = db.get(Shot, shot_id)
    if not shot or not shot.clip_path:
        raise HTTPException(404)
    path = resolve_data_path(shot.clip_path, DATA_DIR)
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Cache-Control": "private, no-cache"},
    )


@router.get("/files/bgm/{project_id}")
def get_project_bgm(project_id: int, db: Session = Depends(get_db)):
    project = db.get(ConcatProject, project_id)
    if not project or not project.bgm_filename:
        raise HTTPException(404)
    path = BGM_DIR / project.bgm_filename
    if not path.exists():
        raise HTTPException(404)
    ext = path.suffix.lower()
    media_type = _BGM_MEDIA.get(ext, "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.get("/files/export-thumb/{job_id}")
def get_export_thumb(job_id: int):
    path = THUMB_DIR / f"export_{job_id}.jpg"
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type="image/jpeg")


@router.get("/files/export/{job_id}/stream")
def stream_export(job_id: int, db: Session = Depends(get_db)):
    job = db.get(ExportJob, job_id)
    if not job or job.status != "done" or not job.output_path:
        raise HTTPException(404)
    path = resolve_data_path(job.output_path, DATA_DIR)
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Content-Disposition": "inline"},
    )


@router.get("/files/export/{job_id}/download")
def download_export(job_id: int, db: Session = Depends(get_db)):
    job = db.get(ExportJob, job_id)
    if not job or job.status != "done" or not job.output_path:
        raise HTTPException(404)
    path = resolve_data_path(job.output_path, DATA_DIR)
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type="video/mp4", filename=f"{job.name}.mp4")


@router.get("/files/export/{job_id}")
def get_export_file_legacy(job_id: int, db: Session = Depends(get_db)):
    return stream_export(job_id, db)
