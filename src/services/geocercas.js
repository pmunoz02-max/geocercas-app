// src/services/geocercas.js
// ============================================================
// API-FIRST (NO supabase-js directo en browser para geocercas)
// Este archivo reemplaza el CRUD legacy que usaba supabase.from("geocercas").
// Todo pasa por /api/geocercas (cookie tg_at).
// ============================================================

import {
  listGeocercas as apiListGeocercas,
  getGeocerca as apiGetGeocerca,
  upsertGeocerca as apiUpsertGeocerca,
  deleteGeocerca as apiDeleteGeocerca,
} from "../lib/geocercasApi.js";

/**
 * Lista geocercas completas para el mapa.
 * @param {string} orgId
 * @param {{onlyActive?: boolean}} opts
 */
export async function listGeocercas(orgId, opts = {}) {
  if (!orgId) return [];
  const onlyActive = opts.onlyActive !== false;

  const items = await apiListGeocercas({ orgId, onlyActive });

  // Normaliza a formato que esperan algunos módulos legacy:
  return (items || []).map((g) => ({
    ...g,
    // legacy aliases:
    name: g.nombre ?? g.name ?? g.nombre_ci ?? "Sin nombre",
    active: g.activo ?? g.active ?? true,
  }));
}

/**
 * Lista geocercas para UI (selector múltiple)
 */
export async function listGeocercasForUI(orgId) {
  const rows = await listGeocercas(orgId, { onlyActive: true });
  return rows.map((g) => ({
    id: g.id,
    nombre: g.nombre || g.name || "Sin nombre",
  }));
}

/**
 * Crear geocerca (API-first). Se usa desde mapa o formularios.
 * Debe incluir org_id y nombre al menos.
 */
export async function createGeocerca(payload) {
  if (!payload?.org_id) throw new Error("createGeocerca requiere org_id");
  if (!payload?.nombre && !payload?.name) throw new Error("createGeocerca requiere nombre");

  const nombre = payload.nombre ?? payload.name;
  const nombre_ci = payload.nombre_ci ?? String(nombre).trim().toLowerCase();

  const saved = await apiUpsertGeocerca({
    ...payload,
    nombre,
    nombre_ci,
    // normaliza flags
    activo: payload.activo ?? true,
    activa: payload.activa ?? true,
    visible: payload.visible ?? true,
  });

  return saved;
}

/**
 * Actualizar geocerca (API-first)
 */
export async function updateGeocerca(id, patch) {
  const org_id = patch?.org_id;
  if (!org_id) throw new Error("updateGeocerca requiere patch.org_id");
  if (!id) throw new Error("updateGeocerca requiere id");

  const next = { ...patch, id, org_id };

  // si viene nombre sin nombre_ci, lo derivamos
  if (next.nombre !== undefined && next.nombre_ci === undefined) {
    next.nombre_ci = String(next.nombre).trim().toLowerCase();
  }
  if (next.name !== undefined && next.nombre === undefined) {
    next.nombre = next.name;
    if (next.nombre_ci === undefined) next.nombre_ci = String(next.name).trim().toLowerCase();
  }

  const saved = await apiUpsertGeocerca(next);
  return saved;
}

/**
 * Soft delete (API-first): activo=false
 */
export async function deleteGeocerca(idOrParams) {
  // Compat:
  // - deleteGeocerca(id)  (legacy)
  // - deleteGeocerca({ orgId, id })
  if (typeof idOrParams === "string") {
    throw new Error(
      "deleteGeocerca(id) legacy no es soportado sin orgId. Usa deleteGeocerca({ orgId, id })."
    );
  }

  const orgId = idOrParams?.orgId || idOrParams?.org_id;
  const id = idOrParams?.id;

  if (!orgId) throw new Error("deleteGeocerca requiere orgId");
  if (!id) throw new Error("deleteGeocerca requiere id");

  await apiDeleteGeocerca({ orgId, id });
}

/**
 * Realtime legacy:
 * Antes usaba supabase.channel().
 * En API-first no usamos realtime directo desde el browser para geocercas.
 * Dejamos un "subscribe" seguro que hace polling ligero (opcional).
 *
 * Uso sugerido:
 *   const unsub = subscribeGeocercas(orgId, callback, { intervalMs: 10000 })
 */
export function subscribeGeocercas(orgId, callback, opts = {}) {
  // Backward compatible si llaman subscribeGeocercas(callback)
  if (typeof orgId === "function") {
    callback = orgId;
    orgId = null;
  }

  const intervalMs = Number(opts.intervalMs || 10000);

  let stopped = false;
  let lastSig = null;

  async function tick() {
    if (stopped) return;
    if (!orgId) return;

    try {
      const rows = await apiListGeocercas({ orgId, onlyActive: false });
      const sig = JSON.stringify(
        (rows || []).map((r) => [r.id, r.updated_at || "", r.activo ?? true, r.activa ?? true])
      );

      if (lastSig !== null && sig !== lastSig) {
        callback?.({ eventType: "POLL_CHANGE", rows });
      }
      lastSig = sig;
    } catch (e) {
      // No alert aquí. Solo log.
      console.warn("[subscribeGeocercas] polling error:", e?.message || e);
    }
  }

  // primer tick
  tick();
  const timer = setInterval(tick, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
