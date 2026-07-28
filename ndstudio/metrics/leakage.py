"""Leakage metrics: containment, neighborhood inversion, projected overlap,
rank-order distortion, and adjacency preservation between an N-D point set
and its 3D projection.
"""
from __future__ import annotations

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree
from scipy.spatial.distance import pdist
from scipy.stats import kendalltau, spearmanr

MAX_EXACT_POINTS_FOR_PAIRS = 300
MAX_SAMPLED_PAIRS = 20000


def _pairwise_distance_sample(
    points_nd: np.ndarray, points_3d: np.ndarray, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray]:
    n = points_nd.shape[0]
    if n <= MAX_EXACT_POINTS_FOR_PAIRS:
        return pdist(points_nd), pdist(points_3d)

    num_pairs = min(MAX_SAMPLED_PAIRS, n * (n - 1) // 2)
    i = rng.integers(0, n, size=num_pairs * 3)
    j = rng.integers(0, n, size=num_pairs * 3)
    mask = i != j
    i, j = i[mask][:num_pairs], j[mask][:num_pairs]
    d_nd = np.linalg.norm(points_nd[i] - points_nd[j], axis=1)
    d_3d = np.linalg.norm(points_3d[i] - points_3d[j], axis=1)
    return d_nd, d_3d


def containment_metrics(points_nd: np.ndarray, points_3d: np.ndarray, percentile: float = 50.0) -> dict:
    """Fraction of points that appear to 'leak' out of (or into) a centroid-radius
    container once projected — the "interior balls leaking outside the packing" test.
    """
    n = points_nd.shape[0]

    centroid_nd = points_nd.mean(axis=0)
    dist_nd = np.linalg.norm(points_nd - centroid_nd, axis=1)
    threshold_nd = np.percentile(dist_nd, percentile)
    contained_nd = dist_nd <= threshold_nd

    centroid_3d = points_3d.mean(axis=0)
    dist_3d = np.linalg.norm(points_3d - centroid_3d, axis=1)
    threshold_3d = np.percentile(dist_3d, percentile)
    contained_3d = dist_3d <= threshold_3d

    leaked_out = contained_nd & ~contained_3d
    leaked_in = (~contained_nd) & contained_3d

    return {
        "percentile": percentile,
        "threshold_nd": float(threshold_nd),
        "threshold_3d": float(threshold_3d),
        "leaked_out_count": int(leaked_out.sum()),
        "leaked_out_fraction": float(leaked_out.sum() / n),
        "leaked_in_count": int(leaked_in.sum()),
        "leaked_in_fraction": float(leaked_in.sum() / n),
    }


def neighborhood_inversion_metrics(points_nd: np.ndarray, points_3d: np.ndarray, k: int = 10) -> dict:
    """How much a point's nearest-neighbor set changes under projection, plus a
    'hard inversion' count: original nearest neighbors that become among the
    farthest points (bottom decile of distance) after projection.
    """
    n = points_nd.shape[0]
    k = max(1, min(k, n - 1))

    tree_nd = cKDTree(points_nd)
    tree_3d = cKDTree(points_3d)
    _, idx_nd = tree_nd.query(points_nd, k=k + 1)
    _, idx_3d = tree_3d.query(points_3d, k=k + 1)

    jaccards = []
    hard_inversions = 0
    far_cutoff = max(1, int(0.1 * (n - 1)))

    for i in range(n):
        neighbors_nd = [int(x) for x in idx_nd[i] if x != i][:k]
        neighbors_3d = [int(x) for x in idx_3d[i] if x != i][:k]
        set_nd, set_3d = set(neighbors_nd), set(neighbors_3d)
        union = set_nd | set_3d
        jaccards.append(len(set_nd & set_3d) / len(union) if union else 1.0)

        if neighbors_nd:
            nearest = neighbors_nd[0]
            d3 = np.linalg.norm(points_3d - points_3d[i], axis=1)
            rank_from_far = int(np.sum(d3 > d3[nearest]))  # points farther than `nearest` in 3D
            if rank_from_far < far_cutoff:
                hard_inversions += 1

    mean_jaccard = float(np.mean(jaccards))
    return {
        "k": k,
        "mean_jaccard_overlap": mean_jaccard,
        "inversion_rate": 1.0 - mean_jaccard,
        "hard_inversion_count": int(hard_inversions),
        "hard_inversion_fraction": float(hard_inversions / n),
    }


def projected_overlap_metrics(
    points_nd: np.ndarray,
    points_3d: np.ndarray,
    packing_radius: float | None,
    rng: np.random.Generator,
) -> dict:
    """Pairs of points that were well-separated (non-overlapping spheres) in N-D
    but whose projected images overlap in 3D, after accounting for the overall
    contraction/expansion scale of the projection.
    """
    d_nd, d_3d = _pairwise_distance_sample(points_nd, points_3d, rng)

    if packing_radius is None:
        tree = cKDTree(points_nd)
        dists, _ = tree.query(points_nd, k=min(2, points_nd.shape[0]))
        packing_radius = float(dists[:, -1].min()) / 2.0 if dists.shape[1] > 1 else 0.0

    valid = d_nd > 1e-12
    scale = float(np.median(d_3d[valid] / d_nd[valid])) if np.any(valid) else 1.0

    non_overlapping_nd = d_nd >= 2 * packing_radius
    overlapping_3d = d_3d < (2 * packing_radius * scale)
    overlap_mask = non_overlapping_nd & overlapping_3d
    denom = int(non_overlapping_nd.sum())

    return {
        "packing_radius": packing_radius,
        "scale_factor": scale,
        "sampled_pairs": int(len(d_nd)),
        "non_overlapping_pairs_nd": denom,
        "newly_overlapping_pairs_3d": int(overlap_mask.sum()),
        "overlap_fraction": float(overlap_mask.sum() / denom) if denom else 0.0,
    }


def rank_distortion_metrics(points_nd: np.ndarray, points_3d: np.ndarray, rng: np.random.Generator) -> dict:
    """Spearman/Kendall rank correlation between N-D and 3D pairwise distances."""
    d_nd, d_3d = _pairwise_distance_sample(points_nd, points_3d, rng)
    if len(d_nd) < 2 or np.allclose(d_nd, d_nd[0]) or np.allclose(d_3d, d_3d[0]):
        return {"spearman_r": 1.0, "kendall_tau": 1.0, "discordant_fraction": 0.0, "sampled_pairs": int(len(d_nd))}

    spearman_r, _ = spearmanr(d_nd, d_3d)
    tau, _ = kendalltau(d_nd, d_3d)
    spearman_r = float(spearman_r) if np.isfinite(spearman_r) else 1.0
    tau = float(tau) if np.isfinite(tau) else 1.0
    return {
        "spearman_r": spearman_r,
        "kendall_tau": tau,
        "discordant_fraction": float((1 - tau) / 2),
        "sampled_pairs": int(len(d_nd)),
    }


def _knn_edges(points: np.ndarray, k: int) -> set[tuple[int, int]]:
    tree = cKDTree(points)
    _, idx = tree.query(points, k=k + 1)
    edges: set[tuple[int, int]] = set()
    for i, row in enumerate(idx):
        for j in row:
            j = int(j)
            if j != i:
                edges.add((min(i, j), max(i, j)))
    return edges


def _component_count(n: int, edges: set[tuple[int, int]]) -> int:
    if not edges:
        return n
    rows = [e[0] for e in edges] + [e[1] for e in edges]
    cols = [e[1] for e in edges] + [e[0] for e in edges]
    data = np.ones(len(rows))
    graph = coo_matrix((data, (rows, cols)), shape=(n, n))
    n_components, _ = connected_components(graph, directed=False)
    return int(n_components)


def adjacency_preservation_metrics(points_nd: np.ndarray, points_3d: np.ndarray, k: int = 6) -> dict:
    """Jaccard overlap of k-NN adjacency graphs, plus connected-component counts,
    as a coarse topological/adjacency preservation score.
    """
    n = points_nd.shape[0]
    k = max(1, min(k, n - 1))

    edges_nd = _knn_edges(points_nd, k)
    edges_3d = _knn_edges(points_3d, k)
    union = edges_nd | edges_3d
    jaccard = len(edges_nd & edges_3d) / len(union) if union else 1.0

    return {
        "k": k,
        "edge_jaccard": float(jaccard),
        "components_nd": _component_count(n, edges_nd),
        "components_3d": _component_count(n, edges_3d),
    }


def compute_leakage_metrics(points_nd: np.ndarray, points_3d: np.ndarray, options: dict | None = None) -> dict:
    options = options or {}
    points_nd = np.asarray(points_nd, dtype=float)
    points_3d = np.asarray(points_3d, dtype=float)

    if points_nd.shape[0] != points_3d.shape[0]:
        raise ValueError("points_nd and points_3d must have the same number of points")
    if points_nd.shape[0] < 4:
        raise ValueError("at least 4 points are required to compute leakage metrics")

    n_original = points_nd.shape[0]
    cap = int(options.get("max_points", 400))
    seed = int(options.get("seed", 0))
    rng = np.random.default_rng(seed)

    if n_original > cap:
        sample_idx = np.sort(rng.choice(n_original, size=cap, replace=False))
        points_nd_s, points_3d_s = points_nd[sample_idx], points_3d[sample_idx]
        sampled = True
    else:
        points_nd_s, points_3d_s = points_nd, points_3d
        sampled = False

    percentile = float(options.get("containment_percentile", 50.0))
    k_neighbors = int(options.get("k_neighbors", 10))
    packing_radius = options.get("packing_radius")

    return {
        "sample_info": {
            "original_count": n_original,
            "sample_size": points_nd_s.shape[0],
            "sampled": sampled,
        },
        "containment": containment_metrics(points_nd_s, points_3d_s, percentile),
        "neighborhood_inversion": neighborhood_inversion_metrics(points_nd_s, points_3d_s, k_neighbors),
        "projected_overlap": projected_overlap_metrics(points_nd_s, points_3d_s, packing_radius, rng),
        "rank_distortion": rank_distortion_metrics(points_nd_s, points_3d_s, rng),
        "adjacency_preservation": adjacency_preservation_metrics(points_nd_s, points_3d_s, min(k_neighbors, 6)),
    }
