// src/lib/geofencesApi.js
// API-first (server-owned) - Geofences v1 ctx-org
// Blindaje: NUNCA enviar columnas computadas / generated (bbox, geom, audit)

function getJsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-Api-Version": "geofences-api-v1-ctx-org-server-owned",
    ...extra,
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestJson(url, { method = "GET", body = null, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: getJsonHeaders(headers),
    credentials: "include",
    body: body ? JSON.stringify(body) : null,
  });

  const txt = await res.text();
  const data = txt ? safeJsonParse(txt) : null;

  if (!res.ok || (data && data.ok === false)) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data || { ok: false, error: `HTTP ${res.status}`, details: txt };
    throw err;
  }

  return data;
}

const STRIP_FIELDS = new Set([
  // generated/computed
  "bbox",
  "geom",
  // audit
  "created_at",
  "updated_at",
  "deleted_at",
  "revoked_at",
  "created_by",
  "updated_by",
  // tenancy/ownership (server ctx)
  "org_id",
  "tenant_id",
  "user_id",
  "owner_id",
  "usuario_id",
  // bridge (server-owned)
  "source_geocerca_id",
]);

function stripComputedFields(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const k of Object.keys(out)) {
    if (STRIP_FIELDS.has(k)) delete out[k];
  }
  return out;
}

export async function listGeofences({ orgId = null, onlyActive = true, limit = 500 } = {}) {
  const params = new URLSearchParams();
  params.set("action", "list");
  params.set("onlyActive", String(!!onlyActive));
  params.set("limit", String(limit));
  if (orgId) params.set("orgId", String(orgId)); // compat (ctx manda)
  const data = await requestJson(`/api/geofences?${params.toString()}`, { method: "GET" });
  return data?.items || [];
}

export async function getGeofence({ id, orgId = null } = {}) {
  if (!id) throw new Error("id requerido");
  const params = new URLSearchParams();
  params.set("action", "get");
  params.set("id", String(id));
  if (orgId) params.set("orgId", String(orgId));
  const data = await requestJson(`/api/geofences?${params.toString()}`, { method: "GET" });
  return data?.item || null;
}

export async function upsertGeofence(payload = {}) {
  const clean = stripComputedFields(payload);
  const data = await requestJson(`/api/geofences`, {
    method: "POST",
    body: { action: "upsert", ...clean },
  });

  // api/geofences.js retorna item (y también items[])
  if (data?.item) return data.item;
  if (Array.isArray(data?.items) && data.items.length) return data.items[0];
  return null;
}

export async function deleteGeofence({ orgId = null, id = null } = {}) {
  if (!id) throw new Error("deleteGeofence: requiere id");
  const payload = { action: "delete", id: String(id) };
  if (orgId) payload.orgId = String(orgId);
  const data = await requestJson(`/api/geofences`, { method: "POST", body: payload });
  return data?.ok === true;
}