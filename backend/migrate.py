from __future__ import annotations

from sqlalchemy import inspect, text

from database import Base, SessionLocal, engine
from models import Product, ProductCategory


def _reextract_shots_truncated_video_once() -> None:
    from config import DATA_DIR, RAW_DIR

    marker = DATA_DIR / ".reextract_shots_video_v1"
    if marker.exists():
        return

    from models import Asset, Shot
    from services.ffmpeg import (
        _clip_duration_sec,
        _video_stream_duration_sec,
        extract_shot_clip,
    )

    db = SessionLocal()
    try:
        for shot in db.query(Shot).filter(Shot.status == "ready").all():
            if not shot.clip_path:
                continue
            asset = db.get(Asset, shot.asset_id)
            if not asset:
                continue
            raw_path = RAW_DIR / asset.filename
            clip_path = DATA_DIR / shot.clip_path
            if not raw_path.is_file() or not clip_path.is_file():
                continue
            expected = max(shot.end_ms - shot.start_ms, 0) / 1000.0
            if expected <= 0:
                continue
            video_dur = _video_stream_duration_sec(clip_path)
            if video_dur <= 0 or video_dur >= expected * 0.9:
                continue
            extract_shot_clip(raw_path, clip_path, shot.start_ms, shot.end_ms)
            if _clip_duration_sec(clip_path) < expected * 0.85:
                continue
    finally:
        db.close()

    marker.touch()


def _reextract_shots_missing_audio_once() -> None:
    from config import DATA_DIR, RAW_DIR

    marker = DATA_DIR / ".reextract_shots_audio_v1"
    if marker.exists():
        return

    from models import Asset, Shot
    from services.ffmpeg import _has_audio_stream, extract_shot_clip

    db = SessionLocal()
    try:
        for shot in db.query(Shot).filter(Shot.status == "ready").all():
            if not shot.clip_path:
                continue
            asset = db.get(Asset, shot.asset_id)
            if not asset:
                continue
            raw_path = RAW_DIR / asset.filename
            clip_path = DATA_DIR / shot.clip_path
            if not raw_path.is_file() or not clip_path.is_file():
                continue
            if not _has_audio_stream(raw_path) or _has_audio_stream(clip_path):
                continue
            extract_shot_clip(raw_path, clip_path, shot.start_ms, shot.end_ms)
    finally:
        db.close()

    marker.touch()


def _regenerate_all_thumbnails() -> None:
    from config import DATA_DIR, RAW_DIR, THUMB_DIR
    from models import Asset, ExportJob, Shot
    from services.ffmpeg import asset_thumb_path, make_thumbnail

    db = SessionLocal()
    try:
        for asset in db.query(Asset).all():
            raw = RAW_DIR / asset.filename
            if raw.exists():
                make_thumbnail(raw, asset_thumb_path(asset.id), 0)

        for shot in db.query(Shot).all():
            if not shot.clip_path:
                continue
            clip = DATA_DIR / shot.clip_path
            thumb = THUMB_DIR / f"shot_{shot.id}.jpg"
            if clip.exists():
                make_thumbnail(clip, thumb, 0)

        for job in db.query(ExportJob).all():
            if not job.output_path:
                continue
            output = DATA_DIR / job.output_path
            thumb = THUMB_DIR / f"export_{job.id}.jpg"
            if output.exists():
                make_thumbnail(output, thumb, 0)
    finally:
        db.close()


def _regenerate_all_thumbnails_once() -> None:
    from config import DATA_DIR

    marker = DATA_DIR / ".thumb_spec_v2"
    if marker.exists():
        return
    _regenerate_all_thumbnails()
    marker.touch()


def _add_column_if_missing(conn, table: str, col: str, ddl: str) -> None:
    insp = inspect(engine)
    if table not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns(table)}
    if col not in cols:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


