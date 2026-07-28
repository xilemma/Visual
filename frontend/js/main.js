import { api } from "./api.js";
import { Viewer } from "./viewer.js";
import { buildForm, readForm, RotationPanel } from "./controls.js";

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
  rotationEnabled: document.getElementById("rotation-enabled"),

  analyzeBtn: document.getElementById("analyze-btn"),
  metricsReadout: document.getElementById("metrics-readout"),

  dimensionBadge: document.getElementById("current-dimension"),
  canvas: document.getElementById("viewer-canvas"),
};

const viewer = new Viewer(els.canvas);
const rotationPanel = new RotationPanel(els.rotationControls, (rotations) => viewer.setRotations(rotations));

let structuresSchema = {};
let projectionsSchema = {};
let currentDimension = 6;
let structureInputs = {};
let projectionInputs = {};

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

function rebuildStructureForm() {
  const schema = structuresSchema[els.structureSelect.value];
  structureInputs = buildForm(els.structureParams, schema.params);
}

function rebuildProjectionForm() {
  const method = els.projectionSelect.value;
  const schema = projectionsSchema[method];
  const overrides = {};
  const axisMax = Math.max(0, currentDimension - 1);
  for (const name of ["axis_x", "axis_y", "axis_z", "pole_axis"]) {
    if (schema.params[name]) overrides[name] = { max: axisMax };
  }
  projectionInputs = buildForm(els.projectionParams, schema.params, overrides);
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
  els.rotationEnabled.addEventListener("change", () => viewer.setAnimating(els.rotationEnabled.checked));
  els.analyzeBtn.addEventListener("click", handleAnalyze);

  rebuildStructureForm();
  rebuildProjectionForm();
  rotationPanel.setDimension(currentDimension);
  rotationPanel.addRow();

  await handleGenerate();
}

init().catch((err) => {
  els.structureError.textContent = `Failed to initialize: ${err.message}`;
});
