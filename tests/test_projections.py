import numpy as np
import pytest
from scipy.spatial.distance import pdist

from ndstudio.projections import methods


def test_orthogonal_matrix_selects_axes():
    matrix, mean = methods.orthogonal_matrix(6, (1, 3, 5))
    assert matrix.shape == (3, 6)
    assert np.array_equal(mean, np.zeros(6))
    point = np.array([10, 20, 30, 40, 50, 60], dtype=float)
    projected = matrix @ point
    assert np.array_equal(projected, [20, 40, 60])


def test_orthogonal_matrix_rejects_duplicate_axes():
    with pytest.raises(ValueError):
        methods.orthogonal_matrix(6, (0, 0, 1))


def test_pca_matrix_recovers_a_planted_3d_subspace():
    rng = np.random.default_rng(0)
    base = rng.normal(size=(200, 3))
    padded = np.hstack([base, np.zeros((200, 5))])
    rotation, _ = np.linalg.qr(rng.normal(size=(8, 8)))
    embedded = padded @ rotation.T

    matrix, mean = methods.pca_matrix(embedded)
    projected = (embedded - mean) @ matrix.T

    base_centered = base - base.mean(axis=0)
    assert np.allclose(pdist(projected), pdist(base_centered), atol=1e-6)


def test_jl_matrix_orthonormal_rows_when_requested():
    matrix, _ = methods.jl_matrix(9, seed=0, orthonormalize=True)
    gram = matrix @ matrix.T
    assert np.allclose(gram, np.eye(3), atol=1e-8)


def test_custom_matrix_valid_and_invalid():
    matrix, mean = methods.custom_matrix("[[1,0,0,0],[0,1,0,0],[0,0,1,0]]", 4)
    assert matrix.shape == (3, 4)

    with pytest.raises(ValueError):
        methods.custom_matrix("not json", 4)
    with pytest.raises(ValueError):
        methods.custom_matrix("[[1,0],[0,1]]", 4)  # wrong shape
    with pytest.raises(ValueError):
        methods.custom_matrix("[[1e300,0,0,0],[0,1,0,0],[0,0,1,0]]", 4)  # too large


def test_perspective_project_identity_when_extra_axes_zero():
    points = np.zeros((5, 6))
    points[:, :3] = np.random.default_rng(1).normal(size=(5, 3))
    projected = methods.perspective_project(points, camera_distance=4.0)
    assert np.allclose(projected, points[:, :3])


def test_perspective_project_shrinks_points_with_positive_extra_coords():
    n = 5
    point = np.zeros((1, n))
    point[0, :3] = [1.0, 1.0, 1.0]
    point[0, 3] = 1.0  # positive extra coordinate, camera_distance=4 -> factor 4/3 > 1... 
    projected = methods.perspective_project(point, camera_distance=4.0)
    # a negative extra coordinate should shrink the point (moves away from camera)
    point2 = point.copy()
    point2[0, 3] = -1.0
    projected2 = methods.perspective_project(point2, camera_distance=4.0)
    assert np.all(np.abs(projected2[0]) < np.abs(projected[0]))


def test_stereographic_project_identity_when_pole_coord_zero():
    n = 6
    points = np.zeros((5, n))
    points[:, :3] = np.random.default_rng(2).normal(size=(5, 3))
    projected = methods.stereographic_project(points, pole_axis=-1, radius=1.0)
    assert np.allclose(projected, points[:, :3])
