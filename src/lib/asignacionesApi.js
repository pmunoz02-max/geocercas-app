// src/lib/asignacionesApi.js

import { supabase } from "../supabaseClient";

/**
 * Normaliza un string de búsqueda para filtros.
 */
function normalizeSearch(q) {
  if (!q) return "";
  return q.trim();
}

/**
 * Lista asignaciones usando la vista v_asignaciones_ui.
 * Se mantiene para compatibilidad con código legacy.
 */
export async function listAsignaciones(filters = {}) {
  const { q, estado, geocercaId, personalId, startDate, endDate } = filters;

  let query = supabase.from("v_asignaciones_ui").select("*");

  if (estado && estado !== "todos") {
    query = query.eq("estado", estado);
  }

  if (geocercaId) {
    query = query.eq("geocerca_id", geocercaId);
  }

  if (personalId) {
    query = query.eq("personal_id", personalId);
  }

  if (startDate) {
    query = query.gte("start_date", startDate);
  }

  if (endDate) {
    query = query.lte("end_date", endDate);
  }

  const search = normalizeSearch(q);
  if (search) {
    const like = `%${search}%`;
    query = query.or(
      `personal_nombre.ilike.${like},personal_email.ilike.${like},geocerca_nombre.ilike.${like}`
    );
  }

  const { data, error } = await query.order("start_date", { ascending: true });

  if (error) {
    console.error("[listAsignaciones] error:", error);
    throw error;
  }

  return data || [];
}

/**
 * Obtiene asignaciones desde la tabla base public.asignaciones
 * para la organización del usuario actual, con joins a personal / geocerca / activity.
 * Esta es la función que usa AsignacionesPage.jsx.
 */
export async function getAsignaciones() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    console.error("[getAsignaciones] Error sesión:", sessionError);
    return { data: null, error: sessionError };
  }

  const user = sessionData?.session?.user;
  if (!user) {
    return { data: [], error: null };
  }

  const orgId = user.user_metadata?.org_id;
  if (!orgId) {
    console.warn("[getAsignaciones] Usuario sin org_id en metadata");
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("asignaciones")
    .select(
      `
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
      personal:personal_id (
        id,
        nombre,
        apellido,
        email
      ),
      geocerca:geocerca_id (
        id,
        nombre
      ),
      activity:activity_id (
        id,
        nombre
      )
    `
    )
    .eq("org_id", orgId)
    .eq("is_deleted", false)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("[getAsignaciones] error:", error);
  }

  return { data: data || [], error };
}

/**
 * Crea una nueva asignación en public.asignaciones.
 * Devuelve { data, error } para que el caller decida qué hacer.
 */
export async function createAsignacion(payload) {
  const { user_id, ...cleanPayload } = payload || {};

  const { data, error } = await supabase
    .from("asignaciones")
    .insert(cleanPayload)
    .select("*");

  if (error) {
    console.error("[createAsignacion] error:", error);
  }

  return { data, error };
}

/**
 * Actualiza una asignación existente.
 * Devuelve { data, error }.
 */
export async function updateAsignacion(id, patch) {
  if (!id) {
    throw new Error("[updateAsignacion] id es obligatorio");
  }

  const { user_id, ...cleanPatch } = patch || {};

  const { data, error } = await supabase
    .from("asignaciones")
    .update(cleanPatch)
    .eq("id", id)
    .select("*");

  if (error) {
    console.error("[updateAsignacion] error:", error);
  }

  return { data, error };
}

/**
 * Soft delete de una asignación (is_deleted = true).
 * Se mantiene como helper general.
 */
export async function softDeleteAsignacion(id) {
  if (!id) {
    return { error: new Error("[softDeleteAsignacion] id es obligatorio") };
  }

  const { error } = await supabase
    .from("asignaciones")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) {
    console.error("[softDeleteAsignacion] error:", error);
  }

  return { error };
}

/**
 * deleteAsignacion: wrapper usado por AsignacionesPage.jsx
 * Devuelve { error }.
 */
export async function deleteAsignacion(id) {
  return softDeleteAsignacion(id);
}
