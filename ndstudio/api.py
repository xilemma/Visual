"""API routes for structure generation, projection, and leakage metrics."""
from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException

from .metrics.leakage import compute_leakage_metrics
from .projections.registry import build_projection, projections_schema
from .schemas import (
    GenerateRequest,
    GenerateResponse,
    MetricsRequest,
    MetricsResponse,
    ProjectRequest,
    ProjectResponse,
)
from .structures.registry import generate_structure, structures_schema

router = APIRouter(prefix="/api")


@router.get("/structures")
def list_structures() -> dict:
    return structures_schema()


@router.get("/projections")
def list_projections() -> dict:
    return projections_schema()


@router.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    try:
        result = generate_structure(req.structure_type, req.dimension, req.params)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return GenerateResponse(
        points=result.points.tolist(),
        edges=result.edges,
        labels=result.labels,
        meta=result.meta,
        dimension=result.points.shape[1],
    )


@router.post("/project", response_model=ProjectResponse)
def project(req: ProjectRequest) -> ProjectResponse:
    try:
        recipe = build_projection(req.method, req.dimension, req.points, req.params)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ProjectResponse(**recipe)


@router.post("/metrics", response_model=MetricsResponse)
def metrics(req: MetricsRequest) -> MetricsResponse:
    try:
        result = compute_leakage_metrics(
            np.asarray(req.points_nd, dtype=float),
            np.asarray(req.points_3d, dtype=float),
            req.options,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return MetricsResponse(**result)
