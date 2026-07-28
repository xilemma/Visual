"""Voronoi neighborhoods via the Delaunay/Voronoi duality (scipy.spatial.Delaunay)."""
from __future__ import annotations

import numpy as np

from .common import (
    StructureResult,
    get_rng,
    require_dimension,
    require_int_range,
)


def voronoi_neighbors(points: np.ndarray, center_index: int) -> list[int]:
    from scipy.spatial import Delaunay, QhullError

    try:
        tri = Delaunay(points)
    except QhullError as exc:
        raise ValueError(
            "Voronoi/Delaunay computation failed for this point set "
            "(often caused by degenerate/co-spherical points); try fewer points "
            "or a different seed"
        ) from exc

    neighbor_set: set[int] = set()
    for simplex in tri.simplices:
        if center_index in simplex:
            neighbor_set.update(int(v) for v in simplex)
    neighbor_set.discard(center_index)
    return sorted(neighbor_set)


def generate(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension, lo=4, hi=8)
    num_points = require_int_range("num_points", params.get("num_points", 60), 10, 150)
    seed = params.get("seed", 0)
    center_index = require_int_range("center_index", params.get("center_index", 0), 0, num_points - 1)

    rng = get_rng(seed)
    points = rng.normal(size=(num_points, n))

    neighbors = voronoi_neighbors(points, center_index)
    edges = [(center_index, j) for j in neighbors]
    labels = [1 if i == center_index else (2 if i in neighbors else 0) for i in range(num_points)]

    return StructureResult(
        points=points,
        edges=edges,
        labels=labels,
        meta={"center_index": center_index, "num_neighbors": len(neighbors)},
    )
