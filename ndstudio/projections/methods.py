"""Reference implementations of every projection method.

These are the ground truth used for unit tests. The interactive frontend
mirrors the *matrix*, *perspective*, and *stereographic* formulas in
JavaScript (frontend/js/mathnd.js) so that rotation animation can run
locally in the browser at 60fps without a network round trip per frame.
Keep the two implementations numerically identical.
"""
from __future__ import annotations

import json

import numpy as np


def orthogonal_matrix(n: int, axes: tuple[int, int, int] = (0, 1, 2)) -> tuple[np.ndarray, np.ndarray]:
    if len(set(axes)) != 3:
        raise ValueError("orthogonal projection requires 3 distinct axes")
    for a in axes:
        if not (0 <= a < n):
            raise ValueError(f"axis {a} out of range for dimension {n}")
    matrix = np.zeros((3, n))
    for row, axis in enumerate(axes):
        matrix[row, axis] = 1.0
    return matrix, np.zeros(n)


def pca_matrix(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mean = points.mean(axis=0)
    centered = points - mean
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    if vt.shape[0] < 3:
        # Degenerate (fewer independent directions than 3): pad with zero rows.
        pad = np.zeros((3 - vt.shape[0], vt.shape[1]))
        vt = np.vstack([vt, pad])
    return vt[:3], mean


def jl_matrix(n: int, seed: int = 0, orthonormalize: bool = True) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    m = rng.normal(size=(3, n)) / np.sqrt(3)
    if orthonormalize:
        q, _ = np.linalg.qr(m.T)
        m = q.T[:3]
    return m, np.zeros(n)


def custom_matrix(matrix_json: str, n: int) -> tuple[np.ndarray, np.ndarray]:
    try:
        parsed = json.loads(matrix_json)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("custom matrix must be valid JSON, e.g. [[1,0,0,...], ...]") from exc

    matrix = np.asarray(parsed, dtype=float)
    if matrix.shape != (3, n):
        raise ValueError(f"custom matrix must have shape (3, {n}); got {matrix.shape}")
    if not np.all(np.isfinite(matrix)):
        raise ValueError("custom matrix must contain only finite numbers")
    if np.max(np.abs(matrix)) > 1e6:
        raise ValueError("custom matrix entries must have magnitude <= 1e6")
    return matrix, np.zeros(n)


def perspective_project(points: np.ndarray, camera_distance: float) -> np.ndarray:
    """Collapse axes n-1..3 one at a time via a perspective divide, keeping axes 0,1,2."""
    n = points.shape[1]
    current = points.astype(float).copy()
    for axis in range(n - 1, 2, -1):
        w = current[:, axis]
        factor = camera_distance / (camera_distance - w)
        current[:, :axis] *= factor[:, None]
    return current[:, :3]


def stereographic_project(points: np.ndarray, pole_axis: int, radius: float) -> np.ndarray:
    """Stereographically collapse `pole_axis`, then truncate any remaining extras to 3D."""
    n = points.shape[1]
    pole = (n - 1) if pole_axis < 0 else pole_axis
    w = points[:, pole]
    denom = radius - w
    keep = [i for i in range(n) if i != pole]
    out = points[:, keep] * radius / denom[:, None]
    if out.shape[1] < 3:
        pad = np.zeros((out.shape[0], 3 - out.shape[1]))
        out = np.hstack([out, pad])
    return out[:, :3]
