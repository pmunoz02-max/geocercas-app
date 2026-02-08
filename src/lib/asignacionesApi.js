// src/lib/asignacionesApi.js
// ============================================================
// ASIGNACIONES API (CANÓNICO) — Supabase Auth + RLS
// Feb 2026 — App Geocercas
//
// Objetivo (monetizable / multi-org real):
// - NO mezclar organizaciones (org_id SIEMPRE desde tg_current_org_id)
// - Lectura canónica desde v_asignaciones_ui (sin joins frágiles)
// - Escritura en public.asignaciones usando geofence_id (NO geocerca_id)
// - Soft-delete: is_deleted=true (+ deleted_at si existe)
// - ✅ SIN FALLBACK A LEGACY (geocercas)
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

// ============================================================
// READ: bundle para UI (asignaciones + catálogos mínimos)
// - Usa v_asignaciones_ui canónica
// - ✅ Solo geofences (geofence_id + geofence_name)
// ============================================================
export async function getAsignacionesBundle() {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));

  const { data, error } = await supabase
    .from("v_asignaciones_ui")
    .select(
      `
      id,
      org_id,
      tenant_id,
      personal_id,
      org_people_id,
      activity_id,
      geofence_id,
      start_time,
      end_time,
      frecuencia_envio_sec,
      estado,
      status,
      is_deleted,
      created_at,

      personal_nombre,
      personal_apellido,
      personal_email,
      personal_user_id,

      activity_name,

      geofence_name
    `
    )
    .eq("org_id", orgId)
    .order("start_time", { ascending: true });

  if (error) return wrap(null, errMsg(error, "Error cargando asignaciones (vista v_asignaciones_ui)"));

  return wrap({ asignaciones: data || [], catalogs: {} }, null);
}

// ============================================================
// CREATE: canónico (requiere personal_id + geofence_id + activity_id)
// ============================================================
export async function createAsignacion(payload) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));

  if (!payload?.personal_id || !payload?.geofence_id || !payload?.activity_id) {
    return wrap(null, errMsg("Faltan campos requeridos: personal_id, geofence_id, activity_id"));
  }

  // Tenant-safe: forzamos org_id desde contexto
  const insertPayload = { ...payload, org_id: orgId };

  // Seguridad: no permitir que UI meta campos que mezclen
  delete insertPayload.tenant_id;
  delete insertPayload.geocerca_id; // legacy fuera

  const { data, error } = await supabase
    .from("asignaciones")
    .insert(insertPayload)
    .select(
      `
      id,
      org_id,
      personal_id,
      geofence_id,
      activity_id,
      start_time,
      end_time,
      frecuencia_envio_sec,
      estado,
      status,
      is_deleted,
      created_at
    `
    )
    .single();

  if (error) return wrap(null, errMsg(error, "No se pudo crear la asignación (RLS?)"));
  return wrap(data, null);
}

// ============================================================
// UPDATE: canónico
// - Tenant-safe: no permitir cambiar org_id / tenant_id
// - No permitir volver a legacy (geocerca_id)
// ============================================================
export async function updateAsignacion(id, patch) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));
  if (!id) return wrap(null, errMsg("Falta id"));

  const safePatch = { ...(patch || {}) };

  delete safePatch.org_id;
  delete safePatch.tenant_id;
  delete safePatch.geocerca_id; // legacy fuera

  // Evitar huérfanos canónicos
  if ("geofence_id" in safePatch && !safePatch.geofence_id) {
    return wrap(null, errMsg("geofence_id no puede ser null en asignaciones canónicas"));
  }

  const { data, error } = await supabase
    .from("asignaciones")
    .update(safePatch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select(
      `
      id,
      org_id,
      personal_id,
      geofence_id,
      activity_id,
      start_time,
      end_time,
      frecuencia_envio_sec,
      estado,
      status,
      is_deleted,
      created_at
    `
    )
    .single();

  if (error) return wrap(null, errMsg(error, "No se pudo actualizar la asignación"));
  return wrap(data, null);
}

// ============================================================
// DELETE (soft): is_deleted=true (+ deleted_at si existe)
// ============================================================
export async function deleteAsignacion(id) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));
  if (!id) return wrap(null, errMsg("Falta id"));

  const attempt1 = await supabase
    .from("asignaciones")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (!attempt1.error) return wrap(true, null);

  const attempt2 = await supabase
    .from("asignaciones")
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("org_id", orgId);

  if (attempt2.error) return wrap(null, errMsg(attempt2.error, "No se pudo eliminar la asignación"));
  return wrap(true, null);
}
