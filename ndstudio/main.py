"""FastAPI application: mounts the API and serves the static frontend."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope

from .api import router as api_router

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"


class NoCacheStaticFiles(StaticFiles):
    """Forces browsers to revalidate every request instead of silently
    reusing a stale cached JS/CSS file (no Cache-Control means browsers may
    apply heuristic caching and never even ask the server for a fresh copy)."""

    async def get_response(self, path: str, scope: Scope) -> Any:
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


app = FastAPI(title="N-D Projection Studio")
app.include_router(api_router)

if FRONTEND_DIR.exists():
    app.mount("/", NoCacheStaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
