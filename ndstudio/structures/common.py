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
