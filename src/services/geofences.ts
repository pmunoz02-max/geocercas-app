// src/services/geofences.ts
// ============================================================
// Servicio de geocercas: CRUD usando el cliente único de Supabase.
// ============================================================

import supabase from "../supabaseClient"  // ✅ Usa cliente global (no creaClient local)

// ===================== Tipos =====================
export interface Geocerca {
  id: string
  tenant_id: string
  nombre: string
  descripcion?: string | null
  coordenadas: any // GeoJSON (Polygon)
  activa: boolean
  created_at?: string
  updated_at?: string
}

// ===================== Listar geocercas =====================
export async function listGeocercas(): Promise<Geocerca[]> {
  const { data, error } = await supabase
    .from("geocercas")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Error al listar geocercas: ${error.message}`)
  return data as Geocerca[]
}

// ===================== Crear geocerca =====================
export async function createGeocerca(geocerca: Partial<Geocerca>): Promise<Geocerca> {
  const { data, error } = await supabase
    .from("geocercas")
    .insert([geocerca])
    .select()
    .single()

  if (error) throw new Error(`Error al crear geocerca: ${error.message}`)
  return data as Geocerca
}

// ===================== Actualizar geocerca =====================
export async function updateGeocerca(id: string, updates: Partial<Geocerca>): Promise<Geocerca> {
  const { data, error } = await supabase
    .from("geocercas")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) throw new Error(`Error al actualizar geocerca: ${error.message}`)
  return data as Geocerca
}

// ===================== Eliminar geocerca =====================
export async function deleteGeocerca(id: string): Promise<void> {
  const { error } = await supabase
    .from("geocercas")
    .delete()
    .eq("id", id)

  if (error) throw new Error(`Error al eliminar geocerca: ${error.message}`)
}

// ===================== Activar/Desactivar =====================
export async function toggleGeocercaActiva(id: string, activa: boolean): Promise<Geocerca> {
  const { data, error } = await supabase
    .from("geocercas")
    .update({ activa })
    .eq("id", id)
    .select()
    .single()

  if (error) throw new Error(`Error al cambiar estado de geocerca: ${error.message}`)
  return data as Geocerca
}
