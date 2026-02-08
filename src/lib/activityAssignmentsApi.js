// src/lib/activityAssignmentsApi.js
// ============================================================
// ACTIVITY ASSIGNMENTS API (CANÓNICO) — Supabase + Multi-org real
// Feb 2026 — App Geocercas
//
// FIX universal y permanente:
// - NO usar my_org_ids para "org activa" (en multi-org es ambiguo y en SQL Editor es NULL)
// - Usar SIEMPRE tg_current_org_id (igual que asignacionesApi.js)
// - En esta tabla, tenant_id = org_id (modelo legacy pero válido)
// - Tenant-safe: SIEMPRE filtrar por tenant_id
// ============================================================

import { supabase } from "./supabaseClient";

function getActiveOrgId() {
  try {
    const v = localStorage.getItem("tg_current_org_id");
    return v && String(v).trim() ? String(v).trim() : null;
  } catch {
    return null;
  }
}

function wrap(data, error) {
  return { data: data ?? null, error: error ?? null };
}

function errMsg(e, fallback = "Error") {
  if (!e) return { message: fallback };
  if (typeof e === "string") return { message: e };
  return { message: e.message || e.details || e.hint || fallback };
}

// tenant_id en activity_assignments = org_id canónico
function getTenantIdOrThrow() {
  const orgId = getActiveOrgId();
  if (!orgId) throw new Error("No hay org activa (tg_current_org_id es null)");
  return orgId;
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
  try {
    const tenantId = getTenantIdOrThrow();

    let query = supabase
      .from("activity_assignments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("start_date", { ascending: true });

    const { tracker_user_id, activity_id, start_date, end_date } = filters || {};

    if (tracker_user_id) query = query.eq("tracker_user_id", tracker_user_id);
    if (activity_id) query = query.eq("activity_id", activity_id);
    if (start_date) query = query.gte("start_date", start_date);
    if (end_date) query = query.lte("end_date", end_date);

    const { data, error } = await query;
    if (error) return wrap(null, errMsg(error, "Error listActivityAssignments"));

    return wrap(data || [], null);
  } catch (e) {
    return wrap(null, errMsg(e, "Error listActivityAssignments"));
  }
}

/**
 * Crea una nueva asignación de actividad.
 * Nota: si tienes una constraint anti-solapes, Supabase devolverá error si choca.
 */
export async function createActivityAssignment(payload) {
  try {
    const tenantId = getTenantIdOrThrow();

    const { tracker_user_id, activity_id, start_date, end_date } = payload || {};
    if (!tracker_user_id || !activity_id || !start_date) {
      return wrap(null, errMsg("tracker, actividad y fecha de inicio son obligatorios"));
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

    if (error) return wrap(null, errMsg(error, "Error createActivityAssignment"));

    return wrap(data || null, null);
  } catch (e) {
    return wrap(null, errMsg(e, "Error createActivityAssignment"));
  }
}

/**
 * Actualiza una asignación de actividad.
 * Tenant-safe: no permite mover de tenant, y filtra por tenant_id.
 */
export async function updateActivityAssignment(id, patch) {
  try {
    const tenantId = getTenantIdOrThrow();
    if (!id) return wrap(null, errMsg("updateActivityAssignment requiere id"));

    const updateRow = {};
    ["tracker_user_id", "activity_id", "start_date", "end_date"].forEach((field) => {
      if (typeof (patch || {})[field] !== "undefined") {
        updateRow[field] = patch[field] || null;
      }
    });

    if (Object.keys(updateRow).length === 0) {
      return wrap(null, errMsg("No hay campos que actualizar en updateActivityAssignment"));
    }

    // Seguridad: jamás permitir cambiar tenant_id desde UI
    delete updateRow.tenant_id;

    const { data, error } = await supabase
      .from("activity_assignments")
      .update(updateRow)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .maybeSingle();

    if (error) return wrap(null, errMsg(error, "Error updateActivityAssignment"));

    return wrap(data || null, null);
  } catch (e) {
    return wrap(null, errMsg(e, "Error updateActivityAssignment"));
  }
}

/**
 * Elimina una asignación de actividad (DELETE real).
 * Tenant-safe: filtra por tenant_id.
 */
export async function deleteActivityAssignment(id) {
  try {
    const tenantId = getTenantIdOrThrow();
    if (!id) return wrap(null, errMsg("deleteActivityAssignment requiere id"));

    const { error } = await supabase
      .from("activity_assignments")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) return wrap(null, errMsg(error, "Error deleteActivityAssignment"));

    return wrap(true, null);
  } catch (e) {
    return wrap(null, errMsg(e, "Error deleteActivityAssignment"));
  }
}
