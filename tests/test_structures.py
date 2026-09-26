import numpy as np
import pytest
from scipy.spatial.distance import pdist

from ndstudio.structures import (
    clifford_torus,
    cross_polytope,
    hopf_fibration,
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


def test_klein_bottle_shape_and_closed_twisted_u_seam():
    res_u, res_v = 8, 6
    result = klein_bottle.generate(4, {"resolution_u": res_u, "resolution_v": res_v, "scale": 1.0})
    assert result.points.shape == (res_u * res_v, 4)

    # A closed quadrilateral grid has four incident edges at every vertex.
    degree = {}
    for i, j in result.edges:
        degree[i] = degree.get(i, 0) + 1
        degree[j] = degree.get(j, 0) + 1
    assert len(degree) == res_u * res_v
    assert set(degree.values()) == {4}
    assert len(result.edges) == 2 * res_u * res_v

    # The final u-ring joins the first with v reversed, not as an ordinary torus seam.
    edges = {tuple(sorted(edge)) for edge in result.edges}
    expected_seam = set()
    for j in range(res_v):
        expected = tuple(sorted(((res_u - 1) * res_v + j, (-j) % res_v)))
        expected_seam.add(expected)
        assert expected in edges
    first_ring = set(range(res_v))
    last_ring = set(range((res_u - 1) * res_v, res_u * res_v))
    actual_seam = {edge for edge in edges if set(edge) & first_ring and set(edge) & last_ring}
    assert actual_seam == expected_seam

    assert result.meta["closed"] is True
    assert result.meta["twisted_seam"] is True


def _hopf_fiber_slice(result, points_per_fiber, fiber_index):
    base = fiber_index * points_per_fiber
    return result.points[base : base + points_per_fiber]


def test_hopf_fibration_output_dimension_is_4():
    result = hopf_fibration.generate(4, {"num_fibers": 5, "points_per_fiber": 16})
    assert result.points.shape == (5 * 16, 4)


def test_hopf_fibration_points_lie_on_requested_s3_radius():
    result = hopf_fibration.generate(4, {"num_fibers": 10, "points_per_fiber": 20, "radius": 2.5})
    norms = np.linalg.norm(result.points, axis=1)
    assert np.allclose(norms, 2.5, atol=1e-8)


def test_hopf_fibration_every_fiber_has_expected_sample_count():
    num_fibers, points_per_fiber = 7, 24
    result = hopf_fibration.generate(4, {"num_fibers": num_fibers, "points_per_fiber": points_per_fiber})
    assert result.points.shape == (num_fibers * points_per_fiber, 4)
    counts = {}
    for label in result.labels:
        counts[label] = counts.get(label, 0) + 1
    assert set(counts.keys()) == set(range(num_fibers))
    assert all(count == points_per_fiber for count in counts.values())


def test_hopf_fibration_every_fiber_forms_one_closed_loop():
    num_fibers, points_per_fiber = 4, 15
    result = hopf_fibration.generate(4, {"num_fibers": num_fibers, "points_per_fiber": points_per_fiber})
    adjacency: dict[int, list[int]] = {}
    for i, j in result.edges:
        adjacency.setdefault(i, []).append(j)
        adjacency.setdefault(j, []).append(i)

    for f in range(num_fibers):
        base = f * points_per_fiber
        members = set(range(base, base + points_per_fiber))
        # Every vertex in a closed loop has exactly two neighbors, both within the same fiber.
        for v in members:
            assert set(adjacency[v]) <= members
            assert len(adjacency[v]) == 2
        # A single walk from the first vertex should visit every member exactly once before returning.
        visited = [base]
        prev, cur = None, base
        while True:
            nxt = [n for n in adjacency[cur] if n != prev][0]
            if nxt == base:
                break
            visited.append(nxt)
            prev, cur = cur, nxt
        assert set(visited) == members


def test_hopf_fibration_no_edge_connects_different_fibers():
    points_per_fiber = 18
    result = hopf_fibration.generate(4, {"num_fibers": 6, "points_per_fiber": points_per_fiber})
    for i, j in result.edges:
        assert i // points_per_fiber == j // points_per_fiber


def test_hopf_fibration_deterministic_for_same_seed():
    params = {"num_fibers": 8, "points_per_fiber": 20, "fiber_distribution": "random", "seed": 42}
    a = hopf_fibration.generate(4, params)
    b = hopf_fibration.generate(4, params)
    assert np.array_equal(a.points, b.points)


def test_hopf_fibration_different_seeds_change_random_variant():
    base_params = {"num_fibers": 8, "points_per_fiber": 20, "fiber_distribution": "random"}
    a = hopf_fibration.generate(4, {**base_params, "seed": 1})
    b = hopf_fibration.generate(4, {**base_params, "seed": 2})
    assert not np.allclose(a.points, b.points)


def test_hopf_fibration_finite_coordinates_only():
    result = hopf_fibration.generate(4, {"num_fibers": 16, "points_per_fiber": 64})
    assert np.all(np.isfinite(result.points))


def test_hopf_fibration_unknown_distribution_raises():
    with pytest.raises(ValueError):
        hopf_fibration.generate(4, {"fiber_distribution": "spiral"})


def test_hopf_fibration_dimension_out_of_range_raises():
    with pytest.raises(ValueError):
        hopf_fibration.generate(6, {})


def test_hopf_fibration_hopf_map_invariant_constant_along_each_fiber():
    """The Hopf map should collapse every point of a given fiber to the same S^2 point,
    and distinct fibers (sampled apart on S^2) should map to distinguishable points."""
    num_fibers, points_per_fiber = 6, 20
    result = hopf_fibration.generate(
        4, {"num_fibers": num_fibers, "points_per_fiber": points_per_fiber, "radius": 1.0}
    )

    def hopf_map(points: np.ndarray) -> np.ndarray:
        z1 = points[:, 0] + 1j * points[:, 1]
        z2 = points[:, 2] + 1j * points[:, 3]
        cross = z1 * np.conj(z2)
        return np.stack([2 * cross.real, 2 * cross.imag, np.abs(z1) ** 2 - np.abs(z2) ** 2], axis=-1)

    representatives = []
    for f in range(num_fibers):
        fiber_points = _hopf_fiber_slice(result, points_per_fiber, f)
        images = hopf_map(fiber_points)
        assert np.allclose(images, images[0], atol=1e-8)
        representatives.append(images[0])

    distances = pdist(np.array(representatives))
    assert np.min(distances) > 1e-3


def test_hopf_fibration_schema_registered_with_expected_params():
    from ndstudio.structures.registry import structures_schema

    schema = structures_schema()
    assert "hopf_fibration" in schema
    entry = schema["hopf_fibration"]
    assert entry["label"] == "Hopf Fibration"
    assert entry["params"]["dimension"] == {"type": "choice", "default": 4, "options": [4]}
    for name in ("num_fibers", "points_per_fiber", "radius", "fiber_distribution", "seed"):
        assert name in entry["params"]
