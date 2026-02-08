// src/lib/geocercasApi.js
// ============================================================
// CANONICAL Geofences client (TENANT-SAFE) — Feb 2026
// ✅ Tabla canónica: public.geofences
// ✅ org_id obligatorio, siempre filtrado
// ✅ Soft-delete: active=false (no delete físico)
// ✅ Mantiene exports legacy (listGeocercas/upsertGeocerca/etc) para compatibilidad UI
// ============================================================

import { supabase } from "./supabaseClient";

// ---------------------------
// Helpers
// ---------------------------
function pickErrorMessage(err) {
  if (!err) return "Error desconocido";
  if (typeof err === "string") return err;
  return (
    err.message ||
    err.error_description ||
    err.details ||
    err.detail ||
    err.hint ||
    (Array.isArray(err.errors) ? err.errors.map((e) => e.message || e).join(" | ") : null) ||
    "Request failed"
  );
}

function throwNice(err) {
  const msg = pickErrorMessage(err);
  const e = new Error(msg);
  if (err?.status) e.status = err.status;
  if (err?.code) e.code = err.code;
  e.raw = err;
  throw e;
}

function normalizeGeoJSON(input) {
  if (!input) return null;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      throw new Error("GeoJSON inválido");
    }
  }
  return input;
}

async function requireAuth() {
  const { data: sess, error } = await supabase.auth.getSession();
  if (error) throwNice(error);
  if (!sess?.session?.user) throw new Error("No autenticado. Cierra sesión y entra de nuevo.");
  return sess.session;
}

function getOrgIdFromLocalStorage() {
  if (typeof window === "undefined") return null;
  const ls = window.localStorage;
  if (!ls) return null;

  const candidates = [
    "org_id",
    "orgId",
    "currentOrgId",
    "selectedOrgId",
    "selected_org_id",
    "activeOrgId",
    "active_org_id",
  ];

  for (const k of candidates) {
    const v = ls.getItem(k);
    if (v && String(v).trim()) return String(v).trim();
  }

  // fallback: busca JSON con org_id
  try {
    const keys = Object.keys(ls);
    for (const k of keys) {
      if (!/org/i.test(k)) continue;
      const v = ls.getItem(k);
      if (!v) continue;
      if (v.startsWith("{") || v.startsWith("[")) {
        try {
          const j = JSON.parse(v);
          const maybe = j?.org_id || j?.orgId || j?.currentOrgId || null;
          if (maybe) return String(maybe).trim();
        } catch {}
      }
    }
  } catch {}

  return null;
}

async function resolveOrgIdOrThrow(payload, userId) {
  const fromPayload = payload?.org_id ?? payload?.orgId ?? payload?.orgID ?? null;
  if (fromPayload && String(fromPayload).trim()) return String(fromPayload).trim();

  const fromLS = getOrgIdFromLocalStorage();
  if (fromLS) return fromLS;

  // RPC opcionales
  const rpcNames = ["get_current_org_id", "current_org_id", "get_active_org_id", "app.current_org_id"];
  for (const fn of rpcNames) {
    try {
      const { data, error } = await supabase.rpc(fn);
      if (!error && data) return String(data).trim();
    } catch {}
  }

  // Tablas comunes (si existen)
  const TABLES = [
    { table: "memberships", userCol: "user_id", orgCol: "org_id" },
    { table: "user_organizations", userCol: "user_id", orgCol: "org_id" },
    { table: "app_user_roles", userCol: "user_id", orgCol: "org_id" },
    { table: "profiles", userCol: "id", orgCol: "org_id" },
    { table: "personal", userCol: "user_id", orgCol: "org_id" },
  ];

  for (const t of TABLES) {
    try {
      const { data, error } = await supabase
        .from(t.table)
        .select(`${t.orgCol}`)
        .eq(t.userCol, userId)
        .limit(1)
        .maybeSingle();
      if (!error) {
        const org = data?.[t.orgCol];
        if (org) return String(org).trim();
      }
    } catch {}
  }

  throw new Error(
    "org_id no puede ser null. No pude resolver tu org_id automáticamente. " +
      "Asegura que la app tenga org activa (AuthContext/localStorage) o crea una RPC get_current_org_id()."
  );
}

