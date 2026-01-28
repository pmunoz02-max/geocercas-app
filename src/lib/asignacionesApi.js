// src/lib/asignacionesApi.js
import { supabase } from "./supabaseClient";

function currentOrgId() {
  return localStorage.getItem("tg_current_org_id");
}

export async function getAsignacionesBundle() {
  const orgId = currentOrgId();
  if (!orgId) {
    return { data: null, error: { message: "No active org" } };
  }

  const { data, error } = await supabase
    .from("asignaciones")
    .select(`
      id,
      org_id,
      personal_id,
      geocerca_id,
      activity_id,
      start_time,
      end_time,
      frecuencia_envio_sec,
      status,
      created_at,
      personal:personal_id ( id, nombre, apellido, email ),
      geocerca:geocerca_id ( id, nombre, name ),
      activity:activity_id ( id, name )
    `)
    .eq("org_id", orgId)
    .eq("is_deleted", false)
    .order("start_time", { ascending: true });

  if (error) return { data: null, error };
  return { data: { asignaciones: data, catalogs: {} }, error: null };
}

export async function createAsignacion(payload) {
  const orgId = currentOrgId();
  const { data, error } = await supabase
    .from("asignaciones")
    .insert({ ...payload, org_id: orgId })
    .select()
    .single();

  return { data, error };
}

export async function updateAsignacion(id, patch) {
  const orgId = currentOrgId();
  const { data, error } = await supabase
    .from("asignaciones")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  return { data, error };
}

export async function deleteAsignacion(id) {
  const orgId = currentOrgId();
  const { error } = await supabase
    .from("asignaciones")
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("org_id", orgId);

  return { data: null, error };
}
