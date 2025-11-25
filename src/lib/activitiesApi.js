// src/lib/activitiesApi.js
// API de Actividades para App Geocercas

import { supabase } from "../supabaseClient";

/**
 * Devuelve el usuario actual (auth).
 */
async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("No hay usuario autenticado");
  return user;
}

/**
 * Obtiene el tenant_id / org_id activo desde my_org_ids.
 * Usamos org_id como tenant_id (según tu equivalencia).
 */
async function getCurrentTenantId() {
  const { data, error } = await supabase
    .from("my_org_ids")
    .select("org_id")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error leyendo my_org_ids:", error);
    throw new Error("No se pudo obtener la organización activa");
  }

  if (!data || !data.org_id) {
    throw new Error("El usuario no tiene una organización activa (my_org_ids vacío)");
  }

  // tenant_id = org_id
  return data.org_id;
}

/**
 * Lista actividades del tenant actual.
 * Por defecto solo devuelve activas (active = true).
 * Si includeInactive = true, trae todas.
 */
export async function listActivities({ includeInactive = false } = {}) {
  const tenantId = await getCurrentTenantId();

  let query = supabase
    .from("activities")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error listActivities:", error);
    throw error;
  }

  return data || [];
}

/**
 * Crea una nueva actividad para el tenant actual.
 */
export async function createActivity({ name, active = true }) {
  if (!name || !name.trim()) {
    throw new Error("El nombre de la actividad es obligatorio");
  }

  const tenantId = await getCurrentTenantId();
  const user = await getCurrentUser();
  const nowIso = new Date().toISOString();

  const insertRow = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    name: name.trim(),
    active: !!active,
    created_at: nowIso,
    created_by: user.id,
  };

  // Si tu tabla activities no tiene created_at / created_by,
  // estos campos extra simplemente los ignorará PostgREST.
  const { data, error } = await supabase
    .from("activities")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error createActivity:", error);
    throw error;
  }

  return data;
}

/**
 * Actualiza una actividad existente.
 */
export async function updateActivity(id, patch) {
  if (!id) throw new Error("updateActivity requiere id");

  const updateRow = {};
  if (typeof patch.name !== "undefined") {
    updateRow.name = patch.name?.trim() || null;
  }
  if (typeof patch.active !== "undefined") {
    updateRow.active = !!patch.active;
  }

  if (Object.keys(updateRow).length === 0) {
    throw new Error("No hay campos que actualizar en updateActivity");
  }

  const { data, error } = await supabase
    .from("activities")
    .update(updateRow)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error updateActivity:", error);
    throw error;
  }

  return data;
}

/**
 * Alterna el estado activo/inactivo de la actividad.
 */
export async function toggleActivity(id) {
  if (!id) throw new Error("toggleActivity requiere id");

  const { data: current, error: errSelect } = await supabase
    .from("activities")
    .select("active")
    .eq("id", id)
    .maybeSingle();

  if (errSelect) {
    console.error("Error leyendo activities en toggleActivity:", errSelect);
    throw errSelect;
  }

  if (!current) throw new Error("Actividad no encontrada");

  const { data, error } = await supabase
    .from("activities")
    .update({ active: !current.active })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error toggleActivity:", error);
    throw error;
  }

  return data;
}

/**
 * "Eliminar" actividad: hacemos soft-delete marcando active = false.
 * Así no rompemos llaves foráneas en activity_assignments.
 */
export async function deleteActivity(id) {
  if (!id) throw new Error("deleteActivity requiere id");
  return updateActivity(id, { active: false });
}
