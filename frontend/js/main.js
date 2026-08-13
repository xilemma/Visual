import { api } from "./api.js";
import { Viewer } from "./viewer.js";
import { buildForm, readForm, RotationPanel, PositionPanel } from "./controls.js";
import { initTooltips } from "./tooltip.js";

initTooltips();

const els = {
  structureSelect: document.getElementById("structure-type-select"),
  structureParams: document.getElementById("structure-params"),
  generateBtn: document.getElementById("generate-btn"),
  structureMeta: document.getElementById("structure-meta"),
  structureError: document.getElementById("structure-error"),

  projectionSelect: document.getElementById("projection-method-select"),
  projectionParams: document.getElementById("projection-params"),
  applyProjectionBtn: document.getElementById("apply-projection-btn"),
  projectionError: document.getElementById("projection-error"),

  rotationControls: document.getElementById("rotation-controls"),
  addRotationBtn: document.getElementById("add-rotation-btn"),
  pauseBtn: document.getElementById("pause-btn"),
  resetRotationBtn: document.getElementById("reset-rotation-btn"),

  positionControls: document.getElementById("position-controls"),
  resetPositionBtn: document.getElementById("reset-position-btn"),

  analyzeBtn: document.getElementById("analyze-btn"),
  metricsReadout: document.getElementById("metrics-readout"),

  dimensionBadge: document.getElementById("current-dimension"),
  canvas: document.getElementById("viewer-canvas"),
};

const viewer = new Viewer(els.canvas);
const rotationPanel = new RotationPanel(
  els.rotationControls,
  (rotations) => viewer.setRotations(rotations),
  (id, radians) => viewer.setRotationAngle(id, radians)
);
const positionPanel = new PositionPanel(els.positionControls, (offset) => viewer.setOffset(offset));

let structuresSchema = {};
let projectionsSchema = {};
let currentDimension = 6;
let structureInputs = {};
let projectionInputs = {};
let rotationsPaused = false;

function setPaused(paused) {
  rotationsPaused = paused;
  viewer.setAnimating(!rotationsPaused);
  rotationPanel.setPaused(rotationsPaused);
  els.pauseBtn.textContent = rotationsPaused ? "\u25B6 Resume" : "\u23F8 Pause";
  els.pauseBtn.setAttribute("aria-pressed", String(rotationsPaused));
}

function populateSelect(select, schema) {
  select.innerHTML = "";
  for (const [key, entry] of Object.entries(schema)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = entry.label;
    select.appendChild(opt);
  }
}

function defaultMatrixJson(dimension) {
  const rows = [0, 1, 2].map((r) => {
    const row = new Array(dimension).fill(0);
    row[r] = 1;
    return row;
  });
  return JSON.stringify(rows);
}

const STRUCTURE_FIELD_HELP = {
  dimension:
    "How many coordinates each generated point has. Most structures accept 4-12; Root System E_n is fixed to a choice of 6, 7, or 8.\n\nTakes effect only after Generate succeeds -- the dimension badge, Rotation planes, and Projection axis fields all re-clamp to the server's returned value at that point, not before.",
  num_points:
    "How many points to generate. Larger counts render fine, but the Leakage metrics panel subsamples down to 400 points (by default) for responsiveness when you click Analyze, regardless of this setting.",
  radius:
    "Radius of the sphere/polytope the points are placed on or scaled to. A structure-generation parameter only -- unrelated to the Projection panel's own Radius field used by the Stereographic method.",
  mode: "'spherical_code' relaxes points apart on the sphere via pairwise repulsion for a more even spread; 'random' leaves them at raw random sphere samples.",
  seed: "Seed for the random number generator. The same seed and parameters always reproduce the exact same point cloud -- change it to get a different random layout without changing anything else.",
  edge_length: "Length of each hypercube edge, i.e. the distance between adjacent vertices.",
  distribution:
    "'gaussian' samples an unbounded normal cloud; 'uniform_ball' fills a solid N-D ball; 'uniform_cube' fills a solid N-D cube.",
  scale: "Overall size multiplier applied to the point cloud.",
  num_shells: "Number of concentric spherical shells to layer. Each shell is an independently relaxed spherical code at a different radius.",
  points_per_shell: "How many points to place on each shell (total point count = num_shells x points_per_shell).",
  radius_step: "Radius increment between consecutive shells.",
  center_index:
    "0-based index of the point whose Voronoi neighborhood is extracted. Must be less than num_points -- but this field's own max (149) is NOT automatically narrowed to your chosen num_points, so an index too high for a smaller num_points only fails once you click Generate.",
};

