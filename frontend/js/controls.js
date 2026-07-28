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
 * axis max to the current dimension).
 * Returns a map of field name -> input element.
 */
export function buildForm(container, schema, overrides = {}) {
  container.innerHTML = "";
  const inputs = {};

  for (const [name, rawSpec] of Object.entries(schema)) {
    const spec = { ...rawSpec, ...(overrides[name] || {}) };
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.textContent = formatLabel(name);
    label.htmlFor = `field-${name}`;
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

/** Manages the list of "rotate plane (i,j) at speed" rows. */
export class RotationPanel {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.rows = []; // { plane: [i, j], speed: number }
    this.dimension = 4;
  }

  setDimension(dimension) {
    this.dimension = dimension;
    this.rows = this.rows.filter((r) => r.plane[0] < dimension && r.plane[1] < dimension);
    this._render();
  }

  addRow() {
    if (this.rows.length >= 4) return;
    const i = 0;
    const j = Math.min(3, this.dimension - 1) || 1;
    this.rows.push({ plane: [i, j === i ? (i + 1) % this.dimension : j], speed: 0.5 });
    this._render();
    this._emit();
  }

  getRotations() {
    return this.rows.map((r) => ({ plane: r.plane, speed: r.speed }));
  }

  _render() {
    this.container.innerHTML = "";
    this.rows.forEach((row, idx) => {
      const rowEl = document.createElement("div");
      rowEl.className = "rotation-row";

      const selectI = this._axisSelect(row.plane[0], (val) => {
        row.plane[0] = val;
        this._emit();
      });
      const selectJ = this._axisSelect(row.plane[1], (val) => {
        row.plane[1] = val;
        this._emit();
      });

      const speed = document.createElement("input");
      speed.type = "range";
      speed.min = "-2";
      speed.max = "2";
      speed.step = "0.05";
      speed.value = String(row.speed);
      speed.addEventListener("input", () => {
        row.speed = parseFloat(speed.value);
        this._emit();
      });

      const remove = document.createElement("button");
      remove.textContent = "\u2715";
      remove.title = "Remove";
      remove.addEventListener("click", () => {
        this.rows.splice(idx, 1);
        this._render();
        this._emit();
      });

      rowEl.appendChild(selectI);
      rowEl.appendChild(selectJ);
      rowEl.appendChild(speed);
      rowEl.appendChild(remove);
      this.container.appendChild(rowEl);
    });
  }

  _axisSelect(selected, onChange) {
    const select = document.createElement("select");
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
