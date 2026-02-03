// api/geocercas.js
// ============================================================
// TENANT-SAFE Geocercas API (CANONICAL) — Feb 2026
// ✅ Usa public.geofences (source of truth real)
// - Endpoint se mantiene /api/geocercas por compatibilidad
// - Mapeo legacy:
//    nombre  <-> geofences.name
//    geojson <-> geofences.geojson || geofences.geometry
// - Auth universal: Bearer token (preferido) o cookie tg_at (legacy)
// - Contexto por sesión: bootstrap_session_context()
// ============================================================

import { createClient } from "@supabase/supabase-js";

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
  const geo = row.geojson ?? row.geometry ?? null;
  return {
    ...row,
    nombre: row.name ?? "",
    geojson: geo,
    geometry: geo,
    name: row.name ?? null,
  };
}

function isMissingColumnError(err, colRef) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes(`column ${String(colRef).toLowerCase()}`) && msg.includes("does not exist");
}

function normalizeCi(s) {
  return String(s || "").trim().toLowerCase();
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

      const id = body.id || null;
      const org_id = body.org_id || body.orgId || null;
      const name = String(body.nombre || body.name || "").trim();
      if (!name) return send(res, 422, { ok: false, error: "nombre (o name) is required" });
      if (!org_id) return send(res, 422, { ok: false, error: "org_id is required" });

      const geo = body.geojson || body.geometry || body.geom || null;

      // Intento 1: columna geojson
      let payload = { id, org_id, name };
      if (geo !== null) payload.geojson = geo;

      let { data, error } = await supabase
        .from("geofences")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .maybeSingle();

      // Fallback: si no existe geojson, probamos geometry
      if (error && geo !== null && isMissingColumnError(error, "geofences.geojson")) {
        payload = { id, org_id, name, geometry: geo };
        const r2 = await supabase
          .from("geofences")
          .upsert(payload, { onConflict: "id" })
          .select("*")
          .maybeSingle();
        data = r2.data;
        error = r2.error;
      }

      if (error) return send(res, 500, { ok: false, error: error.message });
      return send(res, 200, { ok: true, row: mapGeofenceRowToLegacy(data) });
    }

    // -------------------------
    // DELETE → delete geofence
    // - por id (query ?id=)
    // - bulk por { orgId, nombres_ci } (body)
    // -------------------------
    if (req.method === "DELETE") {
      const id = req.query?.id ? String(req.query.id) : "";

      // Caso 1: delete por id
      if (id) {
        const { error } = await supabase.from("geofences").delete().eq("id", id);
        if (error) return send(res, 500, { ok: false, error: error.message });
        return send(res, 200, { ok: true });
      }

      // Caso 2: bulk (tu UI)
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const orgId = body.orgId || body.org_id || null;
      const nombres_ci = Array.isArray(body.nombres_ci) ? body.nombres_ci : [];

      if (!orgId || !nombres_ci.length) {
        return send(res, 422, { ok: false, error: "id (query) OR { orgId, nombres_ci[] } is required" });
      }

      // ✅ FIX: no dependemos de name_ci/nombre_ci (no existen).
      // Leemos ids por org, calculamos lower(name) y borramos por ids.
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
