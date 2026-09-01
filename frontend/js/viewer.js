import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { applyRotations, translate, applyProjection } from "./mathnd.js";

const PALETTE = [
  [0.36, 0.64, 0.98],
  [0.98, 0.55, 0.36],
  [0.42, 0.94, 0.55],
  [0.83, 0.46, 0.98],
  [0.98, 0.87, 0.36],
  [0.36, 0.93, 0.93],
];

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 1000);
    this.camera.position.set(2.6, 2.0, 3.4);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.GridHelper(6, 12, 0x334155, 0x1b2130));
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    this.pointsGeometry = new THREE.BufferGeometry();
    this.pointsMaterial = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, sizeAttenuation: true });
    this.pointsObject = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    this.scene.add(this.pointsObject);

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0x4f7cc9, transparent: true, opacity: 0.45 });
    this.lineObject = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.scene.add(this.lineObject);

    this.basePoints = [];
    this.edges = [];
    this.labels = null;
    this.rotations = []; // each entry: { id, plane: [i, j], speed, angle }
    this.offset = []; // N-D translation offset, added after rotation, before projection
    this.animating = true;
    this.projectionRecipe = null;
    this._lastFrameTime = null;
    this._lastTransformStateEmit = null;
    this._transformStateListener = null;
    this._lastTransformed = [];
    this._lastProjected = [];

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth || 1;
    const h = parent.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setStructure(points, edges, labels) {
    this.basePoints = points;
    this.edges = edges || [];
    this.labels = labels || null;
    this.resetRotations();
    this._colorFromLabels();
  }

  setProjectionRecipe(recipe) {
    this.projectionRecipe = recipe;
  }

  /** Merges in new plane/speed config while preserving each row's live angle (matched by id). */
  setRotations(rotations) {
    const prevAngles = new Map(this.rotations.map((r) => [r.id, r.angle]));
    this.rotations = rotations.map((r) => ({ ...r, angle: prevAngles.get(r.id) ?? 0 }));
  }

  /** One-shot override of a single row's live angle (radians) -- bypasses setRotations()'s angle-preserving merge. */
  setRotationAngle(id, radians) {
    const r = this.rotations.find((row) => row.id === id);
    if (r) r.angle = radians;
  }

  setOffset(offset) {
    this.offset = offset;
  }

  getView() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
  }

  setView(view) {
    if (!view) return;
    this.camera.position.fromArray(view.position);
    this.controls.target.fromArray(view.target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setViewChangeListener(listener) {
    this.controls.addEventListener("change", listener);
  }

  setAnimating(flag) {
    this.animating = flag;
  }

  /** Current transform phases keyed by stable row id, used to synchronize manual controls when pausing. */
  getRotationAngles() {
    return new Map(this.rotations.map((r) => [r.id, r.angle]));
  }

  /** Subscribe to lightweight live transform-phase snapshots (emitted at most 10 times/second). */
  setTransformStateListener(listener) {
    this._transformStateListener = listener;
  }

  /** Snaps every rotation plane back to angle 0 (the just-generated/just-reset pose). */
  resetRotations() {
    for (const r of this.rotations) r.angle = 0;
  }

  _colorFromLabels() {
    const n = this.basePoints.length;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const label = this.labels ? this.labels[i] % PALETTE.length : 0;
      const [r, g, b] = PALETTE[label];
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    this.pointsGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  /** Snapshot of the current (rotated + translated) N-D points and their live 3D projection,
   *  used to send to the /api/metrics endpoint. */
  getSnapshotForMetrics() {
    return { pointsNd: this._lastTransformed, points3d: this._lastProjected };
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    // Clamp dt so a backgrounded/throttled tab can't produce one huge angle jump on return.
    const dt = this._lastFrameTime != null ? Math.min((now - this._lastFrameTime) / 1000, 0.25) : 0;
    this._lastFrameTime = now;

    if (this.animating) {
      for (const r of this.rotations) r.angle += r.speed * dt;
      if (
        this._transformStateListener &&
        (this._lastTransformStateEmit == null || now - this._lastTransformStateEmit >= 100)
      ) {
        this._lastTransformStateEmit = now;
        this._transformStateListener(this.getRotationAngles());
      }
    }

    if (this.basePoints.length && this.projectionRecipe) {
      const rotated = this.rotations.length ? applyRotations(this.basePoints, this.rotations) : this.basePoints;
      const moved = this.offset.some((v) => v !== 0) ? translate(rotated, this.offset) : rotated;
      const projected = applyProjection(moved, this.projectionRecipe);
      this._updateGeometry(projected);
      this._lastTransformed = moved;
      this._lastProjected = projected;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _updateGeometry(projected) {
    const n = projected.length;
    let positions = this.pointsGeometry.getAttribute("position");
    if (!positions || positions.count !== n) {
      positions = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
      this.pointsGeometry.setAttribute("position", positions);
    }
    for (let i = 0; i < n; i++) {
      positions.setXYZ(i, projected[i][0], projected[i][1], projected[i][2]);
    }
    positions.needsUpdate = true;
    this.pointsGeometry.computeBoundingSphere();

    const edgeCount = this.edges.length;
    if (edgeCount) {
      let linePos = this.lineGeometry.getAttribute("position");
      const needed = edgeCount * 2;
      if (!linePos || linePos.count !== needed) {
        linePos = new THREE.BufferAttribute(new Float32Array(needed * 3), 3);
        this.lineGeometry.setAttribute("position", linePos);
      }
      let k = 0;
      for (const [a, b] of this.edges) {
        linePos.setXYZ(k++, projected[a][0], projected[a][1], projected[a][2]);
        linePos.setXYZ(k++, projected[b][0], projected[b][1], projected[b][2]);
      }
      linePos.needsUpdate = true;
      this.lineGeometry.computeBoundingSphere();
    } else {
      this.lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
    }
  }
}
