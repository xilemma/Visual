export const PRESET_SCHEMA_VERSION = 1;
export const PRESETS_STORAGE_KEY = "nd-projection-studio.presets.v1";
export const SESSION_STORAGE_KEY = "nd-projection-studio.session.v1";

const PRESET_FORMAT = "nd-projection-studio-preset";
const BUNDLE_FORMAT = "nd-projection-studio-presets";
const SESSION_FORMAT = "nd-projection-studio-session";
const MAX_SPEED_RADIANS_PER_SECOND = (120 * Math.PI) / 180;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validateParams(raw, schema, label) {
  if (!isObject(raw)) throw new Error(`${label} parameters are missing.`);
  const result = {};
  for (const [name, spec] of Object.entries(schema)) {
    if (!(name in raw)) throw new Error(`${label} parameter “${name}” is missing.`);
    const value = raw[name];
    if (spec.type === "bool") {
      if (typeof value !== "boolean") throw new Error(`${label} parameter “${name}” must be true or false.`);
      result[name] = value;
      continue;
    }
    if (spec.type === "text") {
      if (typeof value !== "string") throw new Error(`${label} parameter “${name}” must be text.`);
      result[name] = value;
      continue;
    }
    if (spec.type === "choice") {
      const option = spec.options.find((candidate) => String(candidate) === String(value));
      if (option === undefined) throw new Error(`${label} parameter “${name}” has an unsupported choice.`);
      result[name] = option;
      continue;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || (spec.type === "int" && !Number.isInteger(number))) {
      throw new Error(`${label} parameter “${name}” is not a valid ${spec.type}.`);
    }
    if (spec.min !== undefined && number < spec.min) {
      throw new Error(`${label} parameter “${name}” must be at least ${spec.min}.`);
    }
    if (spec.max !== undefined && number > spec.max) {
      throw new Error(`${label} parameter “${name}” must be at most ${spec.max}.`);
    }
    result[name] = number;
  }
  return result;
}

export function uniquePresetName(name, presets, excludeId = null) {
  const base = String(name || "Untitled preset").trim() || "Untitled preset";
  const used = new Set(
    presets.filter((preset) => preset.id !== excludeId).map((preset) => preset.name.toLocaleLowerCase())
  );
  if (!used.has(base.toLocaleLowerCase())) return base;
  let index = 2;
  while (used.has(`${base} ${index}`.toLocaleLowerCase())) index += 1;
  return `${base} ${index}`;
}

