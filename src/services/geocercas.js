// src/services/geocercas.js
import { supabase } from "../supabaseClient.js";

/**
 * Lista geocercas completas (incluye geometría) para el mapa.
 */
export async function listGeocercas(orgId) {
  console.log("[geocercas] listGeocercas() orgId:", orgId);

  if (!orgId) {
    console.warn("[geocercas] listGeocercas sin orgId, retorno []");
    return [];
  }

  const { data, error } = await supabase
    .from("geocercas")
    .select(
      `
      id,
      org_id,
      name,
      nombre,
      geom,
      geojson,
      geometry,
      polygon,
      lat,
      lng,
      radius_m,
      active,
      visible,
      created_at
    `
    )
    .eq("org_id", orgId)
    .eq("active", true);

  if (error) {
    console.error("[geocercas] error en listGeocercas:", error);
    throw error;
  }

  console.log(
    "[geocercas] listGeocercas filas:",
    data?.length ?? 0,
    "ejemplo:",
    data && data[0]
  );

  return data ?? [];
}

/**
 * Lista geocercas para la UI (selector múltiple), solo id + nombre.
 */
export async function listGeocercasForUI(orgId) {
  const rows = await listGeocercas(orgId);
  return rows.map((g) => ({
    id: g.id,
    nombre: g.nombre || g.name || "Sin nombre",
  }));
}

// ---------- helpers internos para construir polygon a partir de geom ----------

function normalizeGeom(input) {
  if (!input) return null;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch (e) {
      console.warn("[geocercas] geom string inválido", input);
      return null;
    }
  }
  if (typeof input === "object") return input;
  return null;
}

/**
 * Dado un geom (Feature / Geometry) intenta extraer un anillo principal
 * como array de { lat, lng } compatible con tu columna polygon legacy.
 */
function buildPolygonFromGeom(geomInput) {
  const geom = normalizeGeom(geomInput);
  if (!geom) return null;

  // Feature -> geometry
  const g =
    geom.type === "Feature" && geom.geometry
      ? geom.geometry
      : geom.type === "FeatureCollection" &&
        Array.isArray(geom.features) &&
        geom.features[0]
      ? geom.features[0].geometry
      : geom;

  if (!g || !g.type || !g.coordinates) return null;

  let ring = null;

  if (g.type === "Polygon" && Array.isArray(g.coordinates[0])) {
    ring = g.coordinates[0]; // [[lng,lat], [lng,lat], ...]
  } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates[0])) {
    ring = g.coordinates[0][0]; // primer polígono, primer anillo
  } else {
    return null;
  }

  const out = ring
    .filter(
      (pt) =>
        Array.isArray(pt) &&
        typeof pt[0] === "number" &&
        typeof pt[1] === "number"
    )
    .map(([lng, lat]) => ({ lat, lng }));

  return out.length > 2 ? out : null;
}

/**
 * Crea una nueva geocerca. Se usa desde GeoMap al dibujar.
 * Si llega geom y no llega polygon, construye polygon automáticamente.
 */
export async function createGeocerca(payload) {
  console.log("[geocercas] createGeocerca payload (entrada):", payload);

  const finalPayload = { ...payload };

  // Si tenemos geom pero no polygon, derivamos polygon para compatibilidad legacy
  if (finalPayload.geom && !finalPayload.polygon) {
    const derivedPolygon = buildPolygonFromGeom(finalPayload.geom);
    if (derivedPolygon) {
      finalPayload.polygon = derivedPolygon;
      console.log(
        "[geocercas] createGeocerca → polygon derivado desde geom, puntos:",
        derivedPolygon.length
      );
    }
  }

  const insertPayload = {
    active: true,
    visible: true,
    ...finalPayload,
  };

  const { data, error } = await supabase
    .from("geocercas")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    console.error("[geocercas] error en createGeocerca:", error);
    throw error;
  }

  console.log("[geocercas] createGeocerca OK:", data);
  return data;
}

/**
 * Actualiza una geocerca existente por id.
 * Si el patch trae geom y no trae polygon, también derivamos polygon.
 */
export async function updateGeocerca(id, patch) {
  console.log("[geocercas] updateGeocerca id:", id, "patch (entrada):", patch);

  const finalPatch = { ...patch };

  if (finalPatch.geom && !finalPatch.polygon) {
    const derivedPolygon = buildPolygonFromGeom(finalPatch.geom);
    if (derivedPolygon) {
      finalPatch.polygon = derivedPolygon;
      console.log(
        "[geocercas] updateGeocerca → polygon derivado desde geom, puntos:",
        derivedPolygon.length
      );
    }
  }

  const { data, error } = await supabase
    .from("geocercas")
    .update(finalPatch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[geocercas] error en updateGeocerca:", error);
    throw error;
  }

  console.log("[geocercas] updateGeocerca OK:", data);
  return data;
}

/**
 * Elimina una geocerca (delete duro).
 */
export async function deleteGeocerca(id) {
  console.log("[geocercas] deleteGeocerca id:", id);

  const { error } = await supabase.from("geocercas").delete().eq("id", id);

  if (error) {
    console.error("[geocercas] error en deleteGeocerca:", error);
    throw error;
  }

  console.log("[geocercas] deleteGeocerca OK");
}

/**
 * Suscripción realtime a cambios en geocercas.
 */
export function subscribeGeocercas(callback) {
  const channel = supabase
    .channel("geocercas_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "geocercas" },
      (payload) => {
        console.log("[geocercas] cambio realtime:", payload.eventType, payload);
        callback?.(payload);
      }
    )
    .subscribe((status) => {
      console.log("[geocercas] canal realtime status:", status);
    });

  return () => {
    console.log("[geocercas] unsubscribe canal realtime");
    supabase.removeChannel(channel);
  };
}
