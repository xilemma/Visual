// Generic parameter-schema-driven form builder, shared by the structure and
// projection panels so we don't hand-write bespoke UI for every variant.

function formatLabel(name) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build form controls for a params schema: { name: {type, default, min, max, options} }
 * `overrides` optionally maps field name -> partial spec overrides (e.g. clamping
 * axis max to the current dimension). `helpText` optionally maps field name -> a
 * tooltip string applied as the label's and input's `data-tooltip` attribute.
 * Returns a map of field name -> input element.
 */
export function buildForm(container, schema, overrides = {}, helpText = {}) {
  container.innerHTML = "";
  const inputs = {};

  for (const [name, rawSpec] of Object.entries(schema)) {
    const spec = { ...rawSpec, ...(overrides[name] || {}) };
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.textContent = formatLabel(name);
    label.htmlFor = `field-${name}`;
    const help = helpText[name];
    if (help) label.dataset.tooltip = help;
    wrapper.appendChild(label);

    let input;
    if (spec.type === "choice") {
      input = document.createElement("select");
      for (const opt of spec.options) {
        const option = document.createElement("option");
        option.value = String(opt);
        option.textContent = String(opt);
        if (opt === spec.default) option.selected = true;
        input.appendChild(option);
      }
    } else if (spec.type === "bool") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!spec.default;
    } else if (spec.type === "text") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.placeholder = spec.placeholder || "";
      input.value = spec.default || "";
    } else {
      input = document.createElement("input");
      input.type = "number";
      input.step = spec.type === "float" ? "0.1" : "1";
      if (spec.min !== undefined) input.min = String(spec.min);
      if (spec.max !== undefined) input.max = String(spec.max);
      input.value = String(spec.default);
    }
    input.id = `field-${name}`;
    input.dataset.name = name;
    input.dataset.type = spec.type;
    if (help) input.dataset.tooltip = help;
    wrapper.appendChild(input);
    container.appendChild(wrapper);
    inputs[name] = input;
  }
  return inputs;
}

export function readForm(inputs) {
  const values = {};
  for (const [name, input] of Object.entries(inputs)) {
    const type = input.dataset.type;
    if (type === "bool") {
      values[name] = input.checked;
    } else if (type === "int") {
      values[name] = parseInt(input.value, 10);
    } else if (type === "float") {
      values[name] = parseFloat(input.value);
    } else if (type === "choice") {
      const raw = input.value;
      values[name] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    } else {
      values[name] = input.value;
    }
  }
  return values;
}

