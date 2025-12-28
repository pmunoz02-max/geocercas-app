// src/lib/asignacionesApi.js
// VERSION CANONICA: usa org_people_id

import { supabase } from "../supabaseClient";

export async function getAsignaciones() {
  const { data, error } = await supabase
    .from("asignaciones")
    .select(
      `
      id,
      org_id,
      org_people_id,
      geocerca_id,
      activity_id,
      start_time,
      end_time,
      status,
      frecuencia_envio_sec,
      is_deleted,
      org_people:org_people_id (
        id,
        people:person_id (
          nombre,
          apellido,
          email
        )
      ),
      geocerca:geocerca_id (
        id,
        nombre
      ),
      activity:activity_id (
        id,
        name
      )
    `
    )
    .eq("is_deleted", false)
    .order("start_time", { ascending: true });

  return { data: data || [], error };
}

export async function createAsignacion(payload) {
  const { data, error } = await supabase
    .from("asignaciones")
    .insert(payload)
    .select("*");
  return { data, error };
}

export async function updateAsignacion(id, patch) {
  const { data, error } = await supabase
    .from("asignaciones")
    .update(patch)
    .eq("id", id)
    .select("*");
  return { data, error };
}

export async function deleteAsignacion(id) {
  return supabase
    .from("asignaciones")
    .update({ is_deleted: true })
    .eq("id", id);
}