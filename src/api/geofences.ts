// src/api/geofences.ts
import { supabase } from "@/lib/supabaseClient";

/** Sólo estas columnas se pueden insertar/actualizar desde cliente */
const ALLOWED_INSERT_COLS = ["name", "polygon_geojson", "org_id", "active", "description"] as const;
type AllowedInsertKey = (typeof ALLOWED_INSERT_COLS)[number];

function pickAllowed<T extends Record<string, any>>(src: T): Pick<T, AllowedInsertKey> {
  const out: any = {};
  for (const k of ALLOWED_INSERT_COLS) {
    if (k in src && src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

/** Convierte una fila a Feature para Leaflet */
function rowToFeature(row: any) {
  if (row?.geojson && typeof row.geojson === "object") return row.geojson;

  const geometry = row?.polygon_geojson ?? null;
  return {
    type: "Feature",
    geometry,
    properties: {
      id: row?.id,
      name: row?.name,
      org_id: row?.org_id,
      active: row?.active ?? true,
      created_at: row?.created_at ?? null,
      updated_at: row?.updated_at ?? null,
    },
  };
}

type SaveParams = {
  name: string;
  /** Geometry (Polygon/MultiPolygon). NO pases Feature completo aquí. */
  polygonGeoJSON: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  orgId: string;
  description?: string;
  active?: boolean;
};

/** INSERT: NO enviar bbox/geojson/geom; los llena el servidor. */
export async function saveGeofence({
  name,
  polygonGeoJSON,
  orgId,
  description,
  active = true,
}: SaveParams) {
  if (!orgId) throw new Error("orgId es obligatorio.");
  if (!polygonGeoJSON) throw new Error("polygonGeoJSON es obligatorio.");

  const payload = pickAllowed({
    name: name || "Geocerca",
    polygon_geojson: polygonGeoJSON,
    org_id: orgId,
    active,
    description,
    // OJO: NO incluimos bbox/geojson/geom/created_at/updated_at
  });

  const { data, error } = await supabase
    .from("geofences")
    .insert(payload, { defaultToNull: false }) // <== clave para NO enviar undefined como null
    .select("id, name, org_id, active, polygon_geojson, created_at, updated_at, geojson")
    .single();

  if (error) {
    console.error("Error guardando geocerca:", error);
    throw error;
  }
  return rowToFeature(data);
}

export async function fetchGeofencesByOrg(orgId: string) {
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("geofences")
    .select("id, name, org_id, active, polygon_geojson, created_at, updated_at, geojson")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error cargando geocercas:", error);
    throw error;
  }
  return (data ?? []).map(rowToFeature);
}

export async function deleteGeofence(id: string) {
  const { error } = await supabase.from("geofences").delete().eq("id", id);
  if (error) {
    console.error("Error eliminando geocerca:", error);
    throw error;
  }
  return true;
}

export async function updateGeofenceMeta(
  id: string,
  fields: Partial<Pick<SaveParams, "name" | "active" | "description">>
) {
  const allowed = pickAllowed(fields as any);
  if (Object.keys(allowed).length === 0) return null;

  const { data, error } = await supabase
    .from("geofences")
    .update(allowed, { defaultToNull: false })
    .eq("id", id)
    .select("id, name, org_id, active, polygon_geojson, created_at, updated_at, geojson")
    .single();

  if (error) {
    console.error("Error actualizando geocerca:", error);
    throw error;
  }
  return rowToFeature(data);
}
