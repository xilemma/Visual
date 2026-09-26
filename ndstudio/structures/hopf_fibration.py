"""Hopf fibration: a finite family of representative fibers of the Hopf map S^3 -> S^2,
each fiber a closed circle in R^4. Distinct fibers never intersect but are topologically
linked (linking number 1) -- stereographic projection into 3-D preserves that linking, so
distinct fibers appear as genuinely interlocked loops rather than merely nearby circles.

S^3 is represented as (z1, z2) in C^2 with |z1|^2 + |z2|^2 = 1, written as the real 4-vector
(Re z1, Im z1, Re z2, Im z2). The fiber through a base point is the circle traced by
multiplying both coordinates by the same phase: {(e^{i*theta} z1, e^{i*theta} z2) : theta in
[0, 2*pi)}.

Simplification used here (mathematically equivalent to picking arbitrary base points
directly on S^3): sample `num_fibers` points on the base S^2 and lift each to a single
representative point on S^3 via the standard Hopf section, then sweep the common phase to
draw its fiber. Writing a base-sphere point in spherical coordinates as
(cos(theta) = z-coordinate, phi = atan2(y, x)), the section is:

    z1_0 = cos(theta / 2)                     (real)
    z2_0 = sin(theta / 2) * exp(i * phi)

Applying the Hopf map p(z1, z2) = (2*Re(z1 * conj(z2)), 2*Im(z1 * conj(z2)), |z1|^2 - |z2|^2)
to (z1_0, z2_0) recovers a point on S^2 that depends only on (theta, phi) -- not on the swept
phase -- so distinct base points give distinct, disjoint fibers, and every point on a given
fiber shares the same Hopf-map image (see tests/test_structures.py).
"""
from __future__ import annotations

import numpy as np

from .common import StructureResult, get_rng, require_float_range, require_int_range
from .hypersphere import _random_sphere_points


def _fibonacci_sphere(num_points: int) -> np.ndarray:
    """Deterministic, seed-free near-even coverage of S^2 via the golden-angle spiral."""
    i = np.arange(num_points, dtype=float)
    golden_angle = np.pi * (3.0 - np.sqrt(5.0))
    z = 1.0 - (2.0 * i + 1.0) / num_points
    r = np.sqrt(np.clip(1.0 - z * z, 0.0, None))
    phi = i * golden_angle
    return np.stack([r * np.cos(phi), r * np.sin(phi), z], axis=-1)


def _fiber_ring_edges(num_fibers: int, points_per_fiber: int) -> list[tuple[int, int]]:
    """Each fiber's samples form their own closed ring; no edge ever crosses fibers."""
    edges: list[tuple[int, int]] = []
    for f in range(num_fibers):
        base = f * points_per_fiber
        for k in range(points_per_fiber):
            a, b = base + k, base + (k + 1) % points_per_fiber
            edges.append((min(a, b), max(a, b)))
    return edges


def generate(dimension: int, params: dict) -> StructureResult:
    # The fibration lives on S^3 subset R^4 -- not meaningful at any other ambient dimension.
    require_int_range("dimension", dimension, 4, 4)
    num_fibers = require_int_range("num_fibers", params.get("num_fibers", 16), 2, 64)
    points_per_fiber = require_int_range("points_per_fiber", params.get("points_per_fiber", 64), 12, 256)
    radius = require_float_range("radius", params.get("radius", 1.0), 0.1, 10.0)
    distribution = params.get("fiber_distribution", "uniform")

    if distribution == "uniform":
        base = _fibonacci_sphere(num_fibers)
    elif distribution == "random":
        rng = get_rng(params.get("seed", 0))
        base = _random_sphere_points(3, num_fibers, rng)
    else:
        raise ValueError(f"Unknown fiber_distribution: {distribution!r}")

    theta = np.arccos(np.clip(base[:, 2], -1.0, 1.0))
    phi = np.arctan2(base[:, 1], base[:, 0])
    z1_0 = np.cos(theta / 2.0)  # real
    z2_0 = np.sin(theta / 2.0) * np.exp(1j * phi)

    t = np.linspace(0.0, 2.0 * np.pi, points_per_fiber, endpoint=False)
    phase = np.exp(1j * t)

    z1 = z1_0[:, None] * phase[None, :]  # (num_fibers, points_per_fiber)
    z2 = z2_0[:, None] * phase[None, :]

    pts = radius * np.stack([z1.real, z1.imag, z2.real, z2.imag], axis=-1).reshape(-1, 4)

    edges = _fiber_ring_edges(num_fibers, points_per_fiber)
    labels = np.repeat(np.arange(num_fibers), points_per_fiber).tolist()  # color by fiber

    return StructureResult(
        points=pts,
        edges=edges,
        labels=labels,
        meta={
            "num_fibers": num_fibers,
            "points_per_fiber": points_per_fiber,
            "radius": radius,
            "fiber_distribution": distribution,
            "num_points": pts.shape[0],
        },
    )
