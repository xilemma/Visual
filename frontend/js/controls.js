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

const clampSpeed = (v) => Math.min(2, Math.max(-2, v));

/** Manages the list of "rotate plane (i,j) at speed" rows. */
export class RotationPanel {
  constructor(container, onChange, onAngleSet) {
    this.container = container;
    this.onChange = onChange;
    this.onAngleSet = onAngleSet;
    this.rows = []; // { id, plane: [i, j], speed: number, angleDeg: number }
    this.dimension = 4;
    this.paused = false;
    this._nextId = 1;
  }

  /** The Angle inputs are only editable while paused -- otherwise the animation loop overwrites the angle next frame. */
  setPaused(paused) {
    this.paused = paused;
    this._render();
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

  /** Prefers axes no existing row already uses, so new rows start out fully independent. */
  _nextUnusedPlane() {
    const used = new Set(this.rows.flatMap((r) => r.plane));
    const free = [];
    for (let a = 0; a < this.dimension; a++) if (!used.has(a)) free.push(a);
    if (free.length >= 2) return [free[0], free[1]];
    const i = 0;
    const j = Math.min(3, this.dimension - 1) || 1;
    return [i, j === i ? (i + 1) % this.dimension : j];
  }

  addRow() {
    if (this.rows.length >= this._maxRows()) return;
    const [i, j] = this._nextUnusedPlane();
    this.rows.push({ id: this._nextId++, plane: [i, j], speed: 0.5, angleDeg: 0 });
    this._render();
    this._emit();
  }

  getRotations() {
    return this.rows.map((r) => ({ id: r.id, plane: r.plane, speed: r.speed }));
  }

  /** Zeroes every row's Angle display, matching Viewer.resetRotations() snapping the real angle back to 0. */
  resetAngleDisplays() {
    for (const r of this.rows) r.angleDeg = 0;
    this._render();
  }

  _render() {
    this.container.innerHTML = "";
    const sameAxisWarning =
      "Picking the same axis in both dropdowns of a row does not rotate anything -- it produces a pulsing scale artifact on that one coordinate instead.";
    this.rows.forEach((row, idx) => {
      const groupEl = document.createElement("div");
      groupEl.className = "rotation-row-group";

      const rowEl = document.createElement("div");
      rowEl.className = "rotation-row";

      const selectI = this._axisSelect(
        row.plane[0],
        (val) => {
          row.plane[0] = val;
          this._emit();
        },
        `First axis of this rotation plane, paired with the second axis dropdown to its right.\n\n${sameAxisWarning}`
      );
      const selectJ = this._axisSelect(
        row.plane[1],
        (val) => {
          row.plane[1] = val;
          this._emit();
        },
        `Second axis of this rotation plane, paired with the first axis dropdown to its left.\n\n${sameAxisWarning}`
      );

      const speed = document.createElement("input");
      speed.type = "range";
      speed.min = "-2";
      speed.max = "2";
      speed.step = "0.05";
      speed.value = String(row.speed);
      speed.dataset.tooltip =
        "Angular speed in radians/second, added to this row's angle every frame while playing. Negative reverses direction; 0 freezes just this row at whatever angle it currently shows.\n\nMultiple rows compose in order, every frame, into one compound rotation. The Pause button above freezes/resumes every row at its current angle -- use Reset rotation to snap back to angle 0 instead.";

      const speedNumber = document.createElement("input");
      speedNumber.type = "number";
      speedNumber.min = "-2";
      speedNumber.max = "2";
      speedNumber.step = "0.05";
      speedNumber.value = String(row.speed);
      speedNumber.dataset.tooltip = "Same speed, typed exactly instead of dragged. Clamped to the slider's -2..2 range on blur.";

      speed.addEventListener("input", () => {
        row.speed = parseFloat(speed.value);
        speedNumber.value = String(row.speed);
        this._emit();
      });
      speedNumber.addEventListener("input", () => {
        const val = parseFloat(speedNumber.value);
        if (Number.isNaN(val)) return; // let them keep typing, e.g. a lone "-"
        row.speed = val;
        speed.value = String(clampSpeed(val));
        this._emit();
      });
      speedNumber.addEventListener("blur", () => {
        const clamped = clampSpeed(parseFloat(speedNumber.value) || 0);
        row.speed = clamped;
        speedNumber.value = String(clamped);
        speed.value = String(clamped);
        this._emit();
      });

      const remove = document.createElement("button");
      remove.textContent = "\u2715";
      remove.dataset.tooltip = "Remove this rotation plane row.";
      remove.addEventListener("click", () => {
        this.rows.splice(idx, 1);
        this._render();
        this._emit();
      });

      rowEl.appendChild(selectI);
      rowEl.appendChild(selectJ);
      rowEl.appendChild(speed);
      rowEl.appendChild(speedNumber);
      rowEl.appendChild(remove);

      const angleRow = document.createElement("div");
      angleRow.className = "rotation-angle-row";
      // data-tooltip lives on this wrapper, not the input itself -- disabled inputs don't reliably fire hover events.
      angleRow.dataset.tooltip = this.paused
        ? "Jumps this row straight to an exact angle in degrees, bypassing Speed's gradual accumulation."
        : "Only editable while paused (click Pause above) -- otherwise the animation loop overwrites it again next frame.";

      const angleLabel = document.createElement("span");
      angleLabel.className = "rotation-angle-label";
      angleLabel.textContent = "Angle";

      const angle = document.createElement("input");
      angle.type = "number";
      angle.step = "1";
      angle.value = String(row.angleDeg);
      angle.disabled = !this.paused;

      const angleUnit = document.createElement("span");
      angleUnit.className = "rotation-angle-label";
      angleUnit.textContent = "\u00b0";

      const applyAngle = () => {
        const val = parseFloat(angle.value);
        if (Number.isNaN(val)) return; // let them keep typing, e.g. a lone "-"
        row.angleDeg = val;
        if (this.onAngleSet) this.onAngleSet(row.id, (val * Math.PI) / 180);
      };
      angle.addEventListener("input", applyAngle);
      angle.addEventListener("blur", () => {
        const val = parseFloat(angle.value) || 0;
        row.angleDeg = val;
        angle.value = String(val);
        if (this.onAngleSet) this.onAngleSet(row.id, (val * Math.PI) / 180);
      });

      angleRow.appendChild(angleLabel);
      angleRow.appendChild(angle);
      angleRow.appendChild(angleUnit);

      groupEl.appendChild(rowEl);
      groupEl.appendChild(angleRow);
      this.container.appendChild(groupEl);
    });
  }

  _axisSelect(selected, onChange, title) {
    const select = document.createElement("select");
    if (title) select.dataset.tooltip = title;
    for (let a = 0; a < this.dimension; a++) {
      const opt = document.createElement("option");
      opt.value = String(a);
      opt.textContent = `axis ${a}`;
      if (a === selected) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => onChange(parseInt(select.value, 10)));
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