def _seed_catalog(db) -> None:
    if db.query(ProductCategory).count() > 0:
        return

    roots = [
        ("电子产品", [
            "手机通讯",
            "电脑办公",
            "数码配件",
        ]),
        ("家居厨房", [
            "厨房电器",
            "家居用品",
        ]),
        ("服装鞋包", [
            "男装",
            "女装",
            "鞋靴",
        ]),
        ("美妆个护", [
            "护肤",
            "彩妆",
        ]),
        ("运动户外", [
            "健身器材",
            "户外装备",
        ]),
        ("未分类", []),
    ]

    uncategorized_id = None
    for sort_i, (root_name, children) in enumerate(roots):
        root = ProductCategory(name=root_name, parent_id=None, sort_order=sort_i)
        db.add(root)
        db.flush()
        if root_name == "未分类":
            uncategorized_id = root.id
        for sort_j, child_name in enumerate(children):
            db.add(ProductCategory(
                name=child_name, parent_id=root.id, sort_order=sort_j,
            ))

    default_product = Product(name="默认产品", category_id=uncategorized_id)
    db.add(default_product)
    db.commit()


def _migrate_timestamps_to_beijing_once() -> None:
    from config import DATA_DIR

    marker = DATA_DIR / ".timestamps_beijing_v1"
    if marker.exists():
        return

    tables_cols = [
        ("product_categories", "created_at"),
        ("products", "created_at"),
        ("assets", "created_at"),
        ("shots", "created_at"),
        ("export_jobs", "created_at"),
        ("works", ("created_at", "reviewed_at")),
        ("concat_projects", ("created_at", "updated_at")),
    ]
    with engine.begin() as conn:
        for item in tables_cols:
            table = item[0]
            cols = item[1] if isinstance(item[1], tuple) else (item[1],)
            insp = inspect(engine)
            if table not in insp.get_table_names():
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for col in cols:
                if col not in existing:
                    continue
                conn.execute(
                    text(f"UPDATE {table} SET {col} = datetime({col}, '+8 hours') WHERE {col} IS NOT NULL"),
                )

    marker.touch()


def _repair_created_at_from_files_once() -> None:
    """Align created_at with actual file write time (Beijing) after timezone migration drift."""
    from config import DATA_DIR, RAW_DIR
    from models import Asset, Shot
    from time_utils import file_mtime_beijing

    marker = DATA_DIR / ".created_at_file_sync_v1"
    if marker.exists():
        return

    db = SessionLocal()
    try:
        for asset in db.query(Asset).all():
            mtime = file_mtime_beijing(RAW_DIR / asset.filename)
            if mtime is not None:
                asset.created_at = mtime

        for shot in db.query(Shot).all():
            if not shot.clip_path:
                continue
            mtime = file_mtime_beijing(DATA_DIR / shot.clip_path)
            if mtime is not None:
                shot.created_at = mtime

        db.commit()
    finally:
        db.close()

    marker.touch()


def _seed_tag_library_once() -> None:
    from config import DATA_DIR
    from models import Asset, ExportJob, Product, Shot, Tag, Work

    marker = DATA_DIR / ".tag_library_v1"
    if marker.exists():
        return

    db = SessionLocal()
    try:
        names: set[str] = set()
        for model in (Asset, Shot, ExportJob, Work, Product):
            for row in db.query(model).all():
                names.update(t.strip() for t in row.tags if t.strip())
        existing = {t.name for t in db.query(Tag).all()}
        for name in sorted(names):
            if name not in existing:
                db.add(Tag(name=name))
        db.commit()
    finally:
        db.close()

    marker.touch()


def _seed_bgm_library_once() -> None:
    from config import BGM_DIR, DATA_DIR
    from models import BgmTrack, ConcatProject

    marker = DATA_DIR / ".bgm_library_v1"
    if marker.exists():
        return

    db = SessionLocal()
    try:
        filename_to_track: dict[str, BgmTrack] = {}

        for project in db.query(ConcatProject).all():
            if not project.bgm_filename:
                continue
            path = BGM_DIR / project.bgm_filename
            if not path.is_file():
                continue
            track = filename_to_track.get(project.bgm_filename)
            if not track:
                track = BgmTrack(
                    filename=project.bgm_filename,
                    original_name=project.bgm_original_name or project.bgm_filename,
                )
                db.add(track)
                db.flush()
                filename_to_track[project.bgm_filename] = track
            project.bgm_track_id = track.id

        db.commit()
    finally:
        db.close()

    marker.touch()


