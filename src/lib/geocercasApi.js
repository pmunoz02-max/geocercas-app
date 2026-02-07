// src/lib/geocercasApi.js
// ============================================================
// CANONICAL Geocercas client (TENANT-SAFE) — Feb 2026
// ✅ Compatible con UI existente: exports upsertGeocerca()
// ✅ Usa Supabase directo (public.geofences). Evita /api/geocercas (405).
// ✅ FIX: "org_id no puede ser null" -> resuelve org_id automáticamente
//    desde (1) payload, (2) localStorage, (3) RPC opcional,
//    (4) tablas comunes (memberships / user_organizations / profiles / app_user_roles).
//
// NOTA IMPORTANTE:
// - Si tu DB exige org_id NOT NULL, este cliente SIEMPRE lo enviará.
// - Ajusta TABLE CANDIDATES si tus tablas tienen otros nombres.
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

/**
 * Busca un org_id "probable" en localStorage.
 * Mantiene compatibilidad con distintas claves.
 */
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

  // fallback: busca en cualquier key que contenga org
  try {
    const keys = Object.keys(ls);
    for (const k of keys) {
      if (!/org/i.test(k)) continue;
      const v = ls.getItem(k);
      // intenta parsear JSON si aplica
      if (!v) continue;
      if (v.startsWith("{") || v.startsWith("[")) {
        try {
          const j = JSON.parse(v);
          const maybe = j?.org_id || j?.orgId || j?.currentOrgId || null;
          if (maybe) return String(maybe).trim();
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Intenta resolver org_id desde la DB de forma "universal".
 * - Primero: payload
 * - Segundo: localStorage
 * - Tercero: RPC (opcional): get_current_org_id() o current_org_id()
 * - Cuarto: tablas comunes (si existen)
 */
async function resolveOrgIdOrThrow(payload, userId) {
  const fromPayload = payload?.org_id ?? payload?.orgId ?? payload?.orgID ?? null;
  if (fromPayload && String(fromPayload).trim()) return String(fromPayload).trim();

  const fromLS = getOrgIdFromLocalStorage();
  if (fromLS) return fromLS;

  // RPC opcionales (si existen en tu DB)
  const rpcNames = ["get_current_org_id", "current_org_id", "get_active_org_id"];
  for (const fn of rpcNames) {
    try {
      const { data, error } = await supabase.rpc(fn);
      if (!error && data) return String(data).trim();
    } catch {
      // ignore (rpc no existe)
    }
  }

  // Tablas comunes (si existen): intenta encontrar la org del usuario
  const TABLE_CANDIDATES = [
    // (tabla, filtro user_id, columna org)
    { table: "memberships", userCol: "user_id", orgCol: "org_id", extraWhere: null },
    { table: "user_organizations", userCol: "user_id", orgCol: "org_id", extraWhere: null },
    { table: "app_user_roles", userCol: "user_id", orgCol: "org_id", extraWhere: null },
    { table: "profiles", userCol: "id", orgCol: "org_id", extraWhere: null },
    { table: "personal", userCol: "user_id", orgCol: "org_id", extraWhere: null },
  ];

  for (const t of TABLE_CANDIDATES) {
    try {
      let q = supabase.from(t.table).select(`${t.orgCol}`).limit(1);
      q = q.eq(t.userCol, userId);
      const { data, error } = await q.maybeSingle();
      if (!error) {
        const org = data?.[t.orgCol];
        if (org) return String(org).trim();
      }
      // si hay error, puede ser que la tabla/col no exista o RLS bloquee; seguimos
    } catch {
      // ignore
    }
  }

  throw new Error(
    "org_id no puede ser null. No pude resolver tu org_id automáticamente. " +
      "Asegura que el dashboard tenga org_id activo (localStorage) o que exista una función RPC get_current_org_id()."
  );
}

/**
 * Ajusta columnas aquí si tu tabla usa geometry en vez de geojson.
 * Por defecto envía: { name, geojson, org_id }
 */
function buildPayload(payload = {}, orgId) {
  const name = String(payload.nombre ?? payload.name ?? "").trim();
  const geojson = normalizeGeoJSON(payload.geojson ?? payload.geometry ?? payload.polygon_geojson ?? null);

  // Campos canónicos (ajusta si tu tabla usa otros nombres)
  return {
    org_id: orgId,
    name: name || null,
    geojson,
  };
}

function filterByOrg(rows, orgId) {
  if (!orgId) return rows || [];
  return (rows || []).filter((r) => String(r?.org_id ?? "") === String(orgId));
}

// ---------------------------
// Exports compatibles con UI
// ---------------------------

export async function listGeocercas({ orgId } = {}) {
  const session = await requireAuth();
  const userId = session.user.id;

  // Si no te pasan orgId, intentamos resolverlo para filtrar UI, pero listamos igual si no hay.
  let effectiveOrgId = orgId;
  if (!effectiveOrgId) {
    try {
      effectiveOrgId = await resolveOrgIdOrThrow({}, userId);
    } catch {
      effectiveOrgId = null;
    }
  }

  const { data, error } = await supabase
    .from("geofences")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throwNice(error);
  return filterByOrg(data || [], effectiveOrgId);
}

export async function listGeocercasForOrg(orgId) {
  return await listGeocercas({ orgId });
}

export async function getGeocerca({ id, orgId } = {}) {
  if (!id) throw new Error("getGeocerca requiere id");

  const session = await requireAuth();
  const userId = session.user.id;

  const effectiveOrgId = orgId ? String(orgId) : await resolveOrgIdOrThrow({}, userId);

  const { data, error } = await supabase
    .from("geofences")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throwNice(error);
  if (!data) return null;

  if (effectiveOrgId && data?.org_id && String(data.org_id) !== String(effectiveOrgId)) return null;
  return data;
}

/**
 * upsertGeocerca(payload)
 * - Si payload.id => update
 * - Si no => insert
 *
 * IMPORTANTE:
 * - org_id se resuelve siempre y se envía, para evitar "org_id no puede ser null".
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
      .update(body)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throwNice(error);
    return data;
  }

  const { data, error } = await supabase
    .from("geofences")
    .insert(body)
    .select("*")
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

  // por id directo
  if (typeof arg === "string" || typeof arg === "number") {
    const id = String(arg);
    const { error } = await supabase.from("geofences").delete().eq("id", id);
    if (error) throwNice(error);
    return { ok: true };
  }

  const id = arg?.id ? String(arg.id) : "";
  if (id) {
    const { error } = await supabase.from("geofences").delete().eq("id", id);
    if (error) throwNice(error);
    return { ok: true };
  }

  // bulk por nombres_ci (usa columna name)
  const nombres_ci = Array.isArray(arg?.nombres_ci) ? arg.nombres_ci : [];
  const orgId = await resolveOrgIdOrThrow(arg, userId);

  if (nombres_ci.length) {
    const names = nombres_ci.map((x) => String(x || "").trim()).filter(Boolean);

    // Recomendado: patrón "contiene" para ilike
    const orParts = names.map((n) => `name.ilike.%${encodeURIComponent(n)}%`).join(",");

    let q = supabase.from("geofences").delete().eq("org_id", orgId);

    const { error } = await q.or(orParts);
    if (error) throwNice(error);
    return { ok: true, deleted: names.length };
  }

  throw new Error("deleteGeocerca requiere id (o { orgId, nombres_ci[] }).");
}
