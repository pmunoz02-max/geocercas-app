// Reexporta helper de catálogo de geocercas
export { getGeocercasCatalog } from "./geocercasCatalog";
// src/lib/asignacionesApi.js
// CANONICO: solo /api/asignaciones (cookie tg_at)

import { withActiveOrg } from "./withActiveOrg";

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
    const msg =
      payload?.error ||
      payload?.message ||
      `HTTP ${res.status} ${res.statusText}` ||
      "Request failed";

    return { data: null, error: { message: msg, payload } };
  }

  return { data: payload?.data ?? null, error: null };
}

async function apiGetBundle(orgId) {
  if (!orgId) {
    return { data: null, error: { message: "missing_org_id" } };
  }

  const query = `?org_id=${encodeURIComponent(orgId)}`;

  const res = await fetch(`/api/asignaciones${query}`, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });

  const payload = await parseJsonSafe(res);

  if (!res.ok || payload?.ok === false) {
    const msg =
      payload?.error ||
      payload?.message ||
      `HTTP ${res.status} ${res.statusText}` ||
      "Request failed";

    return { data: null, error: { message: msg, payload } };
  }

  return { data: payload?.data ?? null, error: null };
}

// Devuelve el bundle completo: asignaciones + catálogos
export async function getAsignacionesBundle(orgId) {
  return apiGetBundle(orgId);
}

// Alias útil si alguna página espera "listAsignaciones"
export async function listAsignaciones(orgId) {
  const { data, error } = await apiGetBundle(orgId);
  if (error) return [];
  return Array.isArray(data?.asignaciones) ? data.asignaciones : [];
}


export async function createAsignacion(payload = {}, orgId = null) {
  return apiFetch("POST", withActiveOrg(payload, orgId));
}

// Actualiza campos de una asignación existente
export async function updateAsignacion(id, fields = {}) {
  if (!id) return { data: null, error: { message: "missing_id" } };
  return apiFetch("PATCH", { id, ...fields });
}

// Cambia el estado activa/inactiva de una asignación
export async function toggleAsignacionStatus(id, currentStatus) {
  if (!id) return { data: null, error: { message: "missing_id" } };
  const newStatus =
    currentStatus === "activa" || currentStatus === "active"
      ? "inactiva"
      : "activa";
  return apiFetch("PATCH", { id, status: newStatus });
}

// Eliminación lógica (is_deleted=true)
export async function deleteAsignacion(id) {
  if (!id) return { data: null, error: { message: "missing_id" } };
  return apiFetch("DELETE", { id });
}


