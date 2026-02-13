// src/lib/geocercasApi.js
// API-first (server-owned) - Geocercas v9 ctx-org
// Blindaje: NUNCA enviar columnas computadas / generated (ej: nombre_ci)

function getJsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-Api-Version": "geocercas-api-v9-ctx-org-server-owned",
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

/**
 * Columnas que NO se deben enviar nunca porque son server-owned / generated
 * (evita 500 por "cannot insert a non-DEFAULT value into column nombre_ci")
 */
const STRIP_FIELDS = new Set([
  "nombre_ci",
  "created_at",
  "updated_at",
  "deleted_at",
  "revoked_at",
  "created_by",
  "updated_by",
]);

function stripComputedFields(obj) {
  if (!obj || typeof obj !== "object") return obj;

  // shallow clone
  const out = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const k of Object.keys(out)) {
    if (STRIP_FIELDS.has(k)) delete out[k];
  }

  return out;
}

/**
 * Lista geocercas (API server-owned). orgId es opcional (ctx org manda),
 * pero lo dejamos para compatibilidad.
 */
export async function listGeocercas({ orgId = null, onlyActive = true, limit = 200 } = {}) {
  const params = new URLSearchParams();
  params.set("action", "list");
  params.set("onlyActive", String(!!onlyActive));
  params.set("limit", String(limit));

  // compat: si tu API acepta orgId por query (aunque ctx manda)
  if (orgId) params.set("orgId", String(orgId));

  const data = await requestJson(`/api/geocercas?${params.toString()}`, { method: "GET" });
  return data?.items || [];
}

export async function getGeocerca({ id, orgId = null } = {}) {
  if (!id) throw new Error("id requerido");
  const params = new URLSearchParams();
  params.set("action", "get");
  params.set("id", String(id));
  if (orgId) params.set("orgId", String(orgId));

  const data = await requestJson(`/api/geocercas?${params.toString()}`, { method: "GET" });
  return data?.item || null;
}

/**
 * Upsert geocerca:
 * - NO enviar nombre_ci (DB lo calcula)
 * - Si viene, se elimina aquí (guard rail universal)
 */
export async function upsertGeocerca(payload = {}) {
  const clean = stripComputedFields(payload);

  // Extra hardening: si alguien nos manda nombre_ci igual lo borramos
  if (payload && payload.nombre_ci !== undefined) {
    // Log útil en preview (sin romper)
    try {
      console.warn("[geocercasApi] nombre_ci stripped (server-owned).");
    } catch {}
  }

  const data = await requestJson(`/api/geocercas`, {
    method: "POST",
    body: { action: "upsert", ...clean },
  });

  return data?.item || null;
}

/**
 * Delete geocerca:
 * - recomendado: por nombres_ci (server-owned)
 * - NO aceptar nombre_ci singular (legacy), pero mantenemos compat
 */
export async function deleteGeocerca({ orgId = null, id = null, nombres_ci = null, nombre_ci = null } = {}) {
  const payload = { action: "delete" };

  if (orgId) payload.orgId = String(orgId);

  // preferimos nombres_ci (bulk)
  if (Array.isArray(nombres_ci) && nombres_ci.length) {
    payload.nombres_ci = nombres_ci.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
  } else if (nombre_ci) {
    // compat legacy: convertir a nombres_ci
    payload.nombres_ci = [String(nombre_ci).trim().toLowerCase()].filter(Boolean);
  } else if (id) {
    payload.id = String(id);
  } else {
    throw new Error("deleteGeocerca: requiere id o nombres_ci");
  }

  const data = await requestJson(`/api/geocercas`, { method: "POST", body: payload });
  return data?.ok === true;
}
