// src/services/GeofenceService.js
// API-first (NO supabase.from("geocercas") en frontend)
// Mantiene la misma firma de funciones exportadas para evitar romper imports.

import { upsertGeocerca, deleteGeocerca, listGeocercas, getGeocerca } from "../lib/geocercasApi.js";

/**
 * Fetch JSON helper (universal)
 * - credentials: incluye cookie/sesión
 * - cache: no-store para evitar artefactos de cache en preview
 */
async function apiJson(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: body ? JSON.stringify(body) : undefined,
  });

  // intenta leer JSON si existe
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    // si viene texto, lo guardamos como mensaje
    try {
      const text = await res.text();
      data = text ? { message: text } : null;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      `HTTP ${res.status} ${res.statusText || ""}`.trim() ||
      "Request failed";
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

/**
 * Crea geocerca (API-first)
 * Firma mantenida:
 * createGeofence({ org_id, nombre, geojson, activa, visible, personal_ids, asignacion_ids, created_by })
 */
export async function createGeofence({
  org_id,
  nombre,
  geojson,
  activa = true,
  visible = true,
  personal_ids = [],
  asignacion_ids = [],
  created_by,
}) {
  if (!org_id) throw new Error("org_id requerido");
  if (!nombre) throw new Error("nombre requerido");
  if (!geojson) throw new Error("geojson requerido");

  // Upsert por API (tu backend ya lo soporta)
  const row = await upsertGeocerca({
    org_id,
    nombre,
    // Compat: algunos esquemas guardan en geojson/geometry
    geojson,
    geometry: geojson,
    activa,
    visible,
    personal_ids,
    asignacion_ids,
    created_by,
  });

  return row;
}

/**
 * Actualiza geocerca por id (API-first)
 * Mantengo firma updateGeofence(id, patch)
 *
 * Nota: si tu /api/geocercas soporta upsert con "id", esto funciona.
 * Si no, me lo dices y lo ajusto al contrato exacto de tu API (archivo completo).
 */
export async function updateGeofence(id, patch = {}) {
  if (!id) throw new Error("id requerido");
  if (!patch || typeof patch !== "object") throw new Error("patch inválido");

  // Si el patch trae org_id mejor; si no, intentamos resolverlo por API cuando sea posible.
  // (No hacemos supabase directo).
  let org_id = patch.org_id;

  if (!org_id) {
    // Intento “best effort”: si el consumidor puede pasar orgId, mejor.
    // Si no, intentamos leer la geocerca (si tu API lo permite).
    try {
      // getGeocerca({ id, orgId }) requiere orgId, así que solo lo usamos si viene en patch.
      // Si no viene, seguimos sin org_id y dejamos que el backend valide.
      // (Esto evita inventar cosas o romper multi-tenant).
    } catch {
      // ignore
    }
  }

  const payload = {
    id,
    ...(org_id ? { org_id } : {}),
    ...patch,
  };

  // Si el patch trae geojson, también lo duplicamos en geometry para compatibilidad
  if (payload.geojson && !payload.geometry) payload.geometry = payload.geojson;
  if (payload.geometry && !payload.geojson) payload.geojson = payload.geometry;

  const row = await upsertGeocerca(payload);
  return row;
}

export async function setGeofenceVisibility(id, visible) {
  return updateGeofence(id, { visible: !!visible });
}

export async function setGeofenceActive(id, activa) {
  return updateGeofence(id, { activa: !!activa });
}

/**
 * Elimina geocerca (API-first)
 * Firma mantenida removeGeofence(id)
 *
 * IMPORTANTE:
 * Tu geocercasApi.js (según lo que venimos usando) elimina en bulk por nombres_ci.
 * Aquí implemento un delete por id vía endpoint REST:
 *   DELETE /api/geocercas?id=<id>&orgId=<orgId>
 *
 * Si tu backend NO tiene ese contrato aún, dímelo y te doy el archivo completo
 * del endpoint /api/geocercas para soportar DELETE por id de forma multi-tenant.
 */
export async function removeGeofence(id, orgId) {
  if (!id) throw new Error("id requerido");

  // 1) Intento DELETE por id (más directo)
  try {
    const qs = new URLSearchParams();
    qs.set("id", String(id));
    if (orgId) qs.set("orgId", String(orgId));
    await apiJson(`/api/geocercas?${qs.toString()}`, { method: "DELETE" });
    return true;
  } catch (e) {
    // 2) Fallback: si no existe DELETE por id, intenta borrar por nombre_ci
    // Solo si podemos obtener el nombre y el orgId
    if (!orgId) throw e;

    try {
      const row = await getGeocerca({ id, orgId });
      const nombre = row?.nombre;
      if (!nombre) throw e;

      await deleteGeocerca({
        orgId,
        nombres_ci: [String(nombre).trim().toLowerCase()],
      });

      return true;
    } catch {
      throw e;
    }
  }
}

/**
 * Listado de personal (API-first)
 * Endpoint esperado:
 *   GET /api/personal?orgId=<orgId>
 */
export async function listPersonal(orgId) {
  if (!orgId) throw new Error("orgId requerido");
  const qs = new URLSearchParams({ orgId: String(orgId) });
  const data = await apiJson(`/api/personal?${qs.toString()}`, { method: "GET" });
  return data?.rows || data?.data || data || [];
}

/**
 * Listado de asignaciones (API-first)
 * Endpoint esperado:
 *   GET /api/asignaciones?orgId=<orgId>
 */
export async function listAsignaciones(orgId) {
  if (!orgId) throw new Error("orgId requerido");
  const qs = new URLSearchParams({ orgId: String(orgId) });
  const data = await apiJson(`/api/asignaciones?${qs.toString()}`, { method: "GET" });
  return data?.rows || data?.data || data || [];
}
