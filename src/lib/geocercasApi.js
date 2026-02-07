// src/lib/geocercasApi.js
// API canónica DB-driven (sin endpoints /api/*).
// Guarda/edita/elimina geocercas directo en Supabase con RLS.
// Requiere que tu DB asigne org_id y user_id (o valide) vía triggers/RLS.
//
// Uso típico:
//   import { saveGeocerca, deleteGeocerca, listGeocercas } from "@/lib/geocercasApi";
//   await saveGeocerca({ name, polygon_geojson, ... });

import { supabase } from "./supabaseClient";

/**
 * Normaliza un GeoJSON Polygon/MultiPolygon a JSON serializable.
 * Acepta objeto o string JSON.
 */
function normalizeGeoJSON(input) {
  if (!input) return null;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      // Si te llega ya como string válido pero no parseable, lo devolvemos tal cual
      // (Postgres jsonb acepta string solo si se parsea; mejor fallar antes)
      throw new Error("polygon_geojson no es JSON válido");
    }
  }
  return input;
}

/**
 * Construye el payload permitido para la tabla `geocercas`.
 * Ajusta los nombres de columnas si tu esquema difiere.
 */
function buildGeocercaPayload(data) {
  const payload = {
    // Recomendado: columna "name" o "nombre"
    name: data.name ?? data.nombre ?? null,

    // GeoJSON (jsonb)
    polygon_geojson: normalizeGeoJSON(data.polygon_geojson ?? data.geojson ?? data.poligono ?? null),

    // Campos opcionales (ajusta a tu DB)
    color: data.color ?? null,
    notes: data.notes ?? data.notas ?? null,

    // IMPORTANTE:
    // No seteamos org_id ni user_id aquí: debe resolverse por triggers/RLS (canon).
    // Si tu DB exige estos campos explícitos, avísame y lo adaptamos.
  };

  // Limpieza de undefined para evitar errores
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return payload;
}

/**
 * Inserta o actualiza una geocerca.
 * - Si `data.id` existe => UPDATE
 * - Si no => INSERT
 *
 * Retorna la fila guardada.
 */
export async function saveGeocerca(data) {
  if (!data || typeof data !== "object") {
    throw new Error("saveGeocerca: data inválida");
  }

  const payload = buildGeocercaPayload(data);

  // Validación mínima (evita inserts vacíos)
  if (!payload.name) {
    throw new Error("Falta el nombre de la geocerca");
  }
  if (!payload.polygon_geojson) {
    throw new Error("Falta el polígono (polygon_geojson)");
  }

  // Sesión activa requerida
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  if (!sessionData?.session?.user) {
    throw new Error("No hay sesión activa. Vuelve a iniciar sesión.");
  }

  const isUpdate = !!data.id;

  if (isUpdate) {
    const { data: row, error } = await supabase
      .from("geocercas")
      .update(payload)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error) throw error;
    return row;
  }

  const { data: row, error } = await supabase
    .from("geocercas")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return row;
}

/**
 * Lista geocercas visibles por RLS para el usuario actual.
 */
export async function listGeocercas({ limit = 500, orderBy = "created_at", ascending = false } = {}) {
  const { data, error } = await supabase
    .from("geocercas")
    .select("*")
    .order(orderBy, { ascending })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * Elimina geocerca por id (RLS debe permitir).
 */
export async function deleteGeocerca(id) {
  if (!id) throw new Error("deleteGeocerca: id requerido");
  const { error } = await supabase.from("geocercas").delete().eq("id", id);
  if (error) throw error;
  return true;
}