export function writeForm(inputs, values) {
  for (const [name, input] of Object.entries(inputs)) {
    if (!(name in values)) continue;
    if (input.dataset.type === "bool") input.checked = !!values[name];
    else input.value = String(values[name]);
  }
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const clampSliderSpeedDeg = (v) => Math.min(30, Math.max(-30, v));
const clampTypedSpeedDeg = (v) => Math.min(120, Math.max(-120, v));
const displaySpeedDeg = (radiansPerSecond) => Math.round(radiansPerSecond * RAD_TO_DEG);
const normalizeSpeedRadians = (radiansPerSecond) =>
  clampTypedSpeedDeg(displaySpeedDeg(radiansPerSecond)) * DEG_TO_RAD;

/** Manages explicit plane-rotation and single-axis-scale transform rows. */
export class RotationPanel {
  constructor(container, onChange, onAngleSet) {
    this.container = container;
    this.onChange = onChange;
    this.onAngleSet = onAngleSet;
    this.rows = []; // { id, type: "rotation"|"scale", plane: [i, j], speed, angleDeg }
    this.dimension = 4;
    this.paused = false;
    this._nextId = 1;
    this._liveDisplays = new Map();
  }

  /** Manual phase/angle inputs are only editable while paused. Sync their displays to the live Viewer state on pause. */
  setPaused(paused, liveAngles = null) {
    this.paused = paused;
    if (liveAngles) this._storeLiveAngles(liveAngles);
    this._render();
  }

  /** Refresh readouts without rebuilding controls; intended for the Viewer's throttled 10 Hz snapshots. */
  updateLiveAngles(liveAngles) {
    this._storeLiveAngles(liveAngles);
    for (const row of this.rows) {
      const display = this._liveDisplays.get(row.id);
      if (!display) continue;
      const degrees = row.angleDeg;
      display.angle.value = String(Math.round(degrees * 10) / 10);
      display.dialKnob.style.transform = `rotate(${degrees}deg)`;
      display.updateScaleReadout(degrees);
    }
  }

  _storeLiveAngles(liveAngles) {
    for (const row of this.rows) {
      if (!liveAngles.has(row.id)) continue;
      const degrees = (liveAngles.get(row.id) * 180) / Math.PI;
      row.angleDeg = ((degrees % 360) + 360) % 360;
    }
  }

  setDimension(dimension) {
    this.dimension = dimension;
    this.rows = this.rows
      .filter((r) => r.plane[0] < dimension && r.plane[1] < dimension)
      .slice(0, this._maxRows());
    for (const r of this.rows) r.angleDeg = 0;
    this._render();
    this._emit();
  }

  /** One row per available dimension, so higher-D structures get proportionally more planes. */
  _maxRows() {
    return this.dimension;
  }

  _allPlanes() {
    const planes = [];
    for (let i = 0; i < this.dimension; i++) {
      for (let j = i + 1; j < this.dimension; j++) planes.push([i, j]);
    }
    return planes;
  }

  _usedPlaneKeys(excludeId = null) {
    return new Set(
      this.rows
        .filter((r) => r.id !== excludeId && r.type !== "scale")
        .map((r) => `${Math.min(...r.plane)}:${Math.max(...r.plane)}`)
    );
  }

  _nextUnusedPlane(excludeId = null) {
    const used = this._usedPlaneKeys(excludeId);
    return this._allPlanes().find(([i, j]) => !used.has(`${i}:${j}`)) || [0, 1];
  }

  _nextUnusedScaleAxis(excludeId = null) {
    const used = new Set(
      this.rows.filter((r) => r.id !== excludeId && r.type === "scale").map((r) => r.plane[0])
    );
    for (let axis = 0; axis < this.dimension; axis++) if (!used.has(axis)) return axis;
    return 0;
  }

  addRow() {
    if (this.rows.length >= this._maxRows()) return;
    const [i, j] = this._nextUnusedPlane();
    this.rows.push({ id: this._nextId++, type: "rotation", plane: [i, j], speed: 3 * DEG_TO_RAD, angleDeg: 0 });
    this._render();
    this._emit();
  }

  getRotations() {
    return this.rows.map((r) => ({ id: r.id, type: r.type, plane: r.plane, speed: r.speed }));
  }

  getState(liveAngles = null) {
    if (liveAngles) this._storeLiveAngles(liveAngles);
    return this.rows.map((row) => ({
      type: row.type,
      plane: row.plane.slice(),
      speed: row.speed,
      angleDeg: row.angleDeg,
    }));
  }

  setState(rows) {
    this.rows = rows.slice(0, this._maxRows()).map((row) => ({
      id: this._nextId++,
      type: row.type,
      plane: row.plane.slice(),
      speed: normalizeSpeedRadians(row.speed),
      angleDeg: row.angleDeg,
    }));
    this._render();
    this._emit();
    for (const row of this.rows) {
      if (this.onAngleSet) this.onAngleSet(row.id, (row.angleDeg * Math.PI) / 180);
    }
  }

  /** Zeroes every rotation angle / scale phase display, matching Viewer.resetRotations(). */
  resetAngleDisplays() {
    for (const r of this.rows) r.angleDeg = 0;
    this._render();
  }

  _render() {
    this.container.innerHTML = "";
    this._liveDisplays.clear();
    this.rows.forEach((row, idx) => {
      const groupEl = document.createElement("div");
      groupEl.className = "rotation-row-group";

      // Normalize rows created before transform types became explicit.
      row.type ||= row.plane[0] === row.plane[1] ? "scale" : "rotation";
      const isAxisScale = row.type === "scale";
      const kind = document.createElement("div");
      kind.className = `rotation-kind ${isAxisScale ? "rotation-kind-scale" : ""}`;
      kind.textContent = isAxisScale ? `Axis ${row.plane[0]} scale` : "Plane rotation";
      kind.dataset.tooltip = isAxisScale
        ? "Intentional single-axis scaling. Its phase produces the factor cos(phase) + sin(phase): positive values stretch, 0 collapses this coordinate, and negative values reflect it."
        : "A genuine rotation in the plane formed by the two different selected axes.";

      const rowEl = document.createElement("div");
      rowEl.className = "rotation-row";

      const typeSelect = document.createElement("select");
      typeSelect.dataset.tooltip = "Choose a genuine two-axis plane rotation or an intentional single-axis scale transform.";
      for (const [value, label] of [["rotation", "Plane rotation"], ["scale", "Axis scale"]]) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        opt.selected = row.type === value;
        typeSelect.appendChild(opt);
      }
      typeSelect.addEventListener("change", () => {
        row.type = typeSelect.value;
        if (row.type === "scale") {
          const axis = this._nextUnusedScaleAxis(row.id);
          row.plane = [axis, axis];
        } else {
          row.plane = this._nextUnusedPlane(row.id);
        }
        this._render();
        this._emit();
      });

      const targetSelect = isAxisScale ? this._scaleAxisSelect(row) : this._planeSelect(row);

      const speed = document.createElement("input");
      speed.type = "range";
      speed.min = "-30";
      speed.max = "30";
      speed.step = "1";
      speed.value = String(clampSliderSpeedDeg(displaySpeedDeg(row.speed)));
      speed.dataset.tooltip = isAxisScale
        ? "Phase speed in whole degrees/second. The slider covers -30..30; use the number box for speeds up to ±120. Negative reverses the cycle; 0 holds the current scale. Double-click to stop at the current phase."
        : "Angular speed in whole degrees/second. The slider covers -30..30; use the number box for speeds up to ±120. Negative reverses the rotation; 0 holds the current angle. Double-click to stop at the current angle.";

      const speedNumber = document.createElement("input");
      speedNumber.type = "number";
      speedNumber.min = "-120";
      speedNumber.max = "120";
      speedNumber.step = "1";
      speedNumber.value = String(displaySpeedDeg(row.speed));
      speedNumber.dataset.tooltip = isAxisScale
        ? "The axis-scale phase speed in degrees/second. Rounded to a whole number and clamped to -120..120 on blur."
        : "The rotation speed in degrees/second. Rounded to a whole number and clamped to -120..120 on blur.";

      speed.addEventListener("input", () => {
        const degreesPerSecond = parseInt(speed.value, 10);
        row.speed = degreesPerSecond * DEG_TO_RAD;
        speedNumber.value = String(degreesPerSecond);
        this._emit();
      });
      speedNumber.addEventListener("input", () => {
        const val = parseFloat(speedNumber.value);
        if (Number.isNaN(val)) return; // let them keep typing, e.g. a lone "-"
        const activeSpeed = clampTypedSpeedDeg(val);
        row.speed = activeSpeed * DEG_TO_RAD;
        speed.value = String(clampSliderSpeedDeg(activeSpeed));
        this._emit();
      });
      speedNumber.addEventListener("blur", () => {
        const clamped = clampTypedSpeedDeg(Math.round(parseFloat(speedNumber.value) || 0));
        row.speed = clamped * DEG_TO_RAD;
        speedNumber.value = String(clamped);
        speed.value = String(clampSliderSpeedDeg(clamped));
        this._emit();
      });
      // Same double-click-to-reset convention as the angle dial.
      speed.addEventListener("dblclick", () => {
        row.speed = 0;
        speed.value = "0";
        speedNumber.value = "0";
        this._emit();
      });

      const remove = document.createElement("button");
      remove.textContent = "\u2715";
      remove.dataset.tooltip = "Remove this N-D transform row.";
      remove.addEventListener("click", () => {
        this.rows.splice(idx, 1);
        this._render();
        this._emit();
      });

      rowEl.appendChild(typeSelect);
      rowEl.appendChild(targetSelect);
      rowEl.appendChild(remove);

      const speedRow = document.createElement("div");
      speedRow.className = "rotation-speed-row";
      const speedLabel = document.createElement("span");
      speedLabel.className = "rotation-angle-label";
      speedLabel.textContent = "Speed";
      speedRow.appendChild(speedLabel);
      speedRow.appendChild(speed);
      speedRow.appendChild(speedNumber);
      const speedUnit = document.createElement("span");
      speedUnit.className = "rotation-speed-unit";
      speedUnit.textContent = "°/s";
      speedRow.appendChild(speedUnit);

      const angleRow = document.createElement("div");
      angleRow.className = "rotation-angle-row";
      // data-tooltip lives on this wrapper, not the input itself -- disabled inputs don't reliably fire hover events.
      angleRow.dataset.tooltip = this.paused
        ? isAxisScale
          ? "Sets the scale oscillator's phase exactly. The resulting factor is cos(phase) + sin(phase)."
          : "Jumps this plane rotation straight to an exact angle in degrees, bypassing Speed's gradual accumulation."
        : "Live readout while playing, refreshed 10 times per second. Pause to edit it manually.";

      const angleLabel = document.createElement("span");
      angleLabel.className = "rotation-angle-label";
      angleLabel.textContent = isAxisScale ? "Phase" : "Angle";

      const angle = document.createElement("input");
      angle.type = "number";
      angle.step = "1";
      angle.value = String(row.angleDeg);
      angle.disabled = !this.paused;

      const angleUnit = document.createElement("span");
      angleUnit.className = "rotation-angle-label";
      angleUnit.textContent = "\u00b0";

      const dial = document.createElement("div");
      dial.className = "rotation-dial";
      if (!this.paused) dial.classList.add("rotation-dial-disabled");
      dial.dataset.tooltip = this.paused
        ? isAxisScale
          ? "Drag to set the scale phase directly, or double-click to restore phase 0\u00b0 (scale 1\u00d7)."
          : "Drag to set this rotation angle directly, or double-click to reset it to 0\u00b0."
        : "Live phase indicator while playing, refreshed 10 times per second. Pause to drag it manually.";

      const dialKnob = document.createElement("div");
      dialKnob.className = "rotation-dial-knob";
      dial.appendChild(dialKnob);

      const scaleReadout = document.createElement("span");
      scaleReadout.className = "rotation-scale-readout";
      const updateScaleReadout = (degrees) => {
        if (!isAxisScale) return;
        const radians = (degrees * Math.PI) / 180;
        const factor = Math.cos(radians) + Math.sin(radians);
        const effect = Math.abs(factor) < 0.0005 ? "collapsed" : factor < 0 ? "reflected" : "scaled";
        scaleReadout.textContent = `${factor.toFixed(3)}\u00d7 ${effect}`;
      };

      // Shared normalize+apply path used by both the number input and the dial drag,
      // so both stay in sync and always go through the same paused-only onAngleSet call.
      const setAngleDeg = (val) => {
        let norm = val % 360;
        if (norm < 0) norm += 360;
        row.angleDeg = norm;
        angle.value = String(norm);
        dialKnob.style.transform = `rotate(${norm}deg)`;
        updateScaleReadout(norm);
        if (this.onAngleSet) this.onAngleSet(row.id, (norm * Math.PI) / 180);
      };
      dialKnob.style.transform = `rotate(${((row.angleDeg % 360) + 360) % 360}deg)`;
      updateScaleReadout(row.angleDeg);
      this._liveDisplays.set(row.id, { angle, dialKnob, updateScaleReadout });

      // "input" fires per keystroke while typing -- accept it raw so typing "37" mid-entry
      // isn't clobbered by normalization. Native number inputs fire "change" (not "input")
      // for spinner-arrow clicks, and also on blur/Enter after an edit -- normalize there,
      // so arrow-clicks wrap immediately like the dial, and typed values wrap once committed.
      angle.addEventListener("input", () => {
        const val = parseFloat(angle.value);
        if (Number.isNaN(val)) return; // let them keep typing, e.g. a lone "-"
        row.angleDeg = val;
        dialKnob.style.transform = `rotate(${val}deg)`;
        updateScaleReadout(val);
        if (this.onAngleSet) this.onAngleSet(row.id, (val * Math.PI) / 180);
      });
      angle.addEventListener("change", () => {
        setAngleDeg(parseFloat(angle.value) || 0);
      });

      let dialCenter = null;
      dial.addEventListener("pointerdown", (ev) => {
        if (!this.paused) return;
        dial.setPointerCapture(ev.pointerId);
        const rect = dial.getBoundingClientRect();
        dialCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      dial.addEventListener("pointermove", (ev) => {
        if (!this.paused || !dialCenter) return;
        const dx = ev.clientX - dialCenter.x;
        const dy = ev.clientY - dialCenter.y;
        const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
        setAngleDeg(deg);
      });
      const endDrag = (ev) => {
        if (dial.hasPointerCapture(ev.pointerId)) dial.releasePointerCapture(ev.pointerId);
        dialCenter = null;
      };
      dial.addEventListener("pointerup", endDrag);
      dial.addEventListener("pointercancel", endDrag);
      // Canonical slider/knob convention: double-click resets just this row to 0.
      dial.addEventListener("dblclick", () => {
        if (!this.paused) return;
        setAngleDeg(0);
      });

      angleRow.appendChild(angleLabel);
      angleRow.appendChild(angle);
      angleRow.appendChild(angleUnit);
      angleRow.appendChild(dial);

      if (isAxisScale) angleRow.appendChild(scaleReadout);

      groupEl.appendChild(kind);
      groupEl.appendChild(rowEl);
      groupEl.appendChild(speedRow);
      groupEl.appendChild(angleRow);
      this.container.appendChild(groupEl);
    });
  }

  _planeSelect(row) {
    const select = document.createElement("select");
    select.dataset.tooltip = "An unordered coordinate plane. Reversed duplicates are omitted; direction comes from the sign of Angle and Speed.";
    const used = this._usedPlaneKeys(row.id);
    const current = `${Math.min(...row.plane)}:${Math.max(...row.plane)}`;
    for (const [i, j] of this._allPlanes()) {
      const key = `${i}:${j}`;
      if (used.has(key) && key !== current) continue;
      const opt = document.createElement("option");
      opt.value = `${i},${j}`;
      opt.textContent = `axes ${i}\u2013${j}`;
      opt.selected = key === current;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      row.plane = select.value.split(",").map((v) => parseInt(v, 10));
      this._render();
      this._emit();
    });
    return select;
  }

  _scaleAxisSelect(row) {
    const select = document.createElement("select");
    select.dataset.tooltip = "The single coordinate to stretch, collapse, or reflect. Axes already used by another scale row are omitted.";
    const used = new Set(
      this.rows.filter((r) => r.id !== row.id && r.type === "scale").map((r) => r.plane[0])
    );
    for (let axis = 0; axis < this.dimension; axis++) {
      if (used.has(axis) && axis !== row.plane[0]) continue;
      const opt = document.createElement("option");
      opt.value = String(axis);
      opt.textContent = `axis ${axis}`;
      opt.selected = axis === row.plane[0];
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      const axis = parseInt(select.value, 10);
      row.plane = [axis, axis];
      this._render();
      this._emit();
    });
    return select;
  }

  _emit() {
    if (this.onChange) this.onChange(this.getRotations());
  }
}