def run_migrations() -> None:
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        _add_column_if_missing(conn, "export_jobs", "project_id", "project_id INTEGER")
        _add_column_if_missing(conn, "assets", "product_id", "product_id INTEGER")
        _add_column_if_missing(conn, "assets", "tags_json", "tags_json TEXT DEFAULT '[]'")
        _add_column_if_missing(conn, "shots", "product_id", "product_id INTEGER")
        _add_column_if_missing(conn, "export_jobs", "product_id", "product_id INTEGER")
        _add_column_if_missing(conn, "export_jobs", "tags_json", "tags_json TEXT DEFAULT '[]'")
        _add_column_if_missing(conn, "works", "product_id", "product_id INTEGER")
        _add_column_if_missing(conn, "works", "tags_json", "tags_json TEXT DEFAULT '[]'")
        for table in ("concat_projects", "export_jobs"):
            _add_column_if_missing(conn, table, "include_shot_audio", "include_shot_audio INTEGER DEFAULT 1")
            _add_column_if_missing(conn, table, "shot_audio_volume", "shot_audio_volume REAL DEFAULT 1.0")
            _add_column_if_missing(conn, table, "bgm_enabled", "bgm_enabled INTEGER DEFAULT 0")
            _add_column_if_missing(conn, table, "bgm_filename", "bgm_filename TEXT DEFAULT ''")
            _add_column_if_missing(conn, table, "bgm_original_name", "bgm_original_name TEXT DEFAULT ''")
            _add_column_if_missing(conn, table, "bgm_volume", "bgm_volume REAL DEFAULT 0.35")
        _add_column_if_missing(conn, "concat_projects", "bgm_track_id", "bgm_track_id INTEGER")
        _add_column_if_missing(conn, "concat_projects", "source", "source TEXT DEFAULT 'manual'")
        _add_column_if_missing(conn, "concat_projects", "scenes_json", "scenes_json TEXT DEFAULT '[]'")
        for col, typedef in (
            ("count_assets", "count_assets INTEGER DEFAULT 0"),
            ("count_shots", "count_shots INTEGER DEFAULT 0"),
            ("count_exports", "count_exports INTEGER DEFAULT 0"),
            ("count_works", "count_works INTEGER DEFAULT 0"),
            ("count_products", "count_products INTEGER DEFAULT 0"),
        ):
            _add_column_if_missing(conn, "tags", col, typedef)

    db = SessionLocal()
    try:
        _seed_catalog(db)
        default = db.query(Product).filter(Product.name == "默认产品").first()
        if default:
            for table in ("assets", "shots", "export_jobs", "works"):
                with engine.begin() as conn:
                    conn.execute(
                        text(f"UPDATE {table} SET product_id = :pid WHERE product_id IS NULL"),
                        {"pid": default.id},
                    )
        _regenerate_all_thumbnails_once()
        _migrate_timestamps_to_beijing_once()
        _repair_created_at_from_files_once()
        _reextract_shots_missing_audio_once()
        _reextract_shots_truncated_video_once()
        _seed_bgm_library_once()
        _seed_tag_library_once()
        _rebuild_resource_stats_once()
    finally:
        db.close()


def _rebuild_resource_stats_once() -> None:
    from config import DATA_DIR
    from services.resource_stats import rebuild_all_stats

    marker = DATA_DIR / ".resource_stats_v1"
    if marker.exists():
        return

    db = SessionLocal()
    try:
        rebuild_all_stats(db)
    finally:
        db.close()

    marker.touch()
