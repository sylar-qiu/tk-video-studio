from __future__ import annotations

import json
from datetime import datetime

from time_utils import beijing_now

from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _parse_tags(raw: str) -> list[str]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []


def _dump_tags(value: list[str]) -> str:
    return json.dumps(value, ensure_ascii=False)


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True,
    )
    name: Mapped[str] = mapped_column(String(256))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)

    parent: Mapped[Optional["ProductCategory"]] = relationship(
        remote_side="ProductCategory.id", back_populates="children",
    )
    children: Mapped[list["ProductCategory"]] = relationship(back_populates="parent")
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256))
    category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True,
    )
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)

    category: Mapped[Optional["ProductCategory"]] = relationship(back_populates="products")

    @property
    def tags(self) -> list[str]:
        return _parse_tags(self.tags_json)

    @tags.setter
    def tags(self, value: list[str]) -> None:
        self.tags_json = _dump_tags(value)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True,
    )
    filename: Mapped[str] = mapped_column(String(512))
    original_name: Mapped[str] = mapped_column(String(512))
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)

    product: Mapped[Optional["Product"]] = relationship()
    shots: Mapped[list["Shot"]] = relationship(back_populates="asset", cascade="all, delete-orphan")

    @property
    def tags(self) -> list[str]:
        return _parse_tags(self.tags_json)

    @tags.setter
    def tags(self, value: list[str]) -> None:
        self.tags_json = _dump_tags(value)


class Shot(Base):
    __tablename__ = "shots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    product_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True,
    )
    name: Mapped[str] = mapped_column(String(256), default="")
    start_ms: Mapped[int] = mapped_column(Integer, default=0)
    end_ms: Mapped[int] = mapped_column(Integer, default=0)
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    thumb_path: Mapped[str] = mapped_column(String(512), default="")
    clip_path: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending, ready, failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)

    asset: Mapped["Asset"] = relationship(back_populates="shots")
    product: Mapped[Optional["Product"]] = relationship()

    @property
    def tags(self) -> list[str]:
        return _parse_tags(self.tags_json)

    @tags.setter
    def tags(self, value: list[str]) -> None:
        self.tags_json = _dump_tags(value)


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("concat_projects.id", ondelete="SET NULL"), nullable=True,
    )
    product_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True,
    )
    name: Mapped[str] = mapped_column(String(256), default="")
    shot_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    transitions_json: Mapped[str] = mapped_column(Text, default="[]")
    output_path: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending, processing, done, failed
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str] = mapped_column(Text, default="")
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    include_shot_audio: Mapped[bool] = mapped_column(Boolean, default=True)
    shot_audio_volume: Mapped[float] = mapped_column(Float, default=1.0)
    bgm_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    bgm_filename: Mapped[str] = mapped_column(String(512), default="")
    bgm_original_name: Mapped[str] = mapped_column(String(512), default="")
    bgm_volume: Mapped[float] = mapped_column(Float, default=0.35)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)

    project: Mapped[Optional["ConcatProject"]] = relationship(back_populates="exports")
    product: Mapped[Optional["Product"]] = relationship()
    work: Mapped[Optional["Work"]] = relationship(back_populates="export_job", uselist=False)

    @property
    def tags(self) -> list[str]:
        return _parse_tags(self.tags_json)

    @tags.setter
    def tags(self, value: list[str]) -> None:
        self.tags_json = _dump_tags(value)


class Work(Base):
    __tablename__ = "works"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("concat_projects.id", ondelete="SET NULL"), nullable=True,
    )
    product_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True,
    )
    export_job_id: Mapped[int] = mapped_column(
        ForeignKey("export_jobs.id", ondelete="CASCADE"), unique=True, nullable=False,
    )
    name: Mapped[str] = mapped_column(String(256), default="")
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending, approved, rejected
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    project: Mapped[Optional["ConcatProject"]] = relationship(back_populates="works")
    product: Mapped[Optional["Product"]] = relationship()
    export_job: Mapped["ExportJob"] = relationship(back_populates="work")

    @property
    def tags(self) -> list[str]:
        return _parse_tags(self.tags_json)

    @tags.setter
    def tags(self, value: list[str]) -> None:
        self.tags_json = _dump_tags(value)


class ConcatProject(Base):
    __tablename__ = "concat_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), default="")
    items_json: Mapped[str] = mapped_column(Text, default="[]")
    include_shot_audio: Mapped[bool] = mapped_column(Boolean, default=True)
    shot_audio_volume: Mapped[float] = mapped_column(Float, default=1.0)
    bgm_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    bgm_track_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("bgm_tracks.id", ondelete="SET NULL"), nullable=True,
    )
    bgm_filename: Mapped[str] = mapped_column(String(512), default="")
    bgm_original_name: Mapped[str] = mapped_column(String(512), default="")
    bgm_volume: Mapped[float] = mapped_column(Float, default=0.35)
    source: Mapped[str] = mapped_column(String(32), default="manual")
    scenes_json: Mapped[str] = mapped_column(Text, default="[]")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=beijing_now,
        onupdate=beijing_now,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)

    exports: Mapped[list["ExportJob"]] = relationship(back_populates="project")
    works: Mapped[list["Work"]] = relationship(back_populates="project")
    bgm_track: Mapped[Optional["BgmTrack"]] = relationship()

    @property
    def items(self) -> list[dict]:
        try:
            return json.loads(self.items_json)
        except json.JSONDecodeError:
            return []

    @items.setter
    def items(self, value: list[dict]) -> None:
        self.items_json = json.dumps(value, ensure_ascii=False)

    @property
    def scenes(self) -> list[dict]:
        try:
            return json.loads(self.scenes_json)
        except json.JSONDecodeError:
            return []

    @scenes.setter
    def scenes(self, value: list[dict]) -> None:
        self.scenes_json = json.dumps(value, ensure_ascii=False)


class BgmTrack(Base):
    __tablename__ = "bgm_tracks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(512), default="")
    original_name: Mapped[str] = mapped_column(String(512), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("product_id", "name", name="uq_tag_product_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(256), index=True)
    count_assets: Mapped[int] = mapped_column(Integer, default=0)
    count_shots: Mapped[int] = mapped_column(Integer, default=0)
    count_exports: Mapped[int] = mapped_column(Integer, default=0)
    count_works: Mapped[int] = mapped_column(Integer, default=0)
    count_products: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=beijing_now)


class ShotNameStat(Base):
    __tablename__ = "shot_name_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    count_videos: Mapped[int] = mapped_column(Integer, default=0)
