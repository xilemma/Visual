// N-D math mirror of ndstudio/projections/methods.py — keep formulas identical
// so that client-side per-frame rotation + projection (needed for smooth
// animation) matches the Python reference used in tests.

export function rotatePlane(points, i, j, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const out = new Array(points.length);
  for (let p = 0; p < points.length; p++) {
    const row = points[p];
    const copy = row.slice();
    const xi = row[i];
    const xj = row[j];
    copy[i] = xi * c - xj * s;
    copy[j] = xi * s + xj * c;
    out[p] = copy;
  }
  return out;
}

export function applyRotations(basePoints, rotations, t) {
  let pts = basePoints;
  for (const r of rotations) {
    const theta = r.speed * t;
    pts = rotatePlane(pts, r.plane[0], r.plane[1], theta);
  }
  return pts;
}

export function applyMatrixProjection(points, matrix, mean) {
  return points.map((p) => {
    const out = [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      let sum = 0;
      const row = matrix[r];
      for (let c = 0; c < p.length; c++) {
        const centered = mean ? p[c] - mean[c] : p[c];
        sum += row[c] * centered;
      }
      out[r] = sum;
    }
    return out;
  });
}

// Mirrors perspective_project in methods.py: collapse axes n-1..3 in turn.
export function applyPerspective(points, cameraDistance) {
  return points.map((p) => {
    const current = p.slice();
    const n = current.length;
    for (let axis = n - 1; axis >= 3; axis--) {
      const w = current[axis];
      const factor = cameraDistance / (cameraDistance - w);
      for (let a = 0; a < axis; a++) current[a] *= factor;
    }
    return [current[0] || 0, current[1] || 0, current[2] || 0];
  });
}

// Mirrors stereographic_project in methods.py.
export function applyStereographic(points, poleAxis, radius) {
  return points.map((p) => {
    const n = p.length;
    const pole = poleAxis < 0 ? n - 1 : poleAxis;
    const w = p[pole];
    const denom = radius - w;
    const out = [];
    for (let i = 0; i < n; i++) {
      if (i === pole) continue;
      out.push((radius * p[i]) / denom);
    }
    while (out.length < 3) out.push(0);
    return [out[0], out[1], out[2]];
  });
}

export function applyProjection(points, recipe) {
  if (!points.length) return [];
  switch (recipe.kind) {
    case "matrix":
      return applyMatrixProjection(points, recipe.matrix, recipe.mean);
    case "perspective":
      return applyPerspective(points, recipe.camera_distance);
    case "stereographic":
      return applyStereographic(points, recipe.pole_axis, recipe.radius);
    default:
      throw new Error(`Unknown projection kind: ${recipe.kind}`);
  }
}