const PROJECTION_FIELD_HELP = {
  axis_x: "Which N-D coordinate axis maps to the viewer's X axis. Range is clamped to the structure's current dimension (0..dimension-1).",
  axis_y: "Which N-D coordinate axis maps to the viewer's Y axis. Range is clamped to the structure's current dimension (0..dimension-1).",
  axis_z: "Which N-D coordinate axis maps to the viewer's Z axis. Range is clamped to the structure's current dimension (0..dimension-1).",
  seed: "Seed for the random projection matrix. Same seed reproduces the same projection; change it to see a different random 3D 'slice' of the structure.",
  orthonormalize:
    "When on, the random projection matrix's rows are orthonormalized (QR decomposition) so it behaves like a rigid, distance-preserving slice rather than an arbitrary linear map.",
  matrix_json:
    "Your own 3xdimension projection matrix as a JSON array of arrays, e.g. [[1,0,0,...],[0,1,0,...],[0,0,1,...]].\n\nAuto-filled with a default identity slice only while this field is empty -- hand-edited content survives repeated Generate clicks, but if the dimension changes afterward the shape may no longer match, which only surfaces as an error when you click Apply Projection.",
  camera_distance:
    "Distance of the virtual camera along each collapsed axis for the perspective divide. Smaller values exaggerate perspective distortion; larger values approach a flat orthogonal look.",
  pole_axis: "Which axis is stereographically collapsed. -1 is a sentinel meaning 'the last axis' (index dimension-1), not a literal negative axis.",
  radius:
    "Radius of the sphere used for the stereographic projection formula. Unrelated to the Structure panel's own Radius field used when generating hyperspheres/cross-polytopes.",
};

function rebuildStructureForm() {
  const schema = structuresSchema[els.structureSelect.value];
  structureInputs = buildForm(els.structureParams, schema.params, {}, STRUCTURE_FIELD_HELP);
}

function rebuildProjectionForm() {
  const method = els.projectionSelect.value;
  const schema = projectionsSchema[method];
  const overrides = {};
  const axisMax = Math.max(0, currentDimension - 1);
  for (const name of ["axis_x", "axis_y", "axis_z", "pole_axis"]) {
    if (schema.params[name]) overrides[name] = { max: axisMax };
  }
  projectionInputs = buildForm(els.projectionParams, schema.params, overrides, PROJECTION_FIELD_HELP);
  if (method === "custom" && projectionInputs.matrix_json && !projectionInputs.matrix_json.value) {
    projectionInputs.matrix_json.value = defaultMatrixJson(currentDimension);
  }
}

function renderMeta(meta) {
  const parts = Object.entries(meta || {}).map(([k, v]) => {
    const val = typeof v === "number" ? Math.round(v * 1000) / 1000 : v;
    return `${k}: ${val}`;
  });
  els.structureMeta.textContent = parts.join("  \u2022  ");
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function renderMetrics(result) {
  const c = result.containment;
  const ni = result.neighborhood_inversion;
  const po = result.projected_overlap;
  const rd = result.rank_distortion;
  const ap = result.adjacency_preservation;
  const si = result.sample_info;

  els.metricsReadout.innerHTML = `
    <div class="metric-group">
      <h3>Containment (leakage)</h3>
      <div>Leaked out of container: <strong>${pct(c.leaked_out_fraction)}</strong> (${c.leaked_out_count} pts)</div>
      <div>Apparent (false) containment: <strong>${pct(c.leaked_in_fraction)}</strong> (${c.leaked_in_count} pts)</div>
    </div>
    <div class="metric-group">
      <h3>Neighborhood inversion</h3>
      <div>k-NN inversion rate: <strong>${pct(ni.inversion_rate)}</strong> (k=${ni.k})</div>
      <div>Hard inversions: <strong>${ni.hard_inversion_count}</strong> (${pct(ni.hard_inversion_fraction)})</div>
    </div>
    <div class="metric-group">
      <h3>Projected overlap</h3>
      <div>Newly-overlapping pairs: <strong>${pct(po.overlap_fraction)}</strong></div>
      <div>Packing radius ${po.packing_radius.toFixed(3)} &middot; scale ${po.scale_factor.toFixed(3)}</div>
    </div>
    <div class="metric-group">
      <h3>Rank-order distortion</h3>
      <div>Spearman r: <strong>${rd.spearman_r.toFixed(3)}</strong></div>
      <div>Discordant pairs: <strong>${pct(rd.discordant_fraction)}</strong></div>
    </div>
    <div class="metric-group">
      <h3>Adjacency preservation</h3>
      <div>k-NN edge Jaccard: <strong>${ap.edge_jaccard.toFixed(3)}</strong> (k=${ap.k})</div>
      <div>Components N-D \u2192 3D: ${ap.components_nd} \u2192 ${ap.components_3d}</div>
    </div>
    ${si.sampled ? `<div class="metric-note">Computed on a random subsample of ${si.sample_size} of ${si.original_count} points.</div>` : ""}
  `;
}

async function handleGenerate() {
  els.structureError.textContent = "";
  try {
    const structureType = els.structureSelect.value;
    const values = readForm(structureInputs);
    const { dimension, ...params } = values;
    const result = await api.generate(structureType, dimension, params);

    currentDimension = result.dimension;
    els.dimensionBadge.textContent = String(currentDimension);
    viewer.setStructure(result.points, result.edges, result.labels);
    renderMeta({ points: result.points.length, ...result.meta });
    rotationPanel.setDimension(currentDimension);
    positionPanel.setDimension(currentDimension);
    rebuildProjectionForm();
    await handleApplyProjection();
  } catch (err) {
    els.structureError.textContent = err.message;
  }
}

async function handleApplyProjection() {
  els.projectionError.textContent = "";
  try {
    const method = els.projectionSelect.value;
    const params = readForm(projectionInputs);
    const recipe = await api.project(method, currentDimension, viewer.basePoints, params);
    viewer.setProjectionRecipe(recipe);
  } catch (err) {
    els.projectionError.textContent = err.message;
  }
}

async function handleAnalyze() {
  els.metricsReadout.innerHTML = "";
  try {
    const { pointsNd, points3d } = viewer.getSnapshotForMetrics();
    if (!pointsNd.length || !points3d.length) {
      throw new Error("Generate a structure and apply a projection first.");
    }
    const result = await api.metrics(pointsNd, points3d, {});
    renderMetrics(result);
  } catch (err) {
    els.metricsReadout.innerHTML = `<div class="error-readout">${err.message}</div>`;
  }
}

async function init() {
  [structuresSchema, projectionsSchema] = await Promise.all([api.getStructures(), api.getProjections()]);

  populateSelect(els.structureSelect, structuresSchema);
  populateSelect(els.projectionSelect, projectionsSchema);

  els.structureSelect.addEventListener("change", rebuildStructureForm);
  els.projectionSelect.addEventListener("change", rebuildProjectionForm);
  els.generateBtn.addEventListener("click", handleGenerate);
  els.applyProjectionBtn.addEventListener("click", handleApplyProjection);
  els.addRotationBtn.addEventListener("click", () => rotationPanel.addRow());
  els.pauseBtn.addEventListener("click", () => setPaused(!rotationsPaused));
  els.resetRotationBtn.addEventListener("click", () => {
    viewer.resetRotations();
    rotationPanel.resetAngleDisplays();
  });
  els.resetPositionBtn.addEventListener("click", () => positionPanel.reset());
  els.analyzeBtn.addEventListener("click", handleAnalyze);

  rebuildStructureForm();
  rebuildProjectionForm();
  rotationPanel.setDimension(currentDimension);
  rotationPanel.addRow();
  positionPanel.setDimension(currentDimension);

  await handleGenerate();
}

init().catch((err) => {
  els.structureError.textContent = `Failed to initialize: ${err.message}`;
});
