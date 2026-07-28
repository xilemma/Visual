const JSON_HEADERS = { "Content-Type": "application/json" };

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  return res.json();
}

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  return res.json();
}

async function extractError(res) {
  try {
    const body = await res.json();
    if (body && body.detail) return String(body.detail);
  } catch (e) {
    // response wasn't JSON; fall through
  }
  return `Request failed with status ${res.status}`;
}

export const api = {
  getStructures: () => getJSON("/api/structures"),
  getProjections: () => getJSON("/api/projections"),
  generate: (structure_type, dimension, params) =>
    postJSON("/api/generate", { structure_type, dimension, params }),
  project: (method, dimension, points, params) =>
    postJSON("/api/project", { method, dimension, points, params }),
  metrics: (points_nd, points_3d, options) =>
    postJSON("/api/metrics", { points_nd, points_3d, options: options || {} }),
};
