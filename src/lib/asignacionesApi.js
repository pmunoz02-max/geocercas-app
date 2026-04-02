// src/lib/asignacionesApi.js
// CANONICO: /api/asignaciones con fallback Bearer si no hay cookie

import { withActiveOrg } from "./withActiveOrg";
import { supabase } from "@/lib/supabaseClient";

// =========================
// AUTH HEADER (CLAVE)
// =========================
async function getAuthHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    if (!token) return {};

    return {
      Authorization: `Bearer ${token}`,
    };
  } catch (e) {
    console.error("[apiFetch] getAuthHeaders error:", e);
    return {};
  }
}

// =========================
// SAFE JSON
// =========================
async function parseJsonSafe(res) {
  const txt = await res.text();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

// =========================
// GENERIC FETCH
// =========================
async function apiFetch(method, body) {
  let url = "/api/asignaciones";

  if (method === "PATCH") {
    url += "?v=asig-patch-02";
  }

  const authHeaders = await getAuthHeaders();

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJsonSafe(res);

  if (!res.ok || payload?.ok === false) {
    const msg =
      payload?.error ||
      payload?.message ||
      `HTTP ${res.status} ${res.statusText}` ||
      "Request failed";

    console.error("[apiFetch] ERROR:", msg, payload);

    return { data: null, error: { message: msg, payload } };
  }

  return { data: payload?.asignacion ?? payload?.data ?? null, error: null };
}

// =========================
// GET BUNDLE
// =========================
async function apiGetBundle(orgId) {
  if (!orgId) {
    return { data: null, error: { message: "missing_org_id" } };
  }

  const query = `?org_id=${encodeURIComponent(orgId)}`;
  const authHeaders = await getAuthHeaders();

  const res = await fetch(`/api/asignaciones${query}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
  });

  const payload = await parseJsonSafe(res);

  if (!res.ok || payload?.ok === false) {
    const msg =
      payload?.error ||
      payload?.message ||
      `HTTP ${res.status} ${res.statusText}` ||
      "Request failed";

    console.error("[apiGetBundle] ERROR:", msg, payload);

    return { data: null, error: { message: msg, payload } };
  }

  return { data: payload?.data ?? null, error: null };
}

// =========================
// EXPORTS
// =========================
export async function getAsignacionesBundle(orgId) {
  return apiGetBundle(orgId);
}

export async function listAsignaciones(orgId) {
  const { data, error } = await apiGetBundle(orgId);
  if (error) return [];
  return Array.isArray(data?.asignaciones) ? data.asignaciones : [];
}

export async function createAsignacion(payload = {}, orgId = null) {
  const result = await apiFetch("POST", withActiveOrg(payload, orgId));

  if (result.error) {
    throw new Error(result.error.message || "Error creating asignacion");
  }

  return result.data;
}

export async function updateAsignacion(id, fields = {}, orgId = null) {
  if (!id) throw new Error("missing_id");

  const updatePayload = withActiveOrg({ id }, orgId);

  for (const key of Object.keys(fields)) {
    if (fields[key] !== undefined) updatePayload[key] = fields[key];
  }

  const response = await apiFetch("PATCH", updatePayload);

  if (response.error) {
    throw new Error(response.error.message || "Error updating asignacion");
  }

  return response.data;
}

export async function toggleAsignacionStatus(id, currentStatus, orgId = null) {
  if (!id) throw new Error("missing_id");

  const newStatus = currentStatus === "active" ? "inactive" : "active";

  const result = await apiFetch(
    "PATCH",
    withActiveOrg({ id, status: newStatus }, orgId)
  );

  if (result.error) {
    throw new Error(result.error.message || "Error toggling asignacion status");
  }

  return result.data;
}

export async function deleteAsignacion(id, orgId = null) {
  if (!id) throw new Error("missing_id");

  const result = await apiFetch(
    "DELETE",
    withActiveOrg({ id }, orgId)
  );

  if (result.error) {
    throw new Error(result.error.message || "Error deleting asignacion");
  }

  return result.data;
}