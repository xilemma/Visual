"""Klein bottle embedded in R^4 without self-intersection. The familiar "figure-8" glass model
only self-intersects because it has been squeezed down into 3 dimensions; giving the tube's
cross-section its own extra pair of axes (twisted by half the tube's own angle, as it travels once
around the loop) removes the self-intersection entirely."""
from __future__ import annotations

import numpy as np

from .common import StructureResult, require_float_range, require_int_range, twisted_grid_mesh_edges


def generate(dimension: int, params: dict) -> StructureResult:
    # Genuinely needs 4 dimensions to embed without self-intersection.
    require_int_range("dimension", dimension, 4, 4)
    res_u = require_int_range("resolution_u", params.get("resolution_u", 24), 4, 40)
    res_v = require_int_range("resolution_v", params.get("resolution_v", 24), 4, 40)
    scale = require_float_range("scale", params.get("scale", 1.0), 0.1, 5.0)

    major, minor = 1.5 * scale, 0.5 * scale
    u = np.linspace(0, 2 * np.pi, res_u, endpoint=False)
    v = np.linspace(0, 2 * np.pi, res_v, endpoint=False)
    uu, vv = np.meshgrid(u, v, indexing="ij")

    ring = major + minor * np.cos(vv)
    x = ring * np.cos(uu)
    y = ring * np.sin(uu)
    z = minor * np.sin(vv) * np.cos(uu / 2)
    w = minor * np.sin(vv) * np.sin(uu / 2)
    pts = np.stack([x, y, z, w], axis=-1).reshape(-1, 4)

    # v closes normally. Across the u boundary, the half-angle reverses (z, w),
    # so the correct Klein identification is (2*pi, v) ~ (0, -v).
    edges = twisted_grid_mesh_edges(res_u, res_v)
    labels = np.repeat(np.arange(res_u), res_v).tolist()  # color by u-ring, for visual banding

    return StructureResult(
        points=pts,
        edges=edges,
        labels=labels,
        meta={
            "resolution_u": res_u,
            "resolution_v": res_v,
            "scale": scale,
            "num_points": pts.shape[0],
            "closed": True,
            "twisted_seam": True,
        },
    )
