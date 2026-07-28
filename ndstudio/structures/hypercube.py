"""Hypercube: 2^n vertices at (+-1)^n, edges connect vertices differing in one bit."""
from __future__ import annotations

import numpy as np

from .common import StructureResult, require_dimension, require_float_range


def generate(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension)
    edge_length = require_float_range("edge_length", params.get("edge_length", 2.0), 0.5, 6.0)
    half = edge_length / 2.0

    m = 1 << n
    points = np.empty((m, n), dtype=float)
    for d in range(n):
        bit = ((np.arange(m) >> d) & 1).astype(float)
        points[:, d] = (bit * 2.0 - 1.0) * half

    edges: list[tuple[int, int]] = []
    for i in range(m):
        for b in range(n):
            j = i ^ (1 << b)
            if j > i:
                edges.append((i, j))

    return StructureResult(points=points, edges=edges, meta={"num_vertices": m})
