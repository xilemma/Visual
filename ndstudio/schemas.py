"""Pydantic request/response models for the API."""
from __future__ import annotations

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    structure_type: str
    dimension: int = Field(ge=2, le=12)
    params: dict = Field(default_factory=dict)


class GenerateResponse(BaseModel):
    points: list[list[float]]
    edges: list[tuple[int, int]] | None = None
    labels: list[int] | None = None
    meta: dict = Field(default_factory=dict)
    dimension: int


class ProjectRequest(BaseModel):
    method: str
    dimension: int = Field(ge=2, le=12)
    points: list[list[float]] | None = None
    params: dict = Field(default_factory=dict)


class ProjectResponse(BaseModel):
    kind: str
    matrix: list[list[float]] | None = None
    mean: list[float] | None = None
    camera_distance: float | None = None
    pole_axis: int | None = None
    radius: float | None = None


class MetricsRequest(BaseModel):
    points_nd: list[list[float]]
    points_3d: list[list[float]]
    options: dict = Field(default_factory=dict)


class MetricsResponse(BaseModel):
    sample_info: dict
    containment: dict
    neighborhood_inversion: dict
    projected_overlap: dict
    rank_distortion: dict
    adjacency_preservation: dict
