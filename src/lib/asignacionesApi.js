// src/lib/asignacionesApi.js
// ============================================================
// ASIGNACIONES API (CANÓNICO) — Supabase Auth + RLS (SIN tg_at)
// Enero 2026
//
// Objetivo:
// - NO depender de /api/asignaciones ni cookies tg_at
// - CRUD directo con supabase.from("asignaciones") respetando RLS por memberships
// - Inyectar SIEMPRE org_id desde localStorage("tg_current_org_id")
// - Evitar cambios de org_id desde UI (tenant-safety)
// - Soft-delete: is_deleted=true (+ deleted_at si existe)
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

export async function getAsignacionesBundle() {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));

  const { data, error } = await supabase
    .from("asignaciones")
    .select(
      `
      id,
      org_id,
      personal_id,
      geocerca_id,
      activity_id,
      start_time,
      end_time,
      frecuencia_envio_sec,
      estado,
      status,
      is_deleted,
      created_at,
      personal:personal_id ( id, nombre, apellido, email ),
      geocerca:geocerca_id ( id, nombre, name ),
      activity:activity_id ( id, name )
    `
    )
    .eq("org_id", orgId)
    .eq("is_deleted", false)
    .order("start_time", { ascending: true });

  if (error) return wrap(null, errMsg(error, "Error cargando asignaciones"));

  // Compat con UI: { asignaciones, catalogs }
  return wrap({ asignaciones: data || [], catalogs: {} }, null);
}

export async function createAsignacion(payload) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));

  if (!payload?.personal_id || !payload?.geocerca_id || !payload?.activity_id) {
    return wrap(null, errMsg("Faltan campos requeridos: personal_id, geocerca_id, activity_id"));
  }

  // Tenant-safe: forzamos org_id desde contexto
  const insertPayload = { ...payload, org_id: orgId };

  const { data, error } = await supabase
    .from("asignaciones")
    .insert(insertPayload)
    .select(
      `
      id,
      org_id,
      personal_id,
      geocerca_id,
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

export async function updateAsignacion(id, patch) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));
  if (!id) return wrap(null, errMsg("Falta id"));

  // Tenant-safe: no permitir que UI cambie org_id / tenant_id
  const safePatch = { ...(patch || {}) };
  delete safePatch.org_id;
  delete safePatch.tenant_id;

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
      geocerca_id,
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

export async function deleteAsignacion(id) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));
  if (!id) return wrap(null, errMsg("Falta id"));

  // Soft-delete + deleted_at si existe.
  // Para ser universal, intentamos primero con deleted_at y si falla reintentamos solo is_deleted.
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
