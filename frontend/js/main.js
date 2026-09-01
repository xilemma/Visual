import { api } from "./api.js";
import { Viewer } from "./viewer.js";
import { buildForm, readForm, writeForm, RotationPanel, PositionPanel } from "./controls.js";
import { initTooltips } from "./tooltip.js";
import {
  PresetStore,
  exportPresetBundle,
  exportPresetDocument,
  parsePresetFile,
  uniquePresetName,
  validateConfiguration,
} from "./presets.js";

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

  presetSelect: document.getElementById("preset-select"),
  presetSaveBtn: document.getElementById("preset-save-btn"),
  presetSaveAsBtn: document.getElementById("preset-save-as-btn"),
  presetMenu: document.getElementById("preset-menu"),
  presetRenameBtn: document.getElementById("preset-rename-btn"),
  presetDuplicateBtn: document.getElementById("preset-duplicate-btn"),
  presetDeleteBtn: document.getElementById("preset-delete-btn"),
  presetExportBtn: document.getElementById("preset-export-btn"),
  presetExportAllBtn: document.getElementById("preset-export-all-btn"),
  presetImportBtn: document.getElementById("preset-import-btn"),
  presetFileInput: document.getElementById("preset-file-input"),
  presetStatus: document.getElementById("preset-status"),
  presetNameDialog: document.getElementById("preset-name-dialog"),
  presetNameTitle: document.getElementById("preset-name-title"),
  presetNameInput: document.getElementById("preset-name-input"),
  presetNameConfirm: document.getElementById("preset-name-confirm"),
  presetConflictDialog: document.getElementById("preset-conflict-dialog"),
  presetConflictMessage: document.getElementById("preset-conflict-message"),
};

const viewer = new Viewer(els.canvas);
const rotationPanel = new RotationPanel(
  els.rotationControls,
  (rotations) => {
    viewer.setRotations(rotations);
    scheduleSessionSave();
  },
  (id, radians) => {
    viewer.setRotationAngle(id, radians);
    scheduleSessionSave();
  }
);
viewer.setTransformStateListener((liveAngles) => {
  rotationPanel.updateLiveAngles(liveAngles);
  scheduleSessionSave();
});
const positionPanel = new PositionPanel(els.positionControls, (offset) => {
  viewer.setOffset(offset);
  scheduleSessionSave();
});
const presetStore = new PresetStore();

let structuresSchema = {};
let projectionsSchema = {};
let currentDimension = 6;
let structureInputs = {};
let projectionInputs = {};
let rotationsPaused = false;
let presets = [];
let activePresetId = null;
let sessionSaveTimer = null;
let suppressSessionSave = true;

function setPaused(paused) {
  rotationsPaused = paused;
  viewer.setAnimating(!rotationsPaused);
  rotationPanel.setPaused(rotationsPaused, rotationsPaused ? viewer.getRotationAngles() : null);
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
    "How many coordinates each generated point has. Most structures accept 4-12; Root System E_n offers 6, 7, or 8; Clifford Torus and Klein Bottle are fixed at 4.\n\nTakes effect only after Generate succeeds -- the dimension badge, N-D transform targets, and Projection axis fields all re-clamp to the server's returned value at that point, not before.",
  num_points:
    "How many points to generate. Larger counts render fine, but the Leakage metrics panel subsamples down to 400 points (by default) for responsiveness when you click Analyze, regardless of this setting.",
  radius:
    "Overall radius used by the selected sphere, polytope, or Clifford torus. A structure-generation parameter only -- unrelated to the Projection panel's Stereographic Radius.",
  mode: "'spherical_code' relaxes points apart on the sphere via pairwise repulsion for a more even spread; 'random' leaves them at raw random sphere samples.",
  seed: "Seed for the random number generator. The same seed and parameters always reproduce the exact same point cloud -- change it to get a different random layout without changing anything else.",
  edge_length: "Length of each hypercube edge, i.e. the distance between adjacent vertices.",
  distribution:
    "'gaussian' samples an unbounded normal cloud; 'uniform_ball' fills a solid N-D ball; 'uniform_cube' fills a solid N-D cube.",
  scale: "Overall size multiplier for the selected structure, including Random Point Cloud and Klein Bottle.",
  num_shells: "Number of concentric spherical shells to layer. Each shell is an independently relaxed spherical code at a different radius.",
  points_per_shell: "How many points to place on each shell (total point count = num_shells x points_per_shell).",
  radius_step: "Radius increment between consecutive shells.",
  center_index:
    "0-based index of the point whose Voronoi neighborhood is extracted. Must be less than num_points -- but this field's own max (149) is NOT automatically narrowed to your chosen num_points, so an index too high for a smaller num_points only fails once you click Generate.",
  resolution_u: "Number of samples around the surface's u direction. Total points equal resolution_u x resolution_v; higher values make a denser wireframe.",
  resolution_v: "Number of samples around the surface's v direction. Total points equal resolution_u x resolution_v; higher values make a denser wireframe.",
};

