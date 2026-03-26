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

export async function getAsignacionesBundle(orgId = null) {
  const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  const res = await fetch(`/api/asignaciones${query}`, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });

  const payload = await parseJsonSafe(res);
  if (!res.ok || payload?.ok === false) {
    const msg = payload?.error || `HTTP ${res.status} ${res.statusText}` || "Request failed";
    return { data: null, error: { message: msg } };
  }
  return { data: payload?.data ?? null, error: null };
}

import { withActiveOrg } from "./withActiveOrg";

export async function createAsignacion(payload = {}, orgId = null) {
  return apiFetch("POST", withActiveOrg(payload, orgId));
}

export async function updateAsignacion(id, patch = {}, orgId = null) {
  return apiFetch("PATCH", withActiveOrg({ id, patch }, orgId));
}

export async function deleteAsignacion(id, orgId = null) {
  return apiFetch("DELETE", withActiveOrg({ id }, orgId));
}
