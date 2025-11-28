// src/lib/actividadesApi.js
// API para manejar el catálogo de actividades
// Usa la tabla public.activities:
//   id, tenant_id, name, description, active,
//   hourly_rate (numeric), currency_code (text)

import { supabase } from "../supabaseClient";

/**
 * Lista actividades visibles para el usuario actual.
 * RLS se encarga de filtrar por tenant_id.
 *
 * @param {Object} options
 * @param {boolean} options.includeInactive - Si true, incluye inactivas.
 */
export async function listActividades({ includeInactive = false } = {}) {
  let query = supabase
    .from("activities")
    .select(
      `
      id,
      tenant_id,
      name,
      description,
      active,
      hourly_rate,
      currency_code
    `
    )
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  return { data, error };
}

/**
 * Obtiene una actividad por id.
 */
export async function getActividadById(id) {
  const { data, error } = await supabase
    .from("activities")
    .select(
      `
      id,
      tenant_id,
      name,
      description,
      active,
      hourly_rate,
      currency_code
    `
    )
    .eq("id", id)
    .single();

  return { data, error };
}

/**
 * Crea una actividad nueva.
 *
 * payload mínimo:
 *  {
 *    tenant_id: uuid,
 *    name: string,
 *    description?: string | null,
 *    active?: boolean,
 *    hourly_rate?: number | null,
 *    currency_code?: string | null
 *  }
 */
export async function createActividad(payload) {
  const { data, error } = await supabase
    .from("activities")
    .insert([payload])
    .select(
      `
      id,
      tenant_id,
      name,
      description,
      active,
      hourly_rate,
      currency_code
    `
    )
    .single();

  return { data, error };
}

/**
 * Actualiza una actividad existente.
 *
 * fields puede contener:
 *  {
 *    name?: string,
 *    description?: string | null,
 *    active?: boolean,
 *    hourly_rate?: number | null,
 *    currency_code?: string | null
 *  }
 */
export async function updateActividad(id, fields) {
  const { data, error } = await supabase
    .from("activities")
    .update({
      ...fields,
    })
    .eq("id", id)
    .select(
      `
      id,
      tenant_id,
      name,
      description,
      active,
      hourly_rate,
      currency_code
    `
    )
    .single();

  return { data, error };
}

/**
 * Cambia solo el estado active (activar / desactivar).
 */
export async function toggleActividadActiva(id, active) {
  const { data, error } = await supabase
    .from("activities")
    .update({ active })
    .eq("id", id)
    .select(
      `
      id,
      tenant_id,
      name,
      description,
      active,
      hourly_rate,
      currency_code
    `
    )
    .single();

  return { data, error };
}

/**
 * Elimina una actividad por id.
 */
export async function deleteActividad(id) {
  const { error } = await supabase.from("activities").delete().eq("id", id);

  return { error };
}