const PROJECTION_FIELD_HELP = {
  axis_x: "Which N-D coordinate axis maps to the viewer's X axis. Range is clamped to the structure's current dimension (0..dimension-1).",
  axis_y: "Which N-D coordinate axis maps to the viewer's Y axis. Range is clamped to the structure's current dimension (0..dimension-1).",
  axis_z: "Which N-D coordinate axis maps to the viewer's Z axis. Range is clamped to the structure's current dimension (0..dimension-1).",
  seed: "Seed for the random projection matrix. Same seed reproduces the same projection; change it to see a different random 3D 'slice' of the structure.",
  orthonormalize:
    "When on, the random projection matrix's rows are orthonormalized (QR decomposition) so it behaves like a rigid, distance-preserving slice rather than an arbitrary linear map.",
  matrix_json:
    "Your own 3xdimension projection matrix as a JSON array of arrays, e.g. [[1,0,0,...],[0,1,0,...],[0,0,1,...]].\n\nAuto-filled with an identity slice sized to the current dimension whenever this Projection form is rebuilt. Switching methods or clicking Generate discards hand edits.",
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

function setPresetStatus(message, isError = false) {
  els.presetStatus.textContent = message;
  els.presetStatus.classList.toggle("preset-status-error", isError);
  els.presetStatus.title = message;
}

function captureConfiguration() {
  return {
    structure: {
      type: els.structureSelect.value,
      params: readForm(structureInputs),
    },
    projection: {
      method: els.projectionSelect.value,
      params: readForm(projectionInputs),
    },
    transforms: rotationPanel.getState(viewer.getRotationAngles()),
    position: positionPanel.getOffset(),
    view: viewer.getView(),
    paused: rotationsPaused,
  };
}

function refreshPresetSelect() {
  const selectedId = activePresetId;
  els.presetSelect.innerHTML = '<option value="">Current session</option>';
  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    els.presetSelect.appendChild(option);
  }
  els.presetSelect.value = presets.some((preset) => preset.id === selectedId) ? selectedId : "";
}

function writePresets() {
  presetStore.write(presets);
  refreshPresetSelect();
}

function selectedPreset() {
  return presets.find((preset) => preset.id === activePresetId) || null;
}

function updatePresetDirtyIndicator(configuration) {
  const preset = selectedPreset();
  if (!preset) return;
  const option = [...els.presetSelect.options].find((candidate) => candidate.value === preset.id);
  if (!option) return;
  const currentComparable = { ...configuration, paused: false };
  const savedComparable = { ...preset.configuration, paused: false };
  const dirty = JSON.stringify(currentComparable) !== JSON.stringify(savedComparable);
  option.textContent = `${preset.name}${dirty ? " •" : ""}`;
}

function scheduleSessionSave() {
  if (suppressSessionSave || sessionSaveTimer !== null || !viewer.basePoints.length) return;
  sessionSaveTimer = window.setTimeout(() => {
    sessionSaveTimer = null;
    if (suppressSessionSave) return;
    try {
      const configuration = validateConfiguration(captureConfiguration(), structuresSchema, projectionsSchema);
      presetStore.saveSession(configuration, activePresetId);
      updatePresetDirtyIndicator(configuration);
    } catch {
      // Transient form edits (such as an empty number box) are not valid snapshots.
      // Keep the last valid session until the current controls become valid again.
    }
  }, 1000);
}

