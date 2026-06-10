from __future__ import annotations

from sqlalchemy.orm import Session

from models import Asset, ExportJob, Product, Shot, ShotNameStat, Tag, Work

TAG_FIELDS = ("assets", "shots", "exports", "works", "products")


def shot_display_name(name: str) -> str:
    trimmed = (name or "").strip()
    return trimmed if trimmed else "未命名分镜"


def shot_is_library_video(shot: Shot) -> bool:
    return shot.status == "ready" and bool(shot.tags)


def export_counts_as_video(job: ExportJob) -> bool:
    return job.status == "done" and bool(job.tags)


def work_counts_as_video(work: Work) -> bool:
    return bool(work.tags)


def tag_video_count(tag: Tag) -> int:
    return tag.count_assets + tag.count_shots + tag.count_exports + tag.count_works


def _get_or_create_tag(db: Session, name: str) -> Tag:
    tag = db.query(Tag).filter(Tag.name == name).first()
    if not tag:
        tag = Tag(name=name)
        db.add(tag)
        db.flush()
    return tag


def adjust_tag_count(db: Session, tag_name: str, field: str, delta: int) -> None:
    if not tag_name or delta == 0 or field not in TAG_FIELDS:
        return
    tag = _get_or_create_tag(db, tag_name)
    attr = f"count_{field}"
    setattr(tag, attr, max(0, getattr(tag, attr) + delta))


def sync_tag_field(db: Session, old_tags: list[str], new_tags: list[str], field: str) -> None:
    old_set = {t for t in old_tags if t}
    new_set = {t for t in new_tags if t}
    for tag in old_set - new_set:
        adjust_tag_count(db, tag, field, -1)
    for tag in new_set - old_set:
        adjust_tag_count(db, tag, field, 1)


def adjust_shot_name_count(db: Session, display_name: str, delta: int) -> None:
    if not display_name or delta == 0:
        return
    row = db.query(ShotNameStat).filter(ShotNameStat.name == display_name).first()
    if delta > 0:
        if not row:
            row = ShotNameStat(name=display_name, count_videos=0)
            db.add(row)
            db.flush()
        row.count_videos += delta
        return
    if not row:
        return
    row.count_videos = max(0, row.count_videos + delta)
    if row.count_videos == 0:
        db.delete(row)


def _apply_shot_library_delta(db: Session, shot: Shot, delta: int) -> None:
    if delta == 0:
        return
    adjust_shot_name_count(db, shot_display_name(shot.name), delta)
    for tag in shot.tags:
        adjust_tag_count(db, tag, "shots", delta)


def on_asset_created(db: Session, asset: Asset) -> None:
    sync_tag_field(db, [], asset.tags, "assets")


def on_asset_tags_changed(db: Session, old_tags: list[str], new_tags: list[str]) -> None:
    sync_tag_field(db, old_tags, new_tags, "assets")


def on_asset_deleted(db: Session, asset: Asset) -> None:
    sync_tag_field(db, asset.tags, [], "assets")


def on_shot_became_library_video(db: Session, shot: Shot) -> None:
    if shot_is_library_video(shot):
        _apply_shot_library_delta(db, shot, 1)


def on_shot_removed_from_library(db: Session, shot: Shot) -> None:
    if shot_is_library_video(shot):
        _apply_shot_library_delta(db, shot, -1)


def on_shot_updated(
    db: Session,
    *,
    old_name: str,
    old_tags: list[str],
    old_status: str,
    shot: Shot,
) -> None:
    old_display = shot_display_name(old_name)
    new_display = shot_display_name(shot.name)
    old_ready = old_status == "ready" and bool(old_tags)
    new_ready = shot_is_library_video(shot)

    if old_ready:
        for tag in old_tags:
            adjust_tag_count(db, tag, "shots", -1)
        adjust_shot_name_count(db, old_display, -1)

    if new_ready:
        for tag in shot.tags:
            adjust_tag_count(db, tag, "shots", 1)
        adjust_shot_name_count(db, new_display, 1)


def on_shot_deleted(db: Session, shot: Shot) -> None:
    on_shot_removed_from_library(db, shot)


def on_export_became_video(db: Session, job: ExportJob) -> None:
    if export_counts_as_video(job):
        sync_tag_field(db, [], job.tags, "exports")


def on_export_deleted(db: Session, job: ExportJob) -> None:
    if export_counts_as_video(job):
        sync_tag_field(db, job.tags, [], "exports")


def on_export_tags_changed(db: Session, old_tags: list[str], job: ExportJob) -> None:
    if export_counts_as_video(job):
        sync_tag_field(db, old_tags, job.tags, "exports")


def on_work_created(db: Session, work: Work) -> None:
    if work_counts_as_video(work):
        sync_tag_field(db, [], work.tags, "works")


def on_work_deleted(db: Session, work: Work) -> None:
    if work_counts_as_video(work):
        sync_tag_field(db, work.tags, [], "works")


def on_work_tags_changed(db: Session, old_tags: list[str], work: Work) -> None:
    if work_counts_as_video(work):
        sync_tag_field(db, old_tags, work.tags, "works")


def on_product_created(db: Session, product: Product) -> None:
    sync_tag_field(db, [], product.tags, "products")


def on_product_tags_changed(db: Session, old_tags: list[str], new_tags: list[str]) -> None:
    sync_tag_field(db, old_tags, new_tags, "products")


def on_product_deleted(db: Session, product: Product) -> None:
    sync_tag_field(db, product.tags, [], "products")


def tag_counts_dict(tag: Tag) -> dict[str, int]:
    return {
        "assets": tag.count_assets,
        "shots": tag.count_shots,
        "exports": tag.count_exports,
        "works": tag.count_works,
        "products": tag.count_products,
    }


def rebuild_all_stats(db: Session) -> None:
    """One-time rebuild from existing resources."""
    for tag in db.query(Tag).all():
        tag.count_assets = 0
        tag.count_shots = 0
        tag.count_exports = 0
        tag.count_works = 0
        tag.count_products = 0

    db.query(ShotNameStat).delete()

    for asset in db.query(Asset).all():
        on_asset_created(db, asset)

    for shot in db.query(Shot).all():
        if shot_is_library_video(shot):
            on_shot_became_library_video(db, shot)

    for job in db.query(ExportJob).all():
        if export_counts_as_video(job):
            on_export_became_video(db, job)

    for work in db.query(Work).all():
        on_work_created(db, work)

    for product in db.query(Product).all():
        on_product_created(db, product)

    db.commit()
