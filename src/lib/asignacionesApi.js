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
  const result = await apiFetch("POST", withActiveOrg(payload, orgId));
  // Throw if not ok or method_not_allowed
  if (result.error) {
    const code = result.error.payload?.error || result.error.payload?.message;
    if (code === "method_not_allowed") {
      throw new Error("POST /api/asignaciones: method_not_allowed");
    }
    throw new Error(result.error.message || "Error creating asignacion");
  }
  return result.data;
}

// Actualiza campos de una asignación existente
export async function updateAsignacion(id, fields = {}) {
  if (!id) return { data: null, error: { message: "missing_id" } };
  return apiFetch("PATCH", { id, ...fields });
}

// Cambia el estado activa/inactiva de una asignación
export async function toggleAsignacionStatus(id, currentStatus, orgId = null) {
  if (!id) throw new Error("missing_id");
  // Solo acepta 'active' o 'inactive' para el backend
  const newStatus = currentStatus === "active" ? "inactive" : "active";
  const result = await apiFetch("PATCH", { id, status: newStatus, org_id: orgId });
  if (result.error) {
    throw new Error(result.error.message || "Error toggling asignacion status");
  }
  return result.data;
}

// Eliminación lógica (is_deleted=true)
export async function deleteAsignacion(id) {
  if (!id) return { data: null, error: { message: "missing_id" } };
  return apiFetch("DELETE", { id });
}