function askPresetName(title, initialValue, confirmLabel) {
  els.presetNameTitle.textContent = title;
  els.presetNameInput.value = initialValue;
  els.presetNameConfirm.textContent = confirmLabel;
  els.presetNameDialog.returnValue = "";
  els.presetNameDialog.showModal();
  els.presetNameInput.select();
  return new Promise((resolve) => {
    els.presetNameDialog.addEventListener("close", () => {
      const name = els.presetNameInput.value.trim();
      resolve(els.presetNameDialog.returnValue === "confirm" && name ? name : null);
    }, { once: true });
  });
}

function checkedConfiguration() {
  return validateConfiguration(captureConfiguration(), structuresSchema, projectionsSchema);
}

function askImportConflict(name) {
  els.presetConflictMessage.textContent = `A preset named “${name}” already exists.`;
  els.presetConflictDialog.returnValue = "";
  els.presetConflictDialog.showModal();
  return new Promise((resolve) => {
    els.presetConflictDialog.addEventListener("close", () => {
      resolve(els.presetConflictDialog.returnValue || "cancel");
    }, { once: true });
  });
}

async function savePresetAs(initialName = "Untitled preset") {
  const requestedName = await askPresetName("Save preset as", initialName, "Save");
  if (!requestedName) return;
  try {
    const configuration = checkedConfiguration();
    const conflict = presets.find((preset) => preset.name.toLocaleLowerCase() === requestedName.toLocaleLowerCase());
    if (conflict) {
      if (!window.confirm(`Replace the existing preset “${conflict.name}”?`)) return;
      conflict.configuration = configuration;
      conflict.modified = new Date().toISOString();
      activePresetId = conflict.id;
    } else {
      const preset = presetStore.create(requestedName, configuration);
      presets.push(preset);
      activePresetId = preset.id;
    }
    writePresets();
    presetStore.saveSession(configuration, activePresetId);
    setPresetStatus(`Saved “${selectedPreset().name}”`);
  } catch (err) {
    setPresetStatus(err.message, true);
  }
}

async function saveCurrentPreset() {
  const preset = selectedPreset();
  if (!preset) {
    await savePresetAs();
    return;
  }
  try {
    preset.configuration = checkedConfiguration();
    preset.modified = new Date().toISOString();
    writePresets();
    presetStore.saveSession(preset.configuration, activePresetId);
    setPresetStatus(`Saved “${preset.name}”`);
  } catch (err) {
    setPresetStatus(err.message, true);
  }
}

