"""Root systems D_n (any n) and E_n (n in {6,7,8}, derived from E_8)."""
from __future__ import annotations

import itertools

import numpy as np
from scipy.linalg import null_space

from .common import StructureResult, require_dimension


def d_n_roots(n: int) -> np.ndarray:
    """D_n root system: all vectors +-e_i +- e_j (i != j). Count = 2n(n-1)."""
    roots = []
    for i, j in itertools.combinations(range(n), 2):
        for si in (1.0, -1.0):
            for sj in (1.0, -1.0):
                v = np.zeros(n)
                v[i] = si
                v[j] = sj
                roots.append(v)
    return np.array(roots)


def e8_roots() -> np.ndarray:
    """E_8 root system: 112 vectors +-e_i+-e_j plus 128 half-integer vectors. Count = 240."""
    roots = []
    for i, j in itertools.combinations(range(8), 2):
        for si in (1.0, -1.0):
            for sj in (1.0, -1.0):
                v = np.zeros(8)
                v[i] = si
                v[j] = sj
                roots.append(v)
    for signs in itertools.product((0.5, -0.5), repeat=8):
        if sum(1 for s in signs if s < 0) % 2 == 0:
            roots.append(np.array(signs))
    return np.array(roots)


def _project_onto_complement(vectors: np.ndarray, constraints: np.ndarray) -> np.ndarray:
    """Orthonormal-basis coordinates of `vectors` within the orthogonal complement of
    the row space of `constraints` (constraints: (k, dim) array)."""
    basis = null_space(constraints).T  # (dim - k, dim), orthonormal rows
    return vectors @ basis.T


def e_n_roots(n: int) -> np.ndarray:
    """E_6, E_7, or E_8 roots, expressed in an orthonormal basis of their own span."""
    roots8 = e8_roots()
    if n == 8:
        return roots8

    if n == 7:
        f = roots8[0]
        mask = np.abs(roots8 @ f) < 1e-8
        sub = roots8[mask]
        return _project_onto_complement(sub, f.reshape(1, -1))

    if n == 6:
        f1 = roots8[0]
        inner = roots8 @ f1
        idx = np.where(np.isclose(inner, -1.0))[0]
        f2 = roots8[idx[0]]
        mask = (np.abs(roots8 @ f1) < 1e-8) & (np.abs(roots8 @ f2) < 1e-8)
        sub = roots8[mask]
        return _project_onto_complement(sub, np.vstack([f1, f2]))

    raise ValueError("E-series root systems are only defined here for n in {6, 7, 8}")


def _nearest_neighbor_edges(pts: np.ndarray, k: int = 2) -> list[tuple[int, int]]:
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


def generate_d(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension)
    pts = d_n_roots(n)
    edges = _nearest_neighbor_edges(pts, k=2)
    return StructureResult(points=pts, edges=edges, meta={"family": "D", "num_roots": len(pts)})


def generate_e(dimension: int, params: dict) -> StructureResult:
    n = require_dimension(dimension, lo=6, hi=8)
    if n not in (6, 7, 8):
        raise ValueError("E-series root systems require dimension 6, 7, or 8")
    pts = e_n_roots(n)
    edges = _nearest_neighbor_edges(pts, k=2)
    return StructureResult(points=pts, edges=edges, meta={"family": "E", "num_roots": len(pts)})
