"""Clifford torus: the flat torus S^1 x S^1, genuinely embedded (not merely immersed) in R^4.
Unlike an ordinary 3-D donut, each circle gets its own dedicated pair of axes, so there is no
"inner rim squeezed tighter than the outer rim" distortion -- every point on the surface is
equally far from the center."""
from __future__ import annotations

import numpy as np

from .common import StructureResult, grid_mesh_edges, require_float_range, require_int_range


def generate(dimension: int, params: dict) -> StructureResult:
    # Two independent circles, each in its own pair of axes -- inherently a 4-D construct.
    require_int_range("dimension", dimension, 4, 4)
    res_u = require_int_range("resolution_u", params.get("resolution_u", 24), 4, 40)
    res_v = require_int_range("resolution_v", params.get("resolution_v", 24), 4, 40)
    radius = require_float_range("radius", params.get("radius", 1.0), 0.1, 10.0)

    u = np.linspace(0, 2 * np.pi, res_u, endpoint=False)
    v = np.linspace(0, 2 * np.pi, res_v, endpoint=False)
    uu, vv = np.meshgrid(u, v, indexing="ij")

    # Scaling each circle by 1/sqrt(2) keeps every point at distance `radius` from the origin.
    per_circle = radius / np.sqrt(2.0)
    pts = np.stack(
        [per_circle * np.cos(uu), per_circle * np.sin(uu), per_circle * np.cos(vv), per_circle * np.sin(vv)],
        axis=-1,
    ).reshape(-1, 4)

    edges = grid_mesh_edges(res_u, res_v, wrap_u=True, wrap_v=True)
    labels = np.repeat(np.arange(res_u), res_v).tolist()  # color by u-ring, for visual banding

    return StructureResult(
        points=pts,
        edges=edges,
        labels=labels,
        meta={"resolution_u": res_u, "resolution_v": res_v, "radius": radius, "num_points": pts.shape[0]},
    )
