# N-D Projection Studio

A Python/WebGL application for constructing structures in dimensions 4–12
and interactively examining their projections into three dimensions — and
for quantifying exactly how much geometric information gets distorted along
the way.

Backend: FastAPI + NumPy/SciPy generates the N-D geometry and projection
recipes. Frontend: vanilla JS + Three.js (WebGL) renders the live 3D view
and applies animated plane rotations and axis scales entirely in the browser
for smooth 60fps interaction.

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
- Clifford torus (a flat torus embedded in 4-D)
- Klein bottle embedded in 4-D, with its wireframe closed across the twisted seam

**Projections**

- Orthogonal (axis-aligned)
- Perspective from N-space
- Stereographic
- PCA
- Random Johnson–Lindenstrauss
- User-defined projection matrix
- Animated rotation in any coordinate plane (combine with any method above)
- Explicit Axis scale transforms for stretching, collapsing, or reflecting one coordinate

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

**Named presets**

- Save and update complete named configurations in browser-local storage.
- Restore structure/projection parameters, ordered transforms and live phases,
  Position, and camera view; preset loads deliberately open paused.
- Rename, duplicate, delete, export, and import individual presets, or export
  all presets as one versioned JSON backup.
- Automatically restore the last valid working session after a refresh without
  silently overwriting a named preset.

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
docs/                      reference docs (see below)
run.py                     dev server launcher
```

New to N-dimensional geometry or this app? Start with
[docs/tutorial.md](docs/tutorial.md) — a beginner-friendly walkthrough that
explains the concepts (dimensions, projections, N-D transforms, position,
leakage metrics) from scratch and guides you through installation and your
first session, no prior background assumed.

See [docs/ui-controls.md](docs/ui-controls.md) for a full reference of every
UI control (structure/projection forms, N-D transforms, position, leakage metrics)
and — importantly — how they affect each other (e.g. what Generate resets
vs. preserves, what Apply Projection vs. Analyze Leakage each operate on,
and a few non-obvious quirks in the current implementation).

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
3. **Transform & position**: the browser applies each configured Plane
   rotation or Axis scale, then an optional N-D translation offset, and then
   the projection recipe to every point on every frame in
   `frontend/js/mathnd.js`. Transform animation can be paused without losing
   the current pose; Angle/Phase readouts update at 10 Hz while playing;
   Reset transforms returns rotations to angle 0 and scales to phase 0
   (factor 1).
4. **Analyze**: clicking "Analyze Leakage" sends the *current* transformed and
   translated N-D points and their live 3D projection back to the server,
   which computes the five leakage metrics authoritatively with SciPy.
5. **Save or share**: named presets are stored under the browser origin using
   `localStorage`; JSON export/import supplies a portable filesystem copy.

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
- Clifford torus and Klein bottle are fixed at ambient dimension 4. The
  Klein bottle wireframe uses `(2π, v) ~ (0, -v)`, so it has no open seam.
- Leakage metrics are computed on a random subsample (default cap 400
  points) when the point set is larger, for responsiveness; the response
  reports whether subsampling occurred.

