"""The regular 120-cell, constructed as the geometric dual of the 600-cell."""
from __future__ import annotations

import numpy as np

from ._regular_polytopes_4d import PHI, nearest_neighbor_edges, vertices_120_cell
from .common import StructureResult, require_int_range


def vertices() -> np.ndarray:
    """Re-derive and return the canonical unit-circumradius vertex set."""
    return vertices_120_cell()


def generate(dimension: int, params: dict) -> StructureResult:
    require_int_range("dimension", dimension, 4, 4)
    points = vertices()
    expected_length = 1.0 / (PHI**2 * np.sqrt(2.0))
    edges, edge_length = nearest_neighbor_edges(points, expected_count=1200, expected_length=expected_length)

    return StructureResult(
        points=points,
        edges=edges,
        meta={
            "num_points": points.shape[0],
            "num_edges": len(edges),
            "circumradius": 1.0,
            "edge_length": edge_length,
            "symmetry": "H4",
            "dual": "600-cell",
        },
    )
