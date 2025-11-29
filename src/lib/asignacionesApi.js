// src/lib/asignacionesApi.js

import { supabase } from "../supabaseClient";

// Obtener todas las asignaciones visibles para la organización del usuario
export async function getAsignaciones() {
  const {
    data: sessionData,
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error("[getAsignaciones] Error sesión:", sessionError);
    return { data: null, error: sessionError };
  }

  const user = sessionData.session?.user;
  if (!user) {
    return { data: [], error: null };
  }

  const orgId = user.user_metadata?.org_id;
  if (!orgId) {
    console.warn("[getAsignaciones] No hay org_id en metadata del usuario");
    return { data: [], error: null };
  }

  // SELECT CORRECTO Y ESTÁNDAR
  const { data, error } = await supabase
    .from("asignaciones")
    .select(`
      id,
      personal_id,
      geocerca_id,
      activity_id,
      start_time,
      end_time,
      status,
      frecuencia_envio_sec,
      org_id,
      is_deleted,
      personal:personal_id(
        id,
        nombre,
        apellido,
        email
      ),
      geocerca:geocerca_id(
        id,
        nombre
      ),
      activity:activity_id(
        id,
        nombre
      )
    `)
    .eq("org_id", orgId)
    .eq("is_deleted", false)
    .order("start_time", { ascending: true });

  return { data, error };
}

// Crear asignación
export async function createAsignacion(asignacion) {
  const { data, error } = await supabase
    .from("asignaciones")
    .insert([asignacion])
    .select("*");

  return { data, error };
}

// Actualizar asignación
export async function updateAsignacion(id, datos) {
  const { data, error } = await supabase
    .from("asignaciones")
    .update(datos)
    .eq("id", id)
    .select("*");

  return { data, error };
}

// MARCAR como eliminada (soft delete)
export async function deleteAsignacion(id) {
  const { error } = await supabase
    .from("asignaciones")
    .update({ is_deleted: true })
    .eq("id", id);

  return { error };
}
