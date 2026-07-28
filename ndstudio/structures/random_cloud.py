"""Random high-dimensional point clouds."""
from __future__ import annotations

import numpy as np

from .common import (
    StructureResult,
    get_rng,
    require_dimension,
    require_float_range,
    require_num_points,
)

_DISTRIBUTIONS = ("gaussian", "uniform_ball", "uniform_cube")


def generate(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension)
    num_points = require_num_points(params.get("num_points", 300), lo=4, hi=2000)
    scale = require_float_range("scale", params.get("scale", 1.0), 0.1, 10.0)
    distribution = params.get("distribution", "gaussian")
    seed = params.get("seed", 0)

    if distribution not in _DISTRIBUTIONS:
        raise ValueError(f"Unknown distribution: {distribution!r}")

    rng = get_rng(seed)
    if distribution == "gaussian":
        pts = rng.normal(size=(num_points, n)) * scale
    elif distribution == "uniform_cube":
        pts = rng.uniform(-scale, scale, size=(num_points, n))
    else:  # uniform_ball
        v = rng.normal(size=(num_points, n))
        v /= np.linalg.norm(v, axis=1, keepdims=True)
        r = rng.uniform(0.0, 1.0, size=(num_points, 1)) ** (1.0 / n)
        pts = v * r * scale

    return StructureResult(points=pts, edges=None, meta={"distribution": distribution})
