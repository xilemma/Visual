# N-D Projection Studio

A Python/WebGL application for constructing structures in dimensions 4–12
and interactively examining their projections into three dimensions — and
for quantifying exactly how much geometric information gets distorted along
the way.

Backend: FastAPI + NumPy/SciPy generates the N-D geometry and projection
recipes. Frontend: vanilla JS + Three.js (WebGL) renders the live 3D view
and animates rotations entirely in the browser for smooth 60fps interaction.

## Features

**Structures** (dimension 4–12 unless noted)
- Hypersphere / spherical code (random or repulsion-relaxed)
- Hypercube
- Cross-polytope (orthoplex)
- Root system D_n
- Root system E_n (E_6, E_7, E_8 — derived from the E_8 root system)
- Random point cloud (Gaussian / uniform ball / uniform cube)
- Layered / nested sphere packings
- Regular simplex
- Voronoi neighborhood (dimension 4–8, via Delaunay duality)

**Projections**
- Orthogonal (axis-aligned)
- Perspective from N-space
- Stereographic
- PCA
- Random Johnson–Lindenstrauss
- User-defined projection matrix
- Animated rotation in any coordinate plane (combine with any method above)

**Leakage metrics** (the "is this projection lying to you?" panel)
- **Containment** — fraction of points inside a reference container in N-D
  that appear to leak outside it after projection (and vice versa).
- **Neighborhood inversion** — how much a point's nearest-neighbor set
  changes after projection, plus a count of "hard inversions" (a near
  neighbor that becomes one of the farthest points).
- **Projected overlap** — pairs of points that were safely separated
  (non-overlapping spheres) in N-D but appear to overlap after projection.
- **Rank-order distortion** — Spearman/Kendall rank correlation between
  N-D and 3D pairwise distances.
- **Adjacency preservation** — Jaccard overlap of k-NN graphs, plus
  connected-component counts, between N-D and 3D.

## Project layout

```
ndstudio/                 Python backend package
  structures/              generators for each structure type
  projections/             orthogonal / PCA / JL / custom / perspective / stereographic
  metrics/                 the leakage measures
  api.py                   FastAPI routes
  main.py                  app entrypoint, mounts frontend/ as static files
frontend/
  index.html, css/, js/     Three.js viewer + schema-driven control panels
tests/                     pytest suite for structures, projections, metrics, API
run.py                     dev server launcher
```

## Setup

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

## Run

```powershell
.venv\Scripts\python run.py
```

Then open http://127.0.0.1:8000/ in a browser. Three.js is loaded from a
CDN (unpkg) via an import map, so an internet connection is needed the
first time a browser loads the page.

## Test

```powershell
.venv\Scripts\python -m pytest tests -v
```

## How it fits together

1. **Generate**: the backend builds the N-D point set (plus an optional
   edge skeleton for wireframes) for the chosen structure and sends it to
   the browser once.
2. **Project**: the backend returns a projection *recipe* — either a 3×n
   matrix (orthogonal/PCA/JL/custom, plus a mean to subtract first) or a
   small set of parameters for the nonlinear perspective/stereographic
   formulas.
3. **Animate**: the browser applies rotation-in-a-coordinate-plane and the
   projection recipe to every point, every frame, in JavaScript
   (`frontend/js/mathnd.js`) — no network round trip per frame, so rotation
   stays smooth. These formulas are unit-tested against the Python
   reference implementations in `ndstudio/projections/methods.py` to keep
   the two in lockstep.
4. **Analyze**: clicking "Analyze Leakage" sends the *current* rotated N-D
   points and their live 3D projection back to the server, which computes
   the five leakage metrics authoritatively with SciPy.

## Notes & constraints

- Root system E_n is only defined here for n ∈ {6, 7, 8} (derived from the
  240 roots of E_8 via orthogonal-complement projections).
- Voronoi neighborhoods are capped at dimension 8 and ~150 points because
  Delaunay triangulation (via Qhull) becomes unstable/slow at higher
  dimensions and point counts.
- All structure/projection parameters are validated and bounded
  server-side regardless of what the client sends (dimension ≤ 12, point
  counts capped, custom matrices parsed with `json.loads` only — never
  `eval` — and checked for shape/finiteness).
- Leakage metrics are computed on a random subsample (default cap 400
  points) when the point set is larger, for responsiveness; the response
  reports whether subsampling occurred.
