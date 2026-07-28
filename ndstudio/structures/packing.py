"""Layered / nested sphere packings: concentric relaxed spherical-code shells."""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

from .common import (
    StructureResult,
    get_rng,
    require_dimension,
    require_float_range,
    require_int_range,
)
from .hypersphere import _random_sphere_points, _relax_spherical_code


def generate(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension)
    num_shells = require_int_range("num_shells", params.get("num_shells", 3), 1, 8)
    points_per_shell = require_int_range("points_per_shell", params.get("points_per_shell", 40), 4, 200)
    radius_step = require_float_range("radius_step", params.get("radius_step", 1.0), 0.1, 5.0)
    seed = params.get("seed", 0)

    rng = get_rng(seed)
    shells = []
    labels: list[int] = []
    for s in range(num_shells):
        radius = 1.0 + s * radius_step
        raw = _random_sphere_points(n, points_per_shell, rng)
        relaxed = _relax_spherical_code(raw, iters=120) * radius
        shells.append(relaxed)
        labels.extend([s] * points_per_shell)

    points = np.vstack(shells)

    tree = cKDTree(points)
    dists, _ = tree.query(points, k=2)
    packing_radius = float(dists[:, 1].min()) / 2.0

    return StructureResult(
        points=points,
        edges=None,
        labels=labels,
        meta={
            "num_shells": num_shells,
            "points_per_shell": points_per_shell,
            "packing_radius": packing_radius,
        },
    )
