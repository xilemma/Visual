import numpy as np
import pytest
from scipy.spatial.distance import pdist

from ndstudio.structures import (
    clifford_torus,
    cross_polytope,
    hypercube,
    klein_bottle,
    packing,
    random_cloud,
    root_systems,
    simplex,
    voronoi,
)
from ndstudio.structures.hypersphere import generate as hypersphere_generate


def test_hypersphere_random_on_sphere():
    result = hypersphere_generate(5, {"num_points": 40, "radius": 2.0, "mode": "random", "seed": 1})
    norms = np.linalg.norm(result.points, axis=1)
    assert result.points.shape == (40, 5)
    assert np.allclose(norms, 2.0, atol=1e-8)


def test_hypersphere_spherical_code_still_on_sphere_and_spread_out():
    result = hypersphere_generate(4, {"num_points": 30, "radius": 1.0, "mode": "spherical_code", "seed": 2})
    norms = np.linalg.norm(result.points, axis=1)
    assert np.allclose(norms, 1.0, atol=1e-6)
    assert result.edges is not None and len(result.edges) > 0


def test_hypercube_counts_and_edges():
    n = 5
    result = hypercube.generate(n, {"edge_length": 2.0})
    assert result.points.shape == (2**n, n)
    assert np.allclose(np.abs(result.points), 1.0)
    assert len(result.edges) == n * 2 ** (n - 1)
    # every vertex has degree n
    degree = {}
    for i, j in result.edges:
        degree[i] = degree.get(i, 0) + 1
        degree[j] = degree.get(j, 0) + 1
    assert all(d == n for d in degree.values())


def test_cross_polytope_counts_and_edges():
    n = 6
    result = cross_polytope.generate(n, {"radius": 1.0})
    assert result.points.shape == (2 * n, n)
    assert len(result.edges) == 2 * n * (n - 1)
    norms = np.linalg.norm(result.points, axis=1)
    assert np.allclose(norms, 1.0)


def test_d_n_root_count_and_norms():
    n = 7
    roots = root_systems.d_n_roots(n)
    assert roots.shape == (2 * n * (n - 1), n)
    assert np.allclose(np.linalg.norm(roots, axis=1) ** 2, 2.0)


@pytest.mark.parametrize("n,expected_count", [(8, 240), (7, 126), (6, 72)])
def test_e_n_root_counts(n, expected_count):
    roots = root_systems.e_n_roots(n)
    assert roots.shape[0] == expected_count
    assert roots.shape[1] == n
    # E-series roots all have squared norm 2 (simply-laced, long roots)
    assert np.allclose(np.linalg.norm(roots, axis=1) ** 2, 2.0, atol=1e-8)


def test_random_cloud_shapes_and_distributions():
    for dist in ("gaussian", "uniform_ball", "uniform_cube"):
        result = random_cloud.generate(6, {"num_points": 50, "distribution": dist, "scale": 2.0, "seed": 3})
        assert result.points.shape == (50, 6)
    if True:
        result = random_cloud.generate(6, {"num_points": 200, "distribution": "uniform_ball", "scale": 3.0, "seed": 4})
        assert np.all(np.linalg.norm(result.points, axis=1) <= 3.0 + 1e-9)


def test_sphere_packing_shape_and_radius():
    result = packing.generate(5, {"num_shells": 2, "points_per_shell": 20, "radius_step": 1.5, "seed": 5})
    assert result.points.shape == (40, 5)
    assert result.meta["packing_radius"] > 0
    assert len(result.labels) == 40


def test_regular_simplex_is_equidistant():
    n = 6
    pts = simplex.regular_simplex(n)
    assert pts.shape == (n + 1, n)
    d = pdist(pts)
    assert np.allclose(d, d[0], atol=1e-8)


def test_voronoi_neighbors_nonempty():
    result = voronoi.generate(5, {"num_points": 40, "center_index": 0, "seed": 6})
    assert result.points.shape == (40, 5)
    assert len(result.edges) > 0
    assert all(i == 0 for i, _ in result.edges)


def test_dimension_out_of_range_raises():
    with pytest.raises(ValueError):
        hypercube.generate(20, {})
    with pytest.raises(ValueError):
        root_systems.generate_e(9, {})


def test_clifford_torus_lies_on_hypersphere():
    result = clifford_torus.generate(4, {"resolution_u": 8, "resolution_v": 6, "radius": 2.0})
    assert result.points.shape == (48, 4)
    norms = np.linalg.norm(result.points, axis=1)
    assert np.allclose(norms, 2.0, atol=1e-8)
    # fully wrapped grid mesh: every vertex has degree 4
    degree = {}
    for i, j in result.edges:
        degree[i] = degree.get(i, 0) + 1
        degree[j] = degree.get(j, 0) + 1
    assert all(d == 4 for d in degree.values())


def test_klein_bottle_shape_and_open_u_seam():
    result = klein_bottle.generate(4, {"resolution_u": 8, "resolution_v": 6, "scale": 1.0})
    assert result.points.shape == (48, 4)
    # u is not wrapped (open seam), v is -- so interior vertices have degree 4, first/last u-ring only 3
    degree = {}
    for i, j in result.edges:
        degree[i] = degree.get(i, 0) + 1
        degree[j] = degree.get(j, 0) + 1
    first_ring_degrees = {degree[i] for i in range(6)}
    assert first_ring_degrees == {3}
