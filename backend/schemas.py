from __future__ import annotations

from datetime import datetime
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, Field, PlainSerializer

from time_utils import format_api_datetime

ApiDateTime = Annotated[
    datetime,
    PlainSerializer(format_api_datetime, return_type=str, when_used="json"),
]


# --- Product catalog ---

class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    parent_id: Optional[int] = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


class CategoryOut(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None
    sort_order: int
    path: str
    children: List["CategoryOut"] = []

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    category_id: Optional[int] = None
    tags: List[str] = []


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    category_id: Optional[int] = None
    tags: Optional[List[str]] = None


class ProductStats(BaseModel):
    assets: int = 0
    shots: int = 0
    exports: int = 0
    works: int = 0


class ProductOut(BaseModel):
    id: int
    name: str
    category_id: Optional[int] = None
    category_path: Optional[str] = None
    tags: List[str]
    stats: ProductStats
    created_at: ApiDateTime

    model_config = {"from_attributes": True}


# --- Resources ---

class AssetOut(BaseModel):
    id: int
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    filename: str
    original_name: str
    duration_ms: int
    width: int
    height: int
    file_size: int
    tags: List[str] = []
    created_at: ApiDateTime
    proxy_url: Optional[str] = None
    thumb_url: Optional[str] = None

    model_config = {"from_attributes": True}


class AssetUpdate(BaseModel):
    product_id: Optional[int] = None
    tags: Optional[List[str]] = None


class TagResourceCounts(BaseModel):
    assets: int = 0
    shots: int = 0
    exports: int = 0
    works: int = 0
    products: int = 0


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)


class TagOut(BaseModel):
    name: str
    counts: TagResourceCounts
    videos: int = 0


class TagStatsOut(BaseModel):
    name: str
    counts: TagResourceCounts
    videos: int = 0
    total: int


class ShotNameOut(BaseModel):
    name: str
    video_count: int = 0


class ShotCreate(BaseModel):
    asset_id: int
    name: str = ""
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    tags: List[str] = []
    product_id: Optional[int] = None


class ShotUpdate(BaseModel):
    name: Optional[str] = None
    tags: Optional[List[str]] = None
    product_id: Optional[int] = None


class ShotOut(BaseModel):
    id: int
    asset_id: int
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    name: str
    start_ms: int
    end_ms: int
    tags: List[str]
    thumb_url: Optional[str] = None
    clip_url: Optional[str] = None
    status: str
    duration_ms: int
    clip_duration_ms: Optional[int] = None
    created_at: ApiDateTime
    asset_name: Optional[str] = None

    model_config = {"from_attributes": True}


TransitionType = Literal["cut", "fade"]


class ConcatItem(BaseModel):
    shot_id: int
    transition: TransitionType = "cut"


class ExportCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    items: List[ConcatItem] = Field(min_length=1)
    project_id: int
    product_id: Optional[int] = None


class ExportUpdate(BaseModel):
    product_id: Optional[int] = None
    tags: Optional[List[str]] = None


class ExportOut(BaseModel):
    id: int
    name: str
    project_id: Optional[int] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    tags: List[str] = []
    status: str
    progress: float
    error: str
    stream_url: Optional[str] = None
    download_url: Optional[str] = None
    thumb_url: Optional[str] = None
    work_id: Optional[int] = None
    work_status: Optional[str] = None
    created_at: ApiDateTime

    model_config = {"from_attributes": True}


WorkStatus = Literal["pending", "approved", "rejected"]


class WorkReview(BaseModel):
    action: Literal["approve", "reject"]


class WorkUpdate(BaseModel):
    product_id: Optional[int] = None
    tags: Optional[List[str]] = None


class WorkOut(BaseModel):
    id: int
    name: str
    status: WorkStatus
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    tags: List[str] = []
    export_job_id: int
    stream_url: Optional[str] = None
    download_url: Optional[str] = None
    thumb_url: Optional[str] = None
    created_at: ApiDateTime
    reviewed_at: Optional[ApiDateTime] = None

    model_config = {"from_attributes": True}


class ScriptScene(BaseModel):
    id: str
    name: str
    items: List[ConcatItem] = Field(default_factory=list)


class ProjectCreate(BaseModel):
    name: Optional[str] = None
    source: Literal["manual", "batch"] = "manual"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    items: Optional[List[ConcatItem]] = None
    scenes: Optional[List[ScriptScene]] = None
    include_shot_audio: Optional[bool] = None
    shot_audio_volume: Optional[float] = Field(None, ge=0, le=2)
    bgm_enabled: Optional[bool] = None
    bgm_volume: Optional[float] = Field(None, ge=0, le=2)


class ProjectPreviewOut(BaseModel):
    status: Literal["empty", "missing", "building", "ready", "error"]
    preview_url: Optional[str] = None
    progress: float = 0.0
    error: str = ""
    duration_ms: int = 0


class BgmTrackOut(BaseModel):
    id: int
    original_name: str
    created_at: ApiDateTime

    model_config = {"from_attributes": True}


class ProjectBgmSelect(BaseModel):
    track_id: Optional[int] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    items: List[ConcatItem]
    scenes: List[ScriptScene] = Field(default_factory=list)
    duration_ms: int
    shot_count: int
    include_shot_audio: bool = True
    shot_audio_volume: float = 1.0
    bgm_enabled: bool = False
    bgm_track_id: Optional[int] = None
    bgm_filename: Optional[str] = None
    bgm_original_name: Optional[str] = None
    bgm_volume: float = 0.35
    bgm_url: Optional[str] = None
    source: Literal["manual", "batch"] = "manual"
    updated_at: ApiDateTime
    created_at: ApiDateTime


class SystemInfoOut(BaseModel):
    """Read-only deployment info (from studio.config.json)."""

    config_path: Optional[str] = None
    data_dir: str
    backend_host: str
    backend_port: int
    frontend_host: str
    frontend_port: int
    ffmpeg: Optional[str] = None
    ffprobe: Optional[str] = None
    auth_required: bool = False
    platform: str
    python: str
    ffmpeg_resolved: Optional[str] = None
    ffprobe_resolved: Optional[str] = None
