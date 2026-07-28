import numpy as np

from ndstudio.metrics.leakage import compute_leakage_metrics


def test_perfect_projection_yields_no_leakage():
    rng = np.random.default_rng(0)
    base = rng.normal(size=(120, 3))
    points_nd = np.hstack([base, np.zeros((120, 4))])  # genuinely 3D, embedded in 7D
    points_3d = base.copy()  # the "projection" that recovers exactly the 3D truth

    result = compute_leakage_metrics(points_nd, points_3d, {"seed": 0})

    assert result["containment"]["leaked_out_fraction"] == 0.0
    assert result["containment"]["leaked_in_fraction"] == 0.0
    assert result["neighborhood_inversion"]["mean_jaccard_overlap"] == 1.0
    assert result["neighborhood_inversion"]["hard_inversion_count"] == 0
    assert result["projected_overlap"]["overlap_fraction"] == 0.0
    assert abs(result["rank_distortion"]["spearman_r"] - 1.0) < 1e-9
    assert result["adjacency_preservation"]["edge_jaccard"] == 1.0
    assert result["adjacency_preservation"]["components_nd"] == result["adjacency_preservation"]["components_3d"]


def test_collapsing_to_a_point_shows_up_as_distortion():
    rng = np.random.default_rng(1)
    points_nd = rng.normal(size=(60, 8))
    points_3d = np.zeros((60, 3)) + rng.normal(scale=1e-6, size=(60, 3))  # everything collapses together

    result = compute_leakage_metrics(points_nd, points_3d, {"seed": 0})

    # collapsing distances to ~0 should show strong rank distortion / low structure preservation
    assert result["rank_distortion"]["spearman_r"] < 0.5
    assert result["adjacency_preservation"]["edge_jaccard"] < 1.0


def test_metrics_returns_all_expected_sections():
    rng = np.random.default_rng(2)
    points_nd = rng.normal(size=(50, 6))
    points_3d = points_nd[:, :3]

    result = compute_leakage_metrics(points_nd, points_3d)

    for key in (
        "sample_info",
        "containment",
        "neighborhood_inversion",
        "projected_overlap",
        "rank_distortion",
        "adjacency_preservation",
    ):
        assert key in result

    assert 0.0 <= result["containment"]["leaked_out_fraction"] <= 1.0
    assert 0.0 <= result["neighborhood_inversion"]["inversion_rate"] <= 1.0
    assert 0.0 <= result["projected_overlap"]["overlap_fraction"] <= 1.0
    assert -1.0 <= result["rank_distortion"]["spearman_r"] <= 1.0
    assert 0.0 <= result["adjacency_preservation"]["edge_jaccard"] <= 1.0


def test_subsampling_kicks_in_above_cap():
    rng = np.random.default_rng(3)
    points_nd = rng.normal(size=(500, 5))
    points_3d = points_nd[:, :3]

    result = compute_leakage_metrics(points_nd, points_3d, {"max_points": 200})

    assert result["sample_info"]["sampled"] is True
    assert result["sample_info"]["sample_size"] == 200
    assert result["sample_info"]["original_count"] == 500
