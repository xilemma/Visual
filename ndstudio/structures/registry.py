"""Registry of structure generators with UI-facing parameter schemas."""
from __future__ import annotations

from typing import Any, Callable

from . import (
    clifford_torus,
    cross_polytope,
    hypercube,
    hypersphere,
    klein_bottle,
    packing,
    random_cloud,
    root_systems,
    simplex,
    voronoi,
)
from .common import StructureResult

_SEED_PARAM = {"type": "int", "default": 0, "min": 0, "max": 999999}

STRUCTURES: dict[str, dict[str, Any]] = {
    "hypersphere": {
        "label": "Hypersphere / Spherical Code",
        "generator": hypersphere.generate,
        "params": {
            "dimension": {"type": "int", "default": 6, "min": 4, "max": 12},
            "num_points": {"type": "int", "default": 150, "min": 4, "max": 500},
            "radius": {"type": "float", "default": 1.0, "min": 0.1, "max": 10},
            "mode": {"type": "choice", "default": "spherical_code", "options": ["random", "spherical_code"]},
            "seed": _SEED_PARAM,
        },
    },
    "hypercube": {
        "label": "Hypercube",
        "generator": hypercube.generate,
        "params": {
            "dimension": {"type": "int", "default": 5, "min": 4, "max": 12},
            "edge_length": {"type": "float", "default": 2.0, "min": 0.5, "max": 6},
        },
    },
    "cross_polytope": {
        "label": "Cross-Polytope (Orthoplex)",
        "generator": cross_polytope.generate,
        "params": {
            "dimension": {"type": "int", "default": 6, "min": 4, "max": 12},
            "radius": {"type": "float", "default": 1.0, "min": 0.1, "max": 10},
        },
    },
    "root_system_d": {
        "label": "Root System D_n",
        "generator": root_systems.generate_d,
        "params": {
            "dimension": {"type": "int", "default": 6, "min": 4, "max": 12},
        },
    },
    "root_system_e": {
        "label": "Root System E_n",
        "generator": root_systems.generate_e,
        "params": {
            "dimension": {"type": "choice", "default": 8, "options": [6, 7, 8]},
        },
    },
    "random_cloud": {
        "label": "Random Point Cloud",
        "generator": random_cloud.generate,
        "params": {
            "dimension": {"type": "int", "default": 6, "min": 4, "max": 12},
            "num_points": {"type": "int", "default": 300, "min": 4, "max": 2000},
            "distribution": {
                "type": "choice",
                "default": "gaussian",
                "options": ["gaussian", "uniform_ball", "uniform_cube"],
            },
            "scale": {"type": "float", "default": 1.0, "min": 0.1, "max": 10},
            "seed": _SEED_PARAM,
        },
    },
    "sphere_packing": {
        "label": "Layered Sphere Packing",
        "generator": packing.generate,
        "params": {
            "dimension": {"type": "int", "default": 6, "min": 4, "max": 12},
            "num_shells": {"type": "int", "default": 3, "min": 1, "max": 8},
            "points_per_shell": {"type": "int", "default": 40, "min": 4, "max": 200},
            "radius_step": {"type": "float", "default": 1.0, "min": 0.1, "max": 5},
            "seed": _SEED_PARAM,
        },
    },
    "simplex": {
        "label": "Regular Simplex",
        "generator": simplex.generate,
        "params": {
            "dimension": {"type": "int", "default": 6, "min": 4, "max": 12},
        },
    },
    "voronoi_neighborhood": {
        "label": "Voronoi Neighborhood",
        "generator": voronoi.generate,
        "params": {
            "dimension": {"type": "int", "default": 5, "min": 4, "max": 8},
            "num_points": {"type": "int", "default": 60, "min": 10, "max": 150},
            "center_index": {"type": "int", "default": 0, "min": 0, "max": 149},
            "seed": _SEED_PARAM,
        },
    },
    "clifford_torus": {
        "label": "Clifford Torus",
        "generator": clifford_torus.generate,
        "params": {
            "dimension": {"type": "choice", "default": 4, "options": [4]},
            "resolution_u": {"type": "int", "default": 24, "min": 4, "max": 40},
            "resolution_v": {"type": "int", "default": 24, "min": 4, "max": 40},
            "radius": {"type": "float", "default": 1.0, "min": 0.1, "max": 10},
        },
    },
    "klein_bottle": {
        "label": "Klein Bottle",
        "generator": klein_bottle.generate,
        "params": {
            "dimension": {"type": "choice", "default": 4, "options": [4]},
            "resolution_u": {"type": "int", "default": 24, "min": 4, "max": 40},
            "resolution_v": {"type": "int", "default": 24, "min": 4, "max": 40},
            "scale": {"type": "float", "default": 1.0, "min": 0.1, "max": 5},
        },
    },
}


def structures_schema() -> dict[str, Any]:
    """JSON-serializable schema (drops the Python generator callables)."""
    return {
        key: {"label": val["label"], "params": val["params"]}
        for key, val in STRUCTURES.items()
    }


def generate_structure(structure_type: str, dimension: int, params: dict) -> StructureResult:
    entry = STRUCTURES.get(structure_type)
    if entry is None:
        raise KeyError(f"Unknown structure type: {structure_type!r}")
    generator: Callable[[int, dict], StructureResult] = entry["generator"]
    return generator(dimension, params)
