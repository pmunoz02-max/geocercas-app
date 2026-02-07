// src/lib/geocercasApi.js
// ============================================================
// CANONICAL Geocercas client (TENANT-SAFE) — Feb 2026
// ✅ Tabla canónica: public.geocercas  (NO geofences)
// ✅ Columnas canónicas: org_id, nombre, geojson
// ✅ org_id siempre resuelto (payload -> localStorage -> RPC -> tablas comunes)
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
  const rpcNames = ["get_current_org_id", "current_org_id", "get_active_org_id"];
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
    nombre: nombre || null,
    geojson,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------
// Exports compatibles con UI
// ---------------------------

export async function listGeocercas({ orgId } = {}) {
  const session = await requireAuth();
  const userId = session.user.id;

  const effectiveOrgId = orgId ? String(orgId).trim() : await resolveOrgIdOrThrow({}, userId);

  const { data, error } = await supabase
    .from("geocercas")
    .select("id, org_id, nombre, geojson, created_at, updated_at")
    .eq("org_id", effectiveOrgId)
    .order("created_at", { ascending: false });

  if (error) throwNice(error);
  return data || [];
}

export async function listGeocercasForOrg(orgId) {
  return await listGeocercas({ orgId });
}

export async function getGeocerca({ id, orgId } = {}) {
  if (!id) throw new Error("getGeocerca requiere id");

  const session = await requireAuth();
  const userId = session.user.id;
  const effectiveOrgId = orgId ? String(orgId).trim() : await resolveOrgIdOrThrow({}, userId);

  const { data, error } = await supabase
    .from("geocercas")
    .select("id, org_id, nombre, geojson, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", effectiveOrgId)
    .maybeSingle();

  if (error) throwNice(error);
  return data || null;
}

/**
 * upsertGeocerca(payload)
 * - Si payload.id => update
 * - Si no => insert
 */
export async function upsertGeocerca(payload = {}) {
  const session = await requireAuth();
  const userId = session.user.id;

  const orgId = await resolveOrgIdOrThrow(payload, userId);
  const body = buildPayload(payload, orgId);

  if (!body.nombre) throw new Error("upsertGeocerca requiere nombre");
  if (!body.geojson) throw new Error("upsertGeocerca requiere geojson");

  const id = payload?.id ? String(payload.id) : "";

  if (id) {
    const { data, error } = await supabase
      .from("geocercas")
      .update(body)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, org_id, nombre, geojson, created_at, updated_at")
      .single();

    if (error) throwNice(error);
    return data;
  }

  const { data, error } = await supabase
    .from("geocercas")
    .insert({
      org_id: body.org_id,
      nombre: body.nombre,
      geojson: body.geojson,
    })
    .select("id, org_id, nombre, geojson, created_at, updated_at")
    .single();

  if (error) throwNice(error);
  return data;
}

/**
 * deleteGeocerca(id) o deleteGeocerca({id}) o bulk deleteGeocerca({orgId, nombres_ci})
 */
export async function deleteGeocerca(arg = {}) {
  const session = await requireAuth();
  const userId = session.user.id;

  // id directo
  if (typeof arg === "string" || typeof arg === "number") {
    const id = String(arg);
    const { error } = await supabase.from("geocercas").delete().eq("id", id);
    if (error) throwNice(error);
    return { ok: true };
  }

  const id = arg?.id ? String(arg.id) : "";
  if (id) {
    const { error } = await supabase.from("geocercas").delete().eq("id", id);
    if (error) throwNice(error);
    return { ok: true };
  }

  // bulk por nombres_ci
  const nombres_ci = Array.isArray(arg?.nombres_ci) ? arg.nombres_ci : [];
  const orgId = await resolveOrgIdOrThrow(arg, userId);

  if (nombres_ci.length) {
    const names = nombres_ci.map((x) => String(x || "").trim()).filter(Boolean);
    if (!names.length) throw new Error("nombres_ci vacío");

    // OR de ilike sobre columna nombre
    const orParts = names.map((n) => `nombre.ilike.%${encodeURIComponent(n)}%`).join(",");

    const { error } = await supabase
      .from("geocercas")
      .delete()
      .eq("org_id", orgId)
      .or(orParts);

    if (error) throwNice(error);
    return { ok: true, deleted: names.length };
  }

  throw new Error("deleteGeocerca requiere id (o { orgId, nombres_ci[] }).");
}
