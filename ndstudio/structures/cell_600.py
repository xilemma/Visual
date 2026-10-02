"""The regular 600-cell, one of the six convex regular 4-polytopes."""
from __future__ import annotations

import numpy as np

from ._regular_polytopes_4d import PHI, nearest_neighbor_edges, vertices_600_cell
from .common import StructureResult, require_int_range


def vertices() -> np.ndarray:
    """Return the canonical unit-circumradius vertex set."""
    return vertices_600_cell()


def generate(dimension: int, params: dict) -> StructureResult:
    require_int_range("dimension", dimension, 4, 4)
    points = vertices()
    edges, edge_length = nearest_neighbor_edges(points, expected_count=720, expected_length=1.0 / PHI)

    return StructureResult(
        points=points,
        edges=edges,
        meta={
            "num_points": points.shape[0],
            "num_edges": len(edges),
            "circumradius": 1.0,
            "edge_length": edge_length,
            "symmetry": "H4",
            "dual": "120-cell",
        },
    )
