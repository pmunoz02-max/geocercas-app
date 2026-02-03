// api/geocercas.js
// ============================================================
// TENANT-SAFE Geocercas API (CANONICAL) — Feb 2026
// ✅ Usa public.geofences (source of truth real)
// - Endpoint se mantiene /api/geocercas por compatibilidad
// - Mapeo legacy:
//    nombre  <-> geofences.name
//    geojson <-> geofences.geojson (Feature/FC/Geometry aceptados)
// - Auth universal: Bearer token (preferido) o cookie tg_at (legacy)
// - Contexto por sesión: bootstrap_session_context()
// ============================================================

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function send(res, status, payload) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Vary", "Cookie, Authorization");
  return res.status(status).json(payload);
}

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

function getBearerToken(req) {
  const h = String(req.headers?.authorization || "").trim();
  if (!h) return "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

function supabaseForToken(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE env vars");

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
}

async function getContextOr401(req) {
  const bearer = getBearerToken(req);
  if (bearer) {
    const supabase = supabaseForToken(bearer);
    const { error } = await supabase.rpc("bootstrap_session_context");
    if (error) return { ok: false, status: 401, error: error.message || "ctx error (bearer)" };
    return { ok: true, supabase };
  }

  const cookies = parseCookies(req);
  const token = cookies.tg_at || "";
  if (!token) return { ok: false, status: 401, error: "missing auth (no Bearer, no tg_at cookie)" };

  const supabase = supabaseForToken(token);
  const { error } = await supabase.rpc("bootstrap_session_context");
  if (error) return { ok: false, status: 401, error: error.message || "ctx error (cookie)" };

  return { ok: true, supabase };
}

function mapGeofenceRowToLegacy(row) {
  if (!row) return null;
  const geo = row.geojson ?? row.polygon_geojson ?? null;
  return {
    ...row,
    nombre: row.name ?? "",
    geojson: geo,
    geometry: geo,
    name: row.name ?? null,
  };
}

function normalizeCi(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Extrae geometry pura desde:
 * - FeatureCollection -> features[0].geometry
 * - Feature          -> geometry
 * - Geometry         -> geo
 */
function extractGeometryJson(geo) {
  if (!geo) return null;
  const t = String(geo?.type || "").toLowerCase();
  if (t === "featurecollection") return geo?.features?.[0]?.geometry || null;
  if (t === "feature") return geo?.geometry || null;
  return geo;
}

/**
 * Si viene como Feature Point + properties.radius_m, lo tratamos como círculo.
 * (opcional)
 */
function extractCircleProps(geo) {
  try {
    const t = String(geo?.type || "").toLowerCase();
    if (t !== "feature") return null;
    const g = geo?.geometry;
    if (!g || String(g.type || "").toLowerCase() !== "point") return null;

    const radius = Number(geo?.properties?.radius_m || 0);
    const coords = Array.isArray(g.coordinates) ? g.coordinates : null;
    if (!coords || coords.length < 2) return null;

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) return null;

    return { lat, lng, radius_m: Math.round(radius) };
  } catch {
    return null;
  }
}

function safeUuid() {
  // Node 18+ (Vercel) soporta randomUUID; fallback por si acaso
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random()}`; // nunca debería usarse como uuid real
  }
}

export default async function handler(req, res) {
  try {
    const ctx = await getContextOr401(req);
    if (!ctx.ok) return send(res, ctx.status, { ok: false, error: ctx.error });

    const { supabase } = ctx;

    // -------------------------
    // GET → list geofences (legacy "geocercas")
    // -------------------------
    if (req.method === "GET") {
      const id = req.query?.id ? String(req.query.id) : "";

      if (id) {
        const { data, error } = await supabase.from("geofences").select("*").eq("id", id).maybeSingle();
        if (error) return send(res, 500, { ok: false, error: error.message });
        return send(res, 200, mapGeofenceRowToLegacy(data));
      }

      const { data, error } = await supabase.from("geofences").select("*").order("created_at", { ascending: false });
      if (error) return send(res, 500, { ok: false, error: error.message });

      return send(res, 200, (data || []).map(mapGeofenceRowToLegacy));
    }

    // -------------------------
    // POST → upsert geofence
    // -------------------------
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      // ⚠️ FIX: NO mandamos id:null. Si no hay id, generamos uuid.
      const rawId = body.id ?? null;
      const id = rawId ? String(rawId) : safeUuid();

      const org_id = body.org_id || body.orgId || null;
      const name = String(body.nombre || body.name || "").trim();
      if (!name) return send(res, 422, { ok: false, error: "nombre (o name) is required" });
      if (!org_id) return send(res, 422, { ok: false, error: "org_id is required" });

      const geo = body.geojson || body.geometry || body.geom || null;

      const payload = { id, org_id, name, active: true };

      if (geo !== null) {
        // guardamos lo que llega (para UI legacy)
        payload.geojson = geo;

        // guardamos geometry pura para evitar líos aguas abajo
        const gOnly = extractGeometryJson(geo);
        if (gOnly) payload.polygon_geojson = gOnly;

        // círculo opcional
        const circle = extractCircleProps(geo);
        if (circle) {
          payload.lat = circle.lat;
          payload.lng = circle.lng;
          payload.radius_m = circle.radius_m;
        }
      }

      const { data, error } = await supabase
        .from("geofences")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .maybeSingle();

      if (error) return send(res, 500, { ok: false, error: error.message });
      return send(res, 200, { ok: true, row: mapGeofenceRowToLegacy(data) });
    }

    // -------------------------
    // DELETE → delete geofence
    // -------------------------
    if (req.method === "DELETE") {
      const id = req.query?.id ? String(req.query.id) : "";

      if (id) {
        const { error } = await supabase.from("geofences").delete().eq("id", id);
        if (error) return send(res, 500, { ok: false, error: error.message });
        return send(res, 200, { ok: true });
      }

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const orgId = body.orgId || body.org_id || null;
      const nombres_ci = Array.isArray(body.nombres_ci) ? body.nombres_ci : [];

      if (!orgId || !nombres_ci.length) {
        return send(res, 422, { ok: false, error: "id (query) OR { orgId, nombres_ci[] } is required" });
      }

      const wanted = new Set(nombres_ci.map(normalizeCi).filter(Boolean));

      const { data: rows, error: listErr } = await supabase
        .from("geofences")
        .select("id, org_id, name")
        .eq("org_id", orgId);

      if (listErr) return send(res, 500, { ok: false, error: listErr.message });

      const ids = (rows || [])
        .filter((r) => wanted.has(normalizeCi(r?.name)))
        .map((r) => r.id)
        .filter(Boolean);

      if (!ids.length) return send(res, 200, { ok: true, deleted: 0 });

      const { error: delErr } = await supabase.from("geofences").delete().in("id", ids);
      if (delErr) return send(res, 500, { ok: false, error: delErr.message });

      return send(res, 200, { ok: true, deleted: ids.length });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[api/geocercas][FATAL]", err);
    return send(res, 500, { ok: false, error: err?.message || "fatal" });
  }
}
