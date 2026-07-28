"""Hyperspheres and spherical codes (points constrained to S^(n-1))."""
from __future__ import annotations

import numpy as np

from .common import (
    MAX_ITERATIONS,
    StructureResult,
    get_rng,
    require_dimension,
    require_float_range,
    require_num_points,
)


def _random_sphere_points(n: int, num_points: int, rng: np.random.Generator) -> np.ndarray:
    v = rng.normal(size=(num_points, n))
    norms = np.linalg.norm(v, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return v / norms


def _relax_spherical_code(
    pts: np.ndarray, iters: int, lr: float = 0.12
) -> np.ndarray:
    """Push points apart on the unit sphere via a pairwise inverse-square repulsion."""
    m = pts.shape[0]
    pts = pts.copy()
    for _ in range(iters):
        diff = pts[:, None, :] - pts[None, :, :]  # (m, m, n)
        dist2 = np.sum(diff * diff, axis=-1)
        np.fill_diagonal(dist2, np.inf)
        dist2 = np.clip(dist2, 1e-6, None)
        weight = dist2 ** -1.5
        force = diff * weight[..., None]
        total_force = force.sum(axis=1)  # (m, n)
        pts = pts + (lr / m) * total_force
        norms = np.linalg.norm(pts, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        pts = pts / norms
    return pts


def generate(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension)
    num_points = require_num_points(params.get("num_points", 150), lo=4, hi=500)
    radius = require_float_range("radius", params.get("radius", 1.0), 0.1, 10.0)
    mode = params.get("mode", "spherical_code")
    seed = params.get("seed", 0)

    rng = get_rng(seed)
    pts = _random_sphere_points(n, num_points, rng)

    if mode == "spherical_code":
        iters = min(200, MAX_ITERATIONS)
        pts = _relax_spherical_code(pts, iters)
    elif mode != "random":
        raise ValueError(f"Unknown hypersphere mode: {mode!r}")

    pts = pts * radius

    # Nearest-neighbor skeleton for a light visual "mesh" (cap degree to avoid clutter).
    edges = _nearest_neighbor_edges(pts, k=3)

    return StructureResult(
        points=pts,
        edges=edges,
        meta={"mode": mode, "radius": radius, "num_points": num_points},
    )


def _nearest_neighbor_edges(pts: np.ndarray, k: int) -> list[tuple[int, int]]:
    from scipy.spatial import cKDTree

    tree = cKDTree(pts)
    _, idx = tree.query(pts, k=min(k + 1, len(pts)))
    edges: set[tuple[int, int]] = set()
    for i, neighbors in enumerate(idx):
        for j in np.atleast_1d(neighbors):
            j = int(j)
            if j != i:
                edges.add((min(i, j), max(i, j)))
    return sorted(edges)
