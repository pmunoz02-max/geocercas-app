// src/lib/activityAssignmentsApi.js
// API para asignar actividades a trackers/personas

import { supabase } from "../supabaseClient";

/**
 * tenant_id = org_id, lo sacamos de my_org_ids
 */
async function getCurrentTenantId() {
  const { data, error } = await supabase
    .from("my_org_ids")
    .select("org_id")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error leyendo my_org_ids en activityAssignmentsApi:", error);
    throw new Error("No se pudo obtener la organización activa");
  }

  if (!data || !data.org_id) {
    throw new Error("El usuario no tiene organización activa (my_org_ids vacío)");
  }

  return data.org_id;
}

/**
 * Lista asignaciones de actividades del tenant actual.
 *
 * filters:
 *  - tracker_user_id
 *  - activity_id
 *  - start_date (YYYY-MM-DD) -> start_date >=
 *  - end_date (YYYY-MM-DD)   -> end_date   <=
 */
export async function listActivityAssignments(filters = {}) {
  const tenantId = await getCurrentTenantId();

  let query = supabase
    .from("activity_assignments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("start_date", { ascending: true });

  const { tracker_user_id, activity_id, start_date, end_date } = filters;

  if (tracker_user_id) {
    query = query.eq("tracker_user_id", tracker_user_id);
  }
  if (activity_id) {
    query = query.eq("activity_id", activity_id);
  }
  if (start_date) {
    query = query.gte("start_date", start_date);
  }
  if (end_date) {
    query = query.lte("end_date", end_date);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error listActivityAssignments:", error);
    throw error;
  }

  return data || [];
}

/**
 * Crea una nueva asignación de actividad.
 * La constraint activity_assignments_no_overlap impedirá solapes
 * para el mismo tracker y tenant.
 */
export async function createActivityAssignment(payload) {
  const tenantId = await getCurrentTenantId();
  const { tracker_user_id, activity_id, start_date, end_date } = payload || {};

  if (!tracker_user_id || !activity_id || !start_date) {
    throw new Error("tracker, actividad y fecha de inicio son obligatorios");
  }

  const insertRow = {
    tenant_id: tenantId,
    tracker_user_id,
    activity_id,
    start_date,
    end_date: end_date || null,
  };

  const { data, error } = await supabase
    .from("activity_assignments")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error createActivityAssignment:", error);
    throw error;
  }

  return data;
}

/**
 * Actualiza una asignación de actividad.
 */
export async function updateActivityAssignment(id, patch) {
  if (!id) throw new Error("updateActivityAssignment requiere id");

  const updateRow = {};
  ["tracker_user_id", "activity_id", "start_date", "end_date"].forEach(
    (field) => {
      if (typeof patch[field] !== "undefined") {
        updateRow[field] = patch[field] || null;
      }
    }
  );

  if (Object.keys(updateRow).length === 0) {
    throw new Error("No hay campos que actualizar en updateActivityAssignment");
  }

  const { data, error } = await supabase
    .from("activity_assignments")
    .update(updateRow)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error updateActivityAssignment:", error);
    throw error;
  }

  return data;
}

/**
 * Elimina una asignación de actividad (DELETE real).
 * Si prefieres soft-delete, aquí se puede adaptar.
 */
export async function deleteActivityAssignment(id) {
  if (!id) throw new Error("deleteActivityAssignment requiere id");

  const { error } = await supabase
    .from("activity_assignments")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleteActivityAssignment:", error);
    throw error;
  }

  return true;
}