function buildPayload(payload = {}, orgId) {
  const nombre = String(payload.nombre ?? payload.name ?? "").trim();
  const geojson = normalizeGeoJSON(payload.geojson ?? payload.geometry ?? payload.polygon_geojson ?? null);

  return {
    org_id: orgId,
    name: nombre || null,
    geojson,
    active: payload?.active ?? true,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------
// Exports compatibles con UI (nombres legacy)
// ---------------------------

/**
 * listGeocercas({ orgId })
 * Devuelve SOLO geofences activas por defecto (active=true).
 */
export async function listGeocercas({ orgId, includeInactive = false } = {}) {
  const session = await requireAuth();
  const userId = session.user.id;

  const effectiveOrgId = orgId ? String(orgId).trim() : await resolveOrgIdOrThrow({}, userId);

  let q = supabase
    .from("geofences")
    .select("id, org_id, name, geojson, active, created_at, updated_at")
    .eq("org_id", effectiveOrgId)
    .order("created_at", { ascending: false });

  if (!includeInactive) q = q.eq("active", true);

  const { data, error } = await q;
  if (error) throwNice(error);

  // mapea a forma esperada por UI (nombre)
  return (data || []).map((r) => ({
    id: r.id,
    org_id: r.org_id,
    nombre: r.name,
    name: r.name,
    geojson: r.geojson,
    active: r.active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function listGeocercasForOrg(orgId) {
  return await listGeocercas({ orgId });
}

export async function getGeocerca({ id, orgId, includeInactive = true } = {}) {
  if (!id) throw new Error("getGeocerca requiere id");

  const session = await requireAuth();
  const userId = session.user.id;
  const effectiveOrgId = orgId ? String(orgId).trim() : await resolveOrgIdOrThrow({}, userId);

  let q = supabase
    .from("geofences")
    .select("id, org_id, name, geojson, active, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", effectiveOrgId)
    .maybeSingle();

  // si NO quieres permitir ver inactivas, se controla aquí
  if (!includeInactive) q = q.eq("active", true);

  const { data, error } = await q;
  if (error) throwNice(error);
  if (!data) return null;

  return {
    id: data.id,
    org_id: data.org_id,
    nombre: data.name,
    name: data.name,
    geojson: data.geojson,
    active: data.active,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * upsertGeocerca(payload)
 * - Si payload.id => update
 * - Si no => insert
 * Escribe SIEMPRE en public.geofences (canónica)
 */
export async function upsertGeocerca(payload = {}) {
  const session = await requireAuth();
  const userId = session.user.id;

  const orgId = await resolveOrgIdOrThrow(payload, userId);
  const body = buildPayload(payload, orgId);

  if (!body.name) throw new Error("upsertGeocerca requiere nombre");
  if (!body.geojson) throw new Error("upsertGeocerca requiere geojson");

  const id = payload?.id ? String(payload.id) : "";

  if (id) {
    const { data, error } = await supabase
      .from("geofences")
      .update({
        name: body.name,
        geojson: body.geojson,
        active: body.active,
        updated_at: body.updated_at,
      })
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, org_id, name, geojson, active, created_at, updated_at")
      .single();

    if (error) throwNice(error);

    return {
      id: data.id,
      org_id: data.org_id,
      nombre: data.name,
      name: data.name,
      geojson: data.geojson,
      active: data.active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  const { data, error } = await supabase
    .from("geofences")
    .insert({
      org_id: body.org_id,
      name: body.name,
      geojson: body.geojson,
      active: body.active ?? true,
    })
    .select("id, org_id, name, geojson, active, created_at, updated_at")
    .single();

  if (error) throwNice(error);

  return {
    id: data.id,
    org_id: data.org_id,
    nombre: data.name,
    name: data.name,
    geojson: data.geojson,
    active: data.active,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * deleteGeocerca(id | {id})
 * ✅ Soft delete: active=false (NO delete físico)
 */
export async function deleteGeocerca(arg = {}) {
  await requireAuth();

  const id =
    typeof arg === "string" || typeof arg === "number"
      ? String(arg)
      : arg?.id
      ? String(arg.id)
      : "";

  if (!id) throw new Error("deleteGeocerca requiere id");

  const { error } = await supabase
    .from("geofences")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throwNice(error);
  return { ok: true };
}