export function validateConfiguration(raw, structuresSchema, projectionsSchema) {
  if (!isObject(raw)) throw new Error("Preset configuration must be an object.");
  if (!isObject(raw.structure) || !structuresSchema[raw.structure.type]) {
    throw new Error(`Unknown structure type: ${raw.structure?.type ?? "missing"}.`);
  }
  const structureParams = validateParams(
    raw.structure.params,
    structuresSchema[raw.structure.type].params,
    "Structure"
  );
  const dimension = Number(structureParams.dimension);
  if (!Number.isInteger(dimension) || dimension < 1) throw new Error("Preset dimension is invalid.");

  if (!isObject(raw.projection) || !projectionsSchema[raw.projection.method]) {
    throw new Error(`Unknown projection method: ${raw.projection?.method ?? "missing"}.`);
  }
  const projectionParams = validateParams(
    raw.projection.params,
    projectionsSchema[raw.projection.method].params,
    "Projection"
  );

  if (!Array.isArray(raw.transforms) || raw.transforms.length > dimension) {
    throw new Error(`Transforms must be an array with at most ${dimension} rows.`);
  }
  const planes = new Set();
  const scaleAxes = new Set();
  const transforms = raw.transforms.map((row, index) => {
    if (!isObject(row) || !["rotation", "scale"].includes(row.type)) {
      throw new Error(`Transform ${index + 1} has an invalid type.`);
    }
    if (!Array.isArray(row.plane) || row.plane.length !== 2) {
      throw new Error(`Transform ${index + 1} has an invalid target.`);
    }
    let [i, j] = row.plane.map(Number);
    if (![i, j].every((axis) => Number.isInteger(axis) && axis >= 0 && axis < dimension)) {
      throw new Error(`Transform ${index + 1} references an axis outside dimension ${dimension}.`);
    }
    if (row.type === "rotation") {
      if (i === j) throw new Error(`Transform ${index + 1} is not a plane rotation.`);
      if (i > j) [i, j] = [j, i];
      const key = `${i}:${j}`;
      if (planes.has(key)) throw new Error(`Transform ${index + 1} duplicates plane ${i}–${j}.`);
      planes.add(key);
    } else {
      if (i !== j) throw new Error(`Transform ${index + 1} is not an axis scale.`);
      if (scaleAxes.has(i)) throw new Error(`Transform ${index + 1} duplicates scale axis ${i}.`);
      scaleAxes.add(i);
    }
    const speed = Number(row.speed);
    const angleDeg = Number(row.angleDeg);
    if (
      !Number.isFinite(speed) ||
      speed < -MAX_SPEED_RADIANS_PER_SECOND ||
      speed > MAX_SPEED_RADIANS_PER_SECOND
    ) {
      throw new Error(`Transform ${index + 1} speed exceeds the supported ±120°/s range.`);
    }
    if (!Number.isFinite(angleDeg)) throw new Error(`Transform ${index + 1} Angle/Phase is invalid.`);
    return { type: row.type, plane: [i, j], speed, angleDeg };
  });

  if (!Array.isArray(raw.position) || raw.position.length !== dimension) {
    throw new Error(`Position must contain exactly ${dimension} values.`);
  }
  const position = raw.position.map((value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < -5 || number > 5) {
      throw new Error(`Position axis ${index} must be between -5 and 5.`);
    }
    return number;
  });

  let view = null;
  if (raw.view != null) {
    if (!isObject(raw.view) || !Array.isArray(raw.view.position) || !Array.isArray(raw.view.target)) {
      throw new Error("The saved camera view is invalid.");
    }
    const cameraPosition = raw.view.position.map(Number);
    const target = raw.view.target.map(Number);
    if (
      cameraPosition.length !== 3 || target.length !== 3 ||
      ![...cameraPosition, ...target].every(Number.isFinite)
    ) {
      throw new Error("The saved camera view must contain two finite 3D vectors.");
    }
    view = { position: cameraPosition, target };
  }

  return {
    structure: { type: raw.structure.type, params: structureParams },
    projection: { method: raw.projection.method, params: projectionParams },
    transforms,
    position,
    view,
    paused: !!raw.paused,
  };
}

export class PresetStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  list() {
    try {
      const parsed = JSON.parse(this.storage.getItem(PRESETS_STORAGE_KEY) || "null");
      if (parsed?.format !== BUNDLE_FORMAT || parsed.schemaVersion !== PRESET_SCHEMA_VERSION) return [];
      return Array.isArray(parsed.presets) ? parsed.presets : [];
    } catch {
      return [];
    }
  }

  write(presets) {
    this.storage.setItem(PRESETS_STORAGE_KEY, JSON.stringify({
      format: BUNDLE_FORMAT,
      schemaVersion: PRESET_SCHEMA_VERSION,
      presets,
    }));
  }

  create(name, configuration) {
    const now = new Date().toISOString();
    return {
      format: PRESET_FORMAT,
      schemaVersion: PRESET_SCHEMA_VERSION,
      id: makeId(),
      name: String(name).trim(),
      created: now,
      modified: now,
      configuration: clone(configuration),
    };
  }

  saveSession(configuration, activePresetId = null) {
    this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      format: SESSION_FORMAT,
      schemaVersion: PRESET_SCHEMA_VERSION,
      activePresetId,
      configuration,
    }));
  }

  loadSession() {
    try {
      const parsed = JSON.parse(this.storage.getItem(SESSION_STORAGE_KEY) || "null");
      if (parsed?.format !== SESSION_FORMAT || parsed.schemaVersion !== PRESET_SCHEMA_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}

export function parsePresetFile(raw) {
  if (!isObject(raw) || raw.schemaVersion !== PRESET_SCHEMA_VERSION) {
    throw new Error(`Only preset schema version ${PRESET_SCHEMA_VERSION} is supported.`);
  }
  if (raw.format === PRESET_FORMAT) return [raw];
  if (raw.format === BUNDLE_FORMAT && Array.isArray(raw.presets)) return raw.presets;
  throw new Error("This is not an N-D Projection Studio preset file.");
}

export function exportPresetDocument(preset) {
  return clone({ ...preset, format: PRESET_FORMAT, schemaVersion: PRESET_SCHEMA_VERSION });
}

export function exportPresetBundle(presets) {
  return clone({ format: BUNDLE_FORMAT, schemaVersion: PRESET_SCHEMA_VERSION, presets });
}
