"""Shared helpers and result type for structure generators."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Hard server-side caps, enforced regardless of what a client requests.
MAX_DIMENSION = 12
MIN_DIMENSION = 2
MAX_POINTS = 2000
MAX_ITERATIONS = 500


@dataclass
class StructureResult:
    points: np.ndarray
    edges: list[tuple[int, int]] | None = None
    labels: list[int] | None = None
    meta: dict = field(default_factory=dict)


def get_rng(seed: int | None) -> np.random.Generator:
    return np.random.default_rng(int(seed) if seed is not None else 0)


def require_int_range(name: str, value: int, lo: int, hi: int) -> int:
    value = int(value)
    if not (lo <= value <= hi):
        raise ValueError(f"'{name}' must be an integer between {lo} and {hi} (got {value})")
    return value


def require_float_range(name: str, value: float, lo: float, hi: float) -> float:
    value = float(value)
    if not (lo <= value <= hi):
        raise ValueError(f"'{name}' must be a number between {lo} and {hi} (got {value})")
    return value


def require_dimension(value: int, lo: int = 4, hi: int = MAX_DIMENSION) -> int:
    return require_int_range("dimension", value, lo, hi)


def require_num_points(value: int, lo: int = 1, hi: int = MAX_POINTS) -> int:
    return require_int_range("num_points", value, lo, hi)


def grid_mesh_edges(
    res_u: int, res_v: int, wrap_u: bool = True, wrap_v: bool = True
) -> list[tuple[int, int]]:
    """Edges of a res_u x res_v rectangular grid, row-major indexed as i*res_v+j.
    wrap_u/wrap_v connect the last row/column back to the first, closing that axis into a ring."""
    edges: set[tuple[int, int]] = set()

    def idx(i: int, j: int) -> int:
        return i * res_v + j

    for i in range(res_u):
        for j in range(res_v):
            a = idx(i, j)
            if i + 1 < res_u:
                edges.add((a, idx(i + 1, j)))
            elif wrap_u:
                edges.add((min(a, idx(0, j)), max(a, idx(0, j))))
            if j + 1 < res_v:
                edges.add((a, idx(i, j + 1)))
            elif wrap_v:
                edges.add((min(a, idx(i, 0)), max(a, idx(i, 0))))
    return sorted(edges)