async function renameSelectedPreset() {
  const preset = selectedPreset();
  if (!preset) return setPresetStatus("Select a named preset first.", true);
  const name = await askPresetName("Rename preset", preset.name, "Rename");
  if (!name || name === preset.name) return;
  if (presets.some((other) => other.id !== preset.id && other.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return setPresetStatus(`A preset named “${name}” already exists.`, true);
  }
  preset.name = name;
  preset.modified = new Date().toISOString();
  writePresets();
  setPresetStatus(`Renamed to “${name}”`);
}

async function duplicateSelectedPreset() {
  const preset = selectedPreset();
  if (!preset) return setPresetStatus("Select a named preset first.", true);
  const suggestion = uniquePresetName(`${preset.name} copy`, presets);
  const name = await askPresetName("Duplicate preset", suggestion, "Duplicate");
  if (!name) return;
  if (presets.some((other) => other.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return setPresetStatus(`A preset named “${name}” already exists.`, true);
  }
  const copy = presetStore.create(name, preset.configuration);
  presets.push(copy);
  activePresetId = copy.id;
  writePresets();
  setPresetStatus(`Created “${name}”`);
}

function deleteSelectedPreset() {
  const preset = selectedPreset();
  if (!preset) return setPresetStatus("Select a named preset first.", true);
  if (!window.confirm(`Delete preset “${preset.name}”?`)) return;
  presets = presets.filter((other) => other.id !== preset.id);
  activePresetId = null;
  writePresets();
  scheduleSessionSave();
  setPresetStatus(`Deleted “${preset.name}”`);
}

function safeFilename(name) {
  const slug = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "ndstudio-preset"}.ndstudio.json`;
}

function downloadJson(filename, documentValue) {
  const blob = new Blob([`${JSON.stringify(documentValue, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportSelectedPreset() {
  const preset = selectedPreset();
  if (!preset) return setPresetStatus("Select a named preset first.", true);
  downloadJson(safeFilename(preset.name), exportPresetDocument(preset));
  setPresetStatus(`Exported “${preset.name}”`);
}

function exportAllPresets() {
  if (!presets.length) return setPresetStatus("There are no named presets to export.", true);
  downloadJson("ndstudio-presets.ndstudio.json", exportPresetBundle(presets));
  setPresetStatus(`Exported ${presets.length} preset${presets.length === 1 ? "" : "s"}`);
}

async function importPresetFile(file) {
  const presetsBeforeImport = JSON.parse(JSON.stringify(presets));
  const activeBeforeImport = activePresetId;
  try {
    if (file.size > 1024 * 1024) throw new Error("Preset files must be 1 MB or smaller.");
    const incoming = parsePresetFile(JSON.parse(await file.text()));
    let importedCount = 0;
    for (const rawPreset of incoming) {
      const configuration = validateConfiguration(rawPreset.configuration, structuresSchema, projectionsSchema);
      const rawName = (String(rawPreset.name || "Imported preset").trim() || "Imported preset").slice(0, 80);
      const conflict = presets.find((preset) => preset.name.toLocaleLowerCase() === rawName.toLocaleLowerCase());
      const resolution = conflict ? await askImportConflict(conflict.name) : "copy";
      if (resolution === "cancel") {
        presets = presetsBeforeImport;
        activePresetId = activeBeforeImport;
        refreshPresetSelect();
        setPresetStatus("Import cancelled");
        return;
      }
      if (conflict && resolution === "replace") {
          conflict.configuration = configuration;
          conflict.modified = new Date().toISOString();
          activePresetId = conflict.id;
      } else {
        const name = uniquePresetName(rawName, presets);
        const preset = presetStore.create(name, configuration);
        presets.push(preset);
        activePresetId = preset.id;
      }
      importedCount += 1;
    }
    writePresets();
    setPresetStatus(`Imported ${importedCount} preset${importedCount === 1 ? "" : "s"}`);
  } catch (err) {
    presets = presetsBeforeImport;
    activePresetId = activeBeforeImport;
    refreshPresetSelect();
    setPresetStatus(`Import failed: ${err.message}`, true);
  } finally {
    els.presetFileInput.value = "";
  }
}

async function applyConfiguration(rawConfiguration) {
  const configuration = validateConfiguration(rawConfiguration, structuresSchema, projectionsSchema);
  const structureValues = configuration.structure.params;
  const { dimension, ...structureParams } = structureValues;

  // Preflight both server operations before replacing any visible state.
  const generated = await api.generate(configuration.structure.type, dimension, structureParams);
  const recipe = await api.project(
    configuration.projection.method,
    generated.dimension,
    generated.points,
    configuration.projection.params
  );

  suppressSessionSave = true;
  try {
    setPaused(true);
    els.structureSelect.value = configuration.structure.type;
    rebuildStructureForm();
    writeForm(structureInputs, structureValues);

    currentDimension = generated.dimension;
    els.dimensionBadge.textContent = String(currentDimension);
    viewer.setStructure(generated.points, generated.edges, generated.labels);
    renderMeta({ points: generated.points.length, ...generated.meta });
    rotationPanel.setDimension(currentDimension);
    positionPanel.setDimension(currentDimension);

    els.projectionSelect.value = configuration.projection.method;
    rebuildProjectionForm();
    writeForm(projectionInputs, configuration.projection.params);
    viewer.setProjectionRecipe(recipe);

    rotationPanel.setState(configuration.transforms);
    positionPanel.setOffset(configuration.position);
    viewer.setView(configuration.view);
    els.metricsReadout.innerHTML = "";
  } finally {
    suppressSessionSave = false;
  }
  scheduleSessionSave();
}

async function loadPresetById(id) {
  const previousId = activePresetId;
  const preset = presets.find((candidate) => candidate.id === id);
  if (!preset) {
    activePresetId = null;
    refreshPresetSelect();
    return;
  }
  setPresetStatus(`Loading “${preset.name}”…`);
  try {
    await applyConfiguration(preset.configuration);
    activePresetId = preset.id;
    refreshPresetSelect();
    presetStore.saveSession(captureConfiguration(), activePresetId);
    setPresetStatus(`Loaded “${preset.name}” paused`);
  } catch (err) {
    activePresetId = previousId;
    refreshPresetSelect();
    setPresetStatus(`Load failed: ${err.message}`, true);
  }
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
    scheduleSessionSave();
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
    scheduleSessionSave();
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
  presets = presetStore.list().filter((preset) => preset?.id && preset?.name && preset?.configuration);

  populateSelect(els.structureSelect, structuresSchema);
  populateSelect(els.projectionSelect, projectionsSchema);
  refreshPresetSelect();

  els.structureSelect.addEventListener("change", () => {
    rebuildStructureForm();
    scheduleSessionSave();
  });
  els.projectionSelect.addEventListener("change", () => {
    rebuildProjectionForm();
    scheduleSessionSave();
  });
  els.generateBtn.addEventListener("click", handleGenerate);
  els.applyProjectionBtn.addEventListener("click", handleApplyProjection);
  els.addRotationBtn.addEventListener("click", () => rotationPanel.addRow());
  els.pauseBtn.addEventListener("click", () => {
    setPaused(!rotationsPaused);
    scheduleSessionSave();
  });
  els.resetRotationBtn.addEventListener("click", () => {
    viewer.resetRotations();
    rotationPanel.resetAngleDisplays();
    scheduleSessionSave();
  });
  els.resetPositionBtn.addEventListener("click", () => positionPanel.reset());
  els.analyzeBtn.addEventListener("click", handleAnalyze);

  els.presetSelect.addEventListener("change", () => {
    const id = els.presetSelect.value;
    if (id) loadPresetById(id);
    else {
      activePresetId = null;
      setPresetStatus("Current session");
      scheduleSessionSave();
    }
  });
  els.presetSaveBtn.addEventListener("click", saveCurrentPreset);
  els.presetSaveAsBtn.addEventListener("click", () => {
    const preset = selectedPreset();
    savePresetAs(preset ? uniquePresetName(`${preset.name} copy`, presets) : "Untitled preset");
  });
  els.presetRenameBtn.addEventListener("click", renameSelectedPreset);
  els.presetDuplicateBtn.addEventListener("click", duplicateSelectedPreset);
  els.presetDeleteBtn.addEventListener("click", deleteSelectedPreset);
  els.presetExportBtn.addEventListener("click", exportSelectedPreset);
  els.presetExportAllBtn.addEventListener("click", exportAllPresets);
  els.presetImportBtn.addEventListener("click", () => els.presetFileInput.click());
  els.presetFileInput.addEventListener("change", () => {
    const [file] = els.presetFileInput.files;
    if (file) importPresetFile(file);
  });
  for (const button of els.presetMenu.querySelectorAll("button")) {
    button.addEventListener("click", () => { els.presetMenu.open = false; });
  }
  document.addEventListener("input", scheduleSessionSave);
  document.addEventListener("change", scheduleSessionSave);
  viewer.setViewChangeListener(scheduleSessionSave);
  window.addEventListener("beforeunload", () => {
    try {
      presetStore.saveSession(checkedConfiguration(), activePresetId);
    } catch {
      // Keep the last valid session if a form is incomplete during navigation.
    }
  });

  rebuildStructureForm();
  rebuildProjectionForm();
  const session = presetStore.loadSession();
  if (session?.configuration) {
    try {
      await applyConfiguration(session.configuration);
      activePresetId = presets.some((preset) => preset.id === session.activePresetId)
        ? session.activePresetId
        : null;
      refreshPresetSelect();
      updatePresetDirtyIndicator(captureConfiguration());
      setPresetStatus("Restored previous session paused");
      return;
    } catch (err) {
      setPresetStatus(`Session restore skipped: ${err.message}`, true);
    }
  }

  suppressSessionSave = true;
  rotationPanel.setDimension(currentDimension);
  rotationPanel.addRow();
  positionPanel.setDimension(currentDimension);
  await handleGenerate();
  suppressSessionSave = false;
  scheduleSessionSave();
}

init().catch((err) => {
  els.structureError.textContent = `Failed to initialize: ${err.message}`;
});
