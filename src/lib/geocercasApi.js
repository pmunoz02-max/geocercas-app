// src/lib/geocercasApi.js
// ============================================================
// API-FIRST client for /api/geocercas
// Contrato canónico:
// - Si HTTP es OK → la operación fue exitosa
// - El frontend NO infiere error por body vacío
// ============================================================

function pickErrorMessage(payload) {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  return (
    payload.error ||
    payload.message ||
    payload.detail ||
    payload.hint ||
    (Array.isArray(payload.errors)
      ? payload.errors.map((e) => e.message || e).join(" | ")
      : null) ||
    null
  );
}

async function requestJson(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get("content-type") || "";
  let payload = null;

  try {
    if (ct.includes("application/json")) payload = await res.json();
    else payload = await res.text();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg =
      pickErrorMessage(payload) ||
      `HTTP ${res.status} ${res.statusText || ""}`.trim() ||
      "Request failed";

    const err = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    err.url = url;
    throw err;
  }

  return payload; // puede ser null, string, objeto, etc.
}

function normalizeOrgId(input) {
  return (
    input?.orgId ||
    input?.org_id ||
    input?.org ||
    input?.tenant_id ||
    input?.tenantId ||
    null
  );
}

function normalizeNombre(input) {
  return input?.nombre || input?.name || input?.title || null;
}

function normalizeNombreCi(nombre, fallback) {
  if (typeof fallback === "string" && fallback.trim())
    return fallback.trim().toLowerCase();
  return String(nombre || "").trim().toLowerCase();
}

function buildGeocercasUrl(base, orgId, extra = {}) {
  const qs = new URLSearchParams();
  if (orgId) qs.set("orgId", String(orgId));
  Object.entries(extra).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

/**
 * List
 */
export async function listGeocercas({ orgId, onlyActive = true } = {}) {
  if (!orgId) return [];
  const url = buildGeocercasUrl("/api/geocercas", orgId, {
    onlyActive: String(!!onlyActive),
  });
  const data = await requestJson(url, { method: "GET" });

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

/**
 * Get one
 */
export async function getGeocerca({ id, orgId } = {}) {
  if (!id) throw new Error("getGeocerca requiere id");
  if (!orgId) throw new Error("getGeocerca requiere orgId");
  const url = buildGeocercasUrl("/api/geocercas", orgId, { id });
  const data = await requestJson(url, { method: "GET" });
  return data?.row || data?.data || data;
}

/**
 * Upsert (CANÓNICO)
 */
export async function upsertGeocerca(payload = {}) {
  const orgId = normalizeOrgId(payload);
  const nombre = normalizeNombre(payload);

  if (!orgId) throw new Error("Falta orgId en upsertGeocerca()");
  if (!nombre) throw new Error("Falta nombre en upsertGeocerca()");

  const nombre_ci = normalizeNombreCi(nombre, payload?.nombre_ci);

  const geojson =
    payload.geojson ??
    payload.geometry ??
    payload.geom ??
    payload.geo ??
    null;

  const activa = payload.activa ?? payload.active ?? payload.activo ?? true;
  const visible = payload.visible ?? true;

  const body = {
    ...payload,
    orgId,
    org_id: orgId,
    nombre,
    name: nombre,
    nombre_ci,
    geojson,
    geometry: geojson,
    geom: geojson,
    activa,
    activo: activa,
    active: activa,
    visible,
  };

  const url = buildGeocercasUrl("/api/geocercas", orgId);

  const data = await requestJson(url, { method: "POST", body });

  // 🔒 CONTRATO FUERTE:
  // Si no hubo error HTTP → el guardado fue exitoso
  return (
    data?.row ||
    data?.data ||
    data || {
      ok: true,
      orgId,
      nombre,
      nombre_ci,
    }
  );
}

/**
 * Delete
 */
export async function deleteGeocerca({ orgId, id, nombres_ci } = {}) {
  if (!orgId) throw new Error("deleteGeocerca requiere orgId");

  if (id) {
    const url = buildGeocercasUrl("/api/geocercas", orgId, { id });
    return await requestJson(url, { method: "DELETE" });
  }

  if (Array.isArray(nombres_ci) && nombres_ci.length) {
    const url = buildGeocercasUrl("/api/geocercas", orgId);
    return await requestJson(url, {
      method: "POST",
      body: { orgId, org_id: orgId, delete: true, nombres_ci },
    });
  }

  throw new Error("deleteGeocerca requiere id o nombres_ci");
}
