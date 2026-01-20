// src/services/geofences.ts
// ============================================================
// Servicio de Geocercas (SaaS multi-tenant): SIEMPRE via /api/geocercas
// - No usar supabase-js directo en el browser para geocercas
// - Auth por cookie HttpOnly (tg_at)
// - Soft delete DB-first: activo=false
// ============================================================

// IMPORTANTE:
// Este servicio reemplaza el CRUD legacy que usaba supabase-js directo.
// Debe usarse desde UI pasando orgId (currentOrg.id).

// geocercasApi está en JS, pero se puede importar en TS sin problema.
// Si tu linter TS se queja, añade allowJs en tsconfig o agrega un d.ts.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import {
  listGeocercas as apiListGeocercas,
  getGeocerca as apiGetGeocerca,
  upsertGeocerca as apiUpsertGeocerca,
  deleteGeocerca as apiDeleteGeocerca,
} from "../lib/geocercasApi.js";

export interface Geocerca {
  id: string;
  org_id: string;
  nombre: string;
  nombre_ci?: string | null;
  descripcion?: string | null;
  geojson?: any;
  geometry?: any;
  bbox?: any;
  lat?: number | null;
  lng?: number | null;
  radius_m?: number | null;
  visible?: boolean;
  activo: boolean;
  activa?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type ListGeocercasOpts = {
  onlyActive?: boolean;
};

export async function listGeocercas(orgId: string, opts: ListGeocercasOpts = {}): Promise<Geocerca[]> {
  if (!orgId) return [];
  const items = await apiListGeocercas({ orgId, onlyActive: opts.onlyActive !== false });
  return (items || []) as Geocerca[];
}

export async function getGeocerca(orgId: string, id: string): Promise<Geocerca | null> {
  if (!orgId || !id) return null;
  const row = await apiGetGeocerca({ orgId, id });
  return (row || null) as Geocerca | null;
}

// Crear = upsert sin id
export async function createGeocerca(orgId: string, geocerca: Partial<Geocerca>): Promise<Geocerca> {
  if (!orgId) throw new Error("orgId requerido");
  const payload: any = {
    org_id: orgId,
    nombre: geocerca.nombre,
    nombre_ci: geocerca.nombre_ci ?? (geocerca.nombre ? String(geocerca.nombre).trim().toLowerCase() : undefined),
    descripcion: geocerca.descripcion ?? null,
    geojson: geocerca.geojson ?? geocerca.geometry ?? null,
    geometry: geocerca.geometry ?? geocerca.geojson ?? undefined,
    bbox: geocerca.bbox ?? undefined,
    lat: geocerca.lat ?? undefined,
    lng: geocerca.lng ?? undefined,
    radius_m: geocerca.radius_m ?? undefined,
    visible: geocerca.visible ?? true,
    activo: geocerca.activo ?? true,
    activa: geocerca.activa ?? true,
  };

  const saved = await apiUpsertGeocerca(payload);
  return saved as Geocerca;
}

// Actualizar = upsert con id
export async function updateGeocerca(id: string, orgId: string, updates: Partial<Geocerca>): Promise<Geocerca> {
  if (!orgId) throw new Error("orgId requerido");
  if (!id) throw new Error("id requerido");

  const payload: any = {
    id,
    org_id: orgId,
    ...(updates.nombre !== undefined ? { nombre: updates.nombre } : {}),
    ...(updates.nombre_ci !== undefined
      ? { nombre_ci: updates.nombre_ci }
      : updates.nombre !== undefined
      ? { nombre_ci: String(updates.nombre).trim().toLowerCase() }
      : {}),
    ...(updates.descripcion !== undefined ? { descripcion: updates.descripcion } : {}),
    ...(updates.geojson !== undefined ? { geojson: updates.geojson, geometry: updates.geojson } : {}),
    ...(updates.geometry !== undefined ? { geojson: updates.geometry, geometry: updates.geometry } : {}),
    ...(updates.bbox !== undefined ? { bbox: updates.bbox } : {}),
    ...(updates.lat !== undefined ? { lat: updates.lat } : {}),
    ...(updates.lng !== undefined ? { lng: updates.lng } : {}),
    ...(updates.radius_m !== undefined ? { radius_m: updates.radius_m } : {}),
    ...(updates.visible !== undefined ? { visible: updates.visible } : {}),
    ...(updates.activo !== undefined ? { activo: updates.activo } : {}),
    ...(updates.activa !== undefined ? { activa: updates.activa } : {}),
  };

  const saved = await apiUpsertGeocerca(payload);
  return saved as Geocerca;
}

// Soft delete DB-first: activo=false
export async function deleteGeocerca(orgId: string, id: string): Promise<void> {
  if (!orgId) throw new Error("orgId requerido");
  if (!id) throw new Error("id requerido");
  await apiDeleteGeocerca({ orgId, id });
}

export async function toggleGeocercaActiva(orgId: string, id: string, activa: boolean): Promise<Geocerca> {
  // Usa 'activo' como flag de soft delete y mantiene 'activa' si la UI la usa como flag de habilitada.
  // - activa=true => activo=true y activa=true
  // - activa=false => activo=true y activa=false
  return await updateGeocerca(id, orgId, { activa, activo: true });
}
