"""Regular simplex in R^n (n+1 equidistant vertices) via SVD embedding."""
from __future__ import annotations

import numpy as np

from .common import StructureResult, require_dimension


def regular_simplex(n: int) -> np.ndarray:
    m = n + 1
    verts = np.eye(m)
    centroid = verts.mean(axis=0)
    centered = verts - centroid
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    basis = vt[:n]
    return centered @ basis.T


def generate(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension)
    pts = regular_simplex(n)
    m = pts.shape[0]
    edges = [(i, j) for i in range(m) for j in range(i + 1, m)]
    return StructureResult(points=pts, edges=edges, meta={"num_vertices": m})
