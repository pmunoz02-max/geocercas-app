// src/lib/activitiesApi.js
// ============================================================
// ACTIVITIES API (CANÓNICO) — Supabase + Multi-org real
// Feb 2026 — App Geocercas
//
// Reglas:
// - org_id SIEMPRE desde tg_current_org_id (no my_org_ids)
// - Por defecto: listar solo activas (active=true)
// - Soft delete: active=false (NO delete físico)
// - Tenant-safe: todas las escrituras filtran por org_id
// ============================================================

import { supabase } from "./supabaseClient";

const TABLE = "activities";

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

/**
 * Lista actividades de la org activa.
 * @param {Object} opts
 * @param {boolean} opts.includeInactive - si true incluye active=false
 */
export async function listActivities({ includeInactive = false } = {}) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));

  let q = supabase
    .from(TABLE)
    .select("id, org_id, name, active, description, hourly_rate, currency_code, created_at, created_by")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (!includeInactive) q = q.eq("active", true);

  const { data, error } = await q;
  if (error) return wrap(null, errMsg(error, "Error listando actividades"));

  return wrap(data || [], null);
}

/**
 * Crea actividad (org_id forzado).
 */
export async function createActivity(payload) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));

  const safe = { ...(payload || {}) };

  // Tenant-safe
  safe.org_id = orgId;

  // Defaults
  if (typeof safe.active === "undefined") safe.active = true;

  // No permitir que UI meta campos ajenos
  delete safe.tenant_id;
  delete safe.user_id;

  const { data, error } = await supabase.from(TABLE).insert(safe).select("*").single();
  if (error) return wrap(null, errMsg(error, "Error creando actividad"));

  return wrap(data, null);
}

/**
 * Actualiza actividad (tenant-safe: filtra por org_id).
 */
export async function updateActivity(id, patch) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));
  if (!id) return wrap(null, errMsg("Falta id"));

  const safe = { ...(patch || {}) };

  delete safe.org_id; // nunca cambiar org
  delete safe.tenant_id;

  const { data, error } = await supabase
    .from(TABLE)
    .update(safe)
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (error) return wrap(null, errMsg(error, "Error actualizando actividad"));

  return wrap(data, null);
}

/**
 * Soft delete: active=false (tenant-safe).
 */
export async function deleteActivity(id) {
  const orgId = getActiveOrgId();
  if (!orgId) return wrap(null, errMsg("No hay org activa (tg_current_org_id es null)"));
  if (!id) return wrap(null, errMsg("Falta id"));

  const { data, error } = await supabase
    .from(TABLE)
    .update({ active: false })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (error) return wrap(null, errMsg(error, "Error eliminando (soft) actividad"));

  return wrap(data, null);
}

/**
 * Toggle activo/inactivo (tenant-safe).
 */
export async function toggleActivityActive(id, active) {
  return await updateActivity(id, { active: !!active });
}
