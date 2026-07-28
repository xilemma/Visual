from fastapi.testclient import TestClient

from ndstudio.main import app

client = TestClient(app)


def test_list_structures_and_projections():
    r = client.get("/api/structures")
    assert r.status_code == 200
    body = r.json()
    assert "hypersphere" in body
    assert "dimension" in body["hypersphere"]["params"]

    r = client.get("/api/projections")
    assert r.status_code == 200
    body = r.json()
    assert "orthogonal" in body and "perspective" in body


def test_generate_hypercube():
    r = client.post("/api/generate", json={"structure_type": "hypercube", "dimension": 4, "params": {}})
    assert r.status_code == 200
    body = r.json()
    assert body["dimension"] == 4
    assert len(body["points"]) == 16
    assert len(body["edges"]) == 32


def test_generate_unknown_structure_returns_404():
    r = client.post("/api/generate", json={"structure_type": "nope", "dimension": 4, "params": {}})
    assert r.status_code == 404


def test_generate_bad_dimension_returns_422():
    r = client.post("/api/generate", json={"structure_type": "root_system_e", "dimension": 9, "params": {}})
    assert r.status_code == 422


def test_project_orthogonal_then_metrics_roundtrip():
    gen = client.post(
        "/api/generate", json={"structure_type": "random_cloud", "dimension": 6, "params": {"num_points": 80, "seed": 1}}
    )
    points = gen.json()["points"]

    proj = client.post(
        "/api/project",
        json={"method": "orthogonal", "dimension": 6, "points": points, "params": {"axis_x": 0, "axis_y": 1, "axis_z": 2}},
    )
    assert proj.status_code == 200
    recipe = proj.json()
    assert recipe["kind"] == "matrix"
    assert len(recipe["matrix"]) == 3

    points_3d = [p[:3] for p in points]
    metrics = client.post("/api/metrics", json={"points_nd": points, "points_3d": points_3d, "options": {}})
    assert metrics.status_code == 200
    body = metrics.json()
    assert "containment" in body
    assert "adjacency_preservation" in body


def test_project_pca_without_points_fails_gracefully():
    r = client.post("/api/project", json={"method": "pca", "dimension": 5, "points": None, "params": {}})
    assert r.status_code == 422


def test_project_custom_matrix():
    matrix_json = "[[1,0,0,0],[0,1,0,0],[0,0,1,0]]"
    r = client.post(
        "/api/project",
        json={"method": "custom", "dimension": 4, "points": None, "params": {"matrix_json": matrix_json}},
    )
    assert r.status_code == 200
    assert r.json()["kind"] == "matrix"


def test_project_perspective_and_stereographic_kinds():
    r = client.post(
        "/api/project",
        json={"method": "perspective", "dimension": 6, "points": None, "params": {"camera_distance": 5.0}},
    )
    assert r.status_code == 200
    assert r.json()["kind"] == "perspective"

    r = client.post(
        "/api/project",
        json={"method": "stereographic", "dimension": 6, "points": None, "params": {"pole_axis": -1, "radius": 1.0}},
    )
    assert r.status_code == 200
    assert r.json()["kind"] == "stereographic"