const clampOffset = (v) => Math.min(5, Math.max(-5, v));

/** Manages the N-D translation offset applied after rotation, before projection. */
export class PositionPanel {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.offset = []; // one entry per axis
    this.dimension = 4;
  }

  setDimension(dimension) {
    this.dimension = dimension;
    this.offset = new Array(dimension).fill(0);
    this._render();
    this._emit();
  }

  getOffset() {
    return this.offset.slice();
  }

  setOffset(offset) {
    this.offset = offset.slice(0, this.dimension);
    while (this.offset.length < this.dimension) this.offset.push(0);
    this._render();
    this._emit();
  }

  /** Snaps every axis back to 0 without touching dimension. */
  reset() {
    this.offset = this.offset.map(() => 0);
    this._render();
    this._emit();
  }

  _render() {
    this.container.innerHTML = "";
    for (let axis = 0; axis < this.dimension; axis++) {
      const rowEl = document.createElement("div");
      rowEl.className = "position-row";

      const label = document.createElement("span");
      label.className = "position-axis-label";
      label.textContent = `axis ${axis}`;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "-5";
      slider.max = "5";
      slider.step = "0.05";
      slider.value = String(this.offset[axis]);
      slider.dataset.tooltip = `Shifts every point's axis-${axis} coordinate by this amount, applied after rotation and before projection.`;

      const number = document.createElement("input");
      number.type = "number";
      number.min = "-5";
      number.max = "5";
      number.step = "0.05";
      number.value = String(this.offset[axis]);
      number.dataset.tooltip = "Same offset, typed exactly instead of dragged. Clamped to the slider's -5..5 range on blur.";

      slider.addEventListener("input", () => {
        this.offset[axis] = parseFloat(slider.value);
        number.value = String(this.offset[axis]);
        this._emit();
      });
      number.addEventListener("input", () => {
        const val = parseFloat(number.value);
        if (Number.isNaN(val)) return; // let them keep typing, e.g. a lone "-"
        this.offset[axis] = val;
        slider.value = String(clampOffset(val));
        this._emit();
      });
      number.addEventListener("blur", () => {
        const clamped = clampOffset(parseFloat(number.value) || 0);
        this.offset[axis] = clamped;
        number.value = String(clamped);
        slider.value = String(clamped);
        this._emit();
      });

      rowEl.appendChild(label);
      rowEl.appendChild(slider);
      rowEl.appendChild(number);
      this.container.appendChild(rowEl);
    }
  }

  _emit() {
    if (this.onChange) this.onChange(this.getOffset());
  }
}
