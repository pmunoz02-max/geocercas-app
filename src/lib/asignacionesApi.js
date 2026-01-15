// src/lib/asignacionesApi.js
// CANONICO: solo /api/asignaciones (cookie tg_at)

async function parseJsonSafe(res) {
  const txt = await res.text();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function apiFetch(method, body) {
  const res = await fetch("/api/asignaciones", {
    method,
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJsonSafe(res);
  if (!res.ok || payload?.ok === false) {
    const msg = payload?.error || `HTTP ${res.status} ${res.statusText}` || "Request failed";
    return { data: null, error: { message: msg } };
  }
  return { data: payload?.data ?? null, error: null };
}

export async function getAsignacionesBundle() {
  return apiFetch("GET");
}

export async function createAsignacion(payload) {
  return apiFetch("POST", payload);
}

export async function updateAsignacion(id, patch) {
  return apiFetch("PATCH", { id, patch });
}

export async function deleteAsignacion(id) {
  return apiFetch("DELETE", { id });
}
