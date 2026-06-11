"""Serve Vite production build from FastAPI (single-port deployment)."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from settings_loader import project_root

FRONTEND_DIST = project_root() / "frontend" / "dist"


def frontend_is_built() -> bool:
    return (FRONTEND_DIST / "index.html").is_file()


def mount_frontend(app: FastAPI) -> None:
    if not frontend_is_built():
        return

    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    async def spa_index():
        return FileResponse(FRONTEND_DIST / "index.html")

    @app.get("/favicon.svg", include_in_schema=False)
    async def spa_favicon():
        path = FRONTEND_DIST / "favicon.svg"
        if path.is_file():
            return FileResponse(path)
        raise HTTPException(404)

    @app.get("/icons.svg", include_in_schema=False)
    async def spa_icons():
        path = FRONTEND_DIST / "icons.svg"
        if path.is_file():
            return FileResponse(path)
        raise HTTPException(404)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path in ("docs", "redoc", "openapi.json"):
            raise HTTPException(404)
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
