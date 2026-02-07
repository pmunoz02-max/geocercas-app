// src/lib/geocercasApi.js
// ============================================================
// CANONICAL Geocercas client (TENANT-SAFE) — Feb 2026
// ✅ Compatible con UI existente: exports upsertGeocerca()
// ✅ No usa /api/geocercas (evita 405). Usa Supabase directo.
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
 * Ajusta columnas aquí si tu tabla usa geometry en vez de geojson.
 * Por defecto envía: { name, geojson }
 */
function buildPayload(payload = {}) {
  const name = String(payload.nombre ?? payload.name ?? "").trim();
  const geojson = normalizeGeoJSON(payload.geojson ?? payload.geometry ?? payload.polygon_geojson ?? null);
  return { name: name || null, geojson };
}

function filterByOrg(rows, orgId) {
  if (!orgId) return rows || [];
  return (rows || []).filter((r) => String(r?.org_id ?? "") === String(orgId));
}

// ---------------------------
// Exports compatibles con UI
// ---------------------------

export async function listGeocercas({ orgId } = {}) {
  await requireAuth();
  const { data, error } = await supabase
    .from("geofences")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throwNice(error);
  return filterByOrg(data || [], orgId);
}

export async function listGeocercasForOrg(orgId) {
  return await listGeocercas({ orgId });
}

export async function getGeocerca({ id, orgId } = {}) {
  if (!id) throw new Error("getGeocerca requiere id");
  await requireAuth();

  const { data, error } = await supabase
    .from("geofences")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throwNice(error);
  if (!data) return null;

  if (orgId && data?.org_id && String(data.org_id) !== String(orgId)) return null;
  return data;
}

/**
 * upsertGeocerca(payload)
 * - Si payload.id => update
 * - Si no => insert
 */
export async function upsertGeocerca(payload = {}) {
  const body = buildPayload(payload);

  if (!body.name) throw new Error("upsertGeocerca requiere nombre");
  if (!body.geojson) throw new Error("upsertGeocerca requiere geojson");

  await requireAuth();

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
  await requireAuth();

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
  const orgId = arg?.orgId || arg?.org_id || null;

  if (nombres_ci.length) {
    const names = nombres_ci.map((x) => String(x || "").trim()).filter(Boolean);

    // OJO: esto no hace "contiene", hace match de patrón exacto (sin *). Si quieres "contiene",
    // cambia a: `name.ilike.%${encodeURIComponent(n)}%`
    const orParts = names.map((n) => `name.ilike.${encodeURIComponent(n)}`).join(",");

    let q = supabase.from("geofences").delete();
    if (orgId) q = q.eq("org_id", orgId);

    const { error } = await q.or(orParts);
    if (error) throwNice(error);
    return { ok: true, deleted: names.length };
  }

  throw new Error("deleteGeocerca requiere id (o { orgId, nombres_ci[] }).");
}
