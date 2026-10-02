"""Shared geometry for the dual 600-cell and 120-cell in R^4."""
from __future__ import annotations

from itertools import permutations, product

import numpy as np
from scipy.spatial import ConvexHull

PHI = (1.0 + np.sqrt(5.0)) / 2.0


def _permutation_is_even(permutation: tuple[int, ...]) -> bool:
    inversions = sum(
        permutation[i] > permutation[j]
        for i in range(len(permutation))
        for j in range(i + 1, len(permutation))
    )
    return inversions % 2 == 0


def _sorted_rows(points: np.ndarray) -> np.ndarray:
    """Return a stable lexicographic ordering and normalize signed zero."""
    result = np.asarray(points, dtype=float).copy()
    result[np.abs(result) < 1e-15] = 0.0
    order = np.lexsort(tuple(result[:, axis] for axis in reversed(range(result.shape[1]))))
    return result[order]


def vertices_600_cell() -> np.ndarray:
    """Construct the 120 unit-circumradius vertices of the regular 600-cell."""
    points: list[list[float]] = []

    # Coordinate-axis vertices: all permutations of (0, 0, 0, +/-1).
    for axis in range(4):
        for sign in (-1.0, 1.0):
            point = [0.0] * 4
            point[axis] = sign
            points.append(point)

    # The 16 vertices (plus/minus 1/2, plus/minus 1/2, plus/minus 1/2, plus/minus 1/2).
    points.extend([0.5 * sign for sign in signs] for signs in product((-1.0, 1.0), repeat=4))

    # Only the 12 even position permutations are used here. Taking all 24 is
    # the common construction bug and incorrectly doubles this family.
    base = np.array([PHI / 2.0, 0.5, 1.0 / (2.0 * PHI), 0.0])
    even_permutations = [p for p in permutations(range(4)) if _permutation_is_even(p)]
    assert len(even_permutations) == 12
    for permutation in even_permutations:
        arrangement = base[list(permutation)]
        nonzero = np.flatnonzero(arrangement)
        for signs in product((-1.0, 1.0), repeat=3):
            point = arrangement.copy()
            point[nonzero] *= signs
            points.append(point.tolist())

    vertices = _sorted_rows(np.asarray(points, dtype=float))
    assert vertices.shape == (120, 4)
    assert np.unique(vertices, axis=0).shape[0] == 120
    assert np.allclose(np.linalg.norm(vertices, axis=1), 1.0)
    return vertices


def vertices_120_cell() -> np.ndarray:
    """Construct the unit-circumradius 120-cell as the dual of the 600-cell."""
    source = vertices_600_cell()
    hull = ConvexHull(source)

    # Every boundary cell of the 600-cell is already a tetrahedron, so each
    # four-index simplex yields one dual vertex at its normalized centroid.
    assert hull.simplices.shape == (600, 4)
    centroids = source[hull.simplices].mean(axis=1)
    vertices = centroids / np.linalg.norm(centroids, axis=1, keepdims=True)
    vertices = _sorted_rows(vertices)

    assert vertices.shape == (600, 4)
    assert np.unique(np.round(vertices, decimals=12), axis=0).shape[0] == 600
    assert np.allclose(np.linalg.norm(vertices, axis=1), 1.0)
    return vertices


def nearest_neighbor_edges(
    points: np.ndarray, expected_count: int, expected_length: float
) -> tuple[list[tuple[int, int]], float]:
    """Connect exactly the pairs at the minimum nonzero pairwise distance."""
    first, second = np.triu_indices(points.shape[0], k=1)
    distances = np.linalg.norm(points[first] - points[second], axis=1)
    edge_length = float(np.min(distances))
    mask = np.isclose(distances, edge_length, rtol=1e-6, atol=0.0)
    edges = [(int(i), int(j)) for i, j in zip(first[mask], second[mask], strict=True)]

    assert np.isclose(edge_length, expected_length, rtol=1e-6, atol=0.0)
    assert len(edges) == expected_count
    return edges, edge_length
