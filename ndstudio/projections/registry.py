"""Registry of projection methods with UI-facing parameter schemas."""
from __future__ import annotations

from typing import Any

import numpy as np

from . import methods

PROJECTIONS: dict[str, dict[str, Any]] = {
    "orthogonal": {
        "label": "Orthogonal (axis-aligned)",
        "params": {
            "axis_x": {"type": "int", "default": 0, "min": 0, "max": 11},
            "axis_y": {"type": "int", "default": 1, "min": 0, "max": 11},
            "axis_z": {"type": "int", "default": 2, "min": 0, "max": 11},
        },
    },
    "pca": {"label": "PCA (top 3 principal components)", "params": {}},
    "jl": {
        "label": "Random Johnson\u2013Lindenstrauss",
        "params": {
            "seed": {"type": "int", "default": 0, "min": 0, "max": 9999},
            "orthonormalize": {"type": "bool", "default": True},
        },
    },
    "custom": {
        "label": "User-Defined Matrix",
        "params": {
            "matrix_json": {"type": "text", "default": ""},
        },
    },
    "perspective": {
        "label": "Perspective from N-space",
        "params": {
            "camera_distance": {"type": "float", "default": 4.0, "min": 1.5, "max": 20},
        },
    },
    "stereographic": {
        "label": "Stereographic",
        "params": {
            "pole_axis": {"type": "int", "default": -1, "min": -1, "max": 11},
            "radius": {"type": "float", "default": 1.0, "min": 0.1, "max": 10},
        },
    },
}


def projections_schema() -> dict[str, Any]:
    return {key: {"label": val["label"], "params": val["params"]} for key, val in PROJECTIONS.items()}


def build_projection(method: str, dimension: int, points: list[list[float]] | None, params: dict) -> dict:
    if method not in PROJECTIONS:
        raise KeyError(f"Unknown projection method: {method!r}")

    if method == "orthogonal":
        axes = (
            int(params.get("axis_x", 0)),
            int(params.get("axis_y", 1)),
            int(params.get("axis_z", 2)),
        )
        matrix, mean = methods.orthogonal_matrix(dimension, axes)
        return {"kind": "matrix", "matrix": matrix.tolist(), "mean": mean.tolist()}

    if method == "pca":
        if not points:
            raise ValueError("PCA projection requires the current point set")
        arr = np.asarray(points, dtype=float)
        if arr.shape[1] != dimension:
            raise ValueError(f"points have dimension {arr.shape[1]}, expected {dimension}")
        matrix, mean = methods.pca_matrix(arr)
        return {"kind": "matrix", "matrix": matrix.tolist(), "mean": mean.tolist()}

    if method == "jl":
        seed = int(params.get("seed", 0))
        orthonormalize = bool(params.get("orthonormalize", True))
        matrix, mean = methods.jl_matrix(dimension, seed, orthonormalize)
        return {"kind": "matrix", "matrix": matrix.tolist(), "mean": mean.tolist()}

    if method == "custom":
        matrix_json = params.get("matrix_json", "")
        matrix, mean = methods.custom_matrix(matrix_json, dimension)
        return {"kind": "matrix", "matrix": matrix.tolist(), "mean": mean.tolist()}

    if method == "perspective":
        camera_distance = float(params.get("camera_distance", 4.0))
        if not (1.5 <= camera_distance <= 20):
            raise ValueError("camera_distance must be between 1.5 and 20")
        return {"kind": "perspective", "camera_distance": camera_distance}

    if method == "stereographic":
        pole_axis = int(params.get("pole_axis", -1))
        radius = float(params.get("radius", 1.0))
        if pole_axis != -1 and not (0 <= pole_axis < dimension):
            raise ValueError(f"pole_axis must be -1 or between 0 and {dimension - 1}")
        if not (0.1 <= radius <= 10):
            raise ValueError("radius must be between 0.1 and 10")
        return {"kind": "stereographic", "pole_axis": pole_axis, "radius": radius}

    raise AssertionError("unreachable")
