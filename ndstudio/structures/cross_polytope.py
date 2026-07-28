"""Cross-polytope (orthoplex): 2n vertices at +-e_i, edges connect all non-antipodal pairs."""
from __future__ import annotations

import numpy as np

from .common import StructureResult, require_dimension, require_float_range


def generate(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension)
    radius = require_float_range("radius", params.get("radius", 1.0), 0.1, 10.0)

    m = 2 * n
    points = np.zeros((m, n), dtype=float)
    for i in range(n):
        points[2 * i, i] = radius
        points[2 * i + 1, i] = -radius

    edges: list[tuple[int, int]] = []
    for i in range(m):
        antipode = i ^ 1
        for j in range(i + 1, m):
            if j != antipode:
                edges.append((i, j))

    return StructureResult(points=points, edges=edges, meta={"num_vertices": m})
