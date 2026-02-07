// api/geocercas.js
// ============================================================
// TENANT-SAFE Geocercas API (CANONICAL) — Feb 2026
// ✅ Usa public.geofences (source of truth real)
// ✅ Membership universal: public.memberships (revoked_at IS NULL)
// ✅ Org resuelta de forma segura (x-org-id o default/fallback)
// - Endpoint se mantiene /api/geocercas por compatibilidad
// - Mapeo legacy:
//    nombre  <-> geofences.name
//    geojson <-> geofences.geojson || geofences.geometry
// - Auth universal: Bearer token (preferido) o cookie tg_at (legacy)
// ============================================================

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { resolveOrgAndMembership } from "../src/server/lib/resolveOrg.js";

export const config = { runtime: "nodejs" };

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
    try {
      out[k] = decodeURIComponent(rest.join("=") || "");
    } catch {
      out[k] = rest.join("=") || "";
    }
  });
  return out;
}

function getBearerToken(req) {
  const h = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  if (!h) return "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

function getAccessToken(req) {
  const bearer = getBearerToken(req);
  if (bearer) return bearer;
  const cookies = parseCookies(req);
  return cookies.tg_at || "";
}

function isMissingColumnError(err, colRef) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes(`column ${String(colRef).toLowerCase()}`) && msg.includes("does not exist");
}

function normalizeCi(s) {
  return String(s || "").trim().toLowerCase();
}

function newUuid() {
  return crypto.randomUUID();
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

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

export default async function handler(req, res) {
  const build_tag = "geocercas-v2026-02-memberships";

  try {
    const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
    const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return send(res, 500, {
        ok: false,
        build_tag,
        error: "Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
      });
    }

    // ===== AUTH =====
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return send(res, 401, {
        ok: false,
        build_tag,
        error: "Missing authentication (no Bearer, no tg_at cookie)",
      });
    }

    // ===== ADMIN CLIENT (bypass RLS) =====
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Validar usuario desde token
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    const user = userData?.user || null;
    if (userErr || !user) {
      return send(res, 401, { ok: false, build_tag, error: "Invalid user" });
    }

    // Org solicitada (si viene). Igual se valida contra memberships.
    const requestedOrgId = req.headers["x-org-id"] ? String(req.headers["x-org-id"]) : "";

    // ===== MEMBERSHIP (UNIVERSAL) =====
    const membership = await resolveOrgAndMembership(admin, user.id, requestedOrgId);
    if (!membership?.org_id) {
      return send(res, 403, {
        ok: false,
        build_tag,
        error: "User not member of organization",
      });
    }

    const orgId = membership.org_id;

    // -------------------------
    // GET → list geofences (legacy "geocercas")
    // -------------------------
    if (req.method === "GET") {
      const id = req.query?.id ? String(req.query.id) : "";

      if (id) {
        // Seguridad: siempre filtrar por org_id
        const { data, error } = await admin
          .from("geofences")
          .select("*")
          .eq("id", id)
          .eq("org_id", orgId)
          .maybeSingle();

        if (error) return send(res, 500, { ok: false, build_tag, error: error.message });
        if (!data) return send(res, 404, { ok: false, build_tag, error: "Not found" });

        return send(res, 200, mapGeofenceRowToLegacy(data));
      }

      const { data, error } = await admin
        .from("geofences")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (error) return send(res, 500, { ok: false, build_tag, error: error.message });
      return send(res, 200, (data || []).map(mapGeofenceRowToLegacy));
    }

    // -------------------------
    // POST → upsert geofence
    // -------------------------
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      let id = body.id || null;
      const name = String(body.nombre || body.name || "").trim();
      if (!name) return send(res, 422, { ok: false, build_tag, error: "nombre (o name) is required" });

      // ⚠️ org_id del body NO se usa (evita cross-tenant). Siempre usamos orgId resuelto.
      const geo = body.geojson || body.geometry || body.geom || null;

      // Anti-duplicados: si no viene id, buscar por (org_id + name CI)
      if (!id) {
        const { data: existing, error: e0 } = await admin
          .from("geofences")
          .select("id")
          .eq("org_id", orgId)
          .ilike("name", name)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!e0 && existing?.id) id = existing.id;
      }

      if (!id) id = newUuid();

      // Intento 1: columna geojson
      let payload = { id, org_id: orgId, name };
      if (geo !== null) payload.geojson = geo;

      let { data, error } = await admin
        .from("geofences")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .maybeSingle();

      // Fallback: si no existe geojson, probamos geometry
      if (error && geo !== null && isMissingColumnError(error, "geofences.geojson")) {
        payload = { id, org_id: orgId, name, geometry: geo };
        const r2 = await admin
          .from("geofences")
          .upsert(payload, { onConflict: "id" })
          .select("*")
          .maybeSingle();
        data = r2.data;
        error = r2.error;
      }

      if (error) return send(res, 500, { ok: false, build_tag, error: error.message });
      return send(res, 200, { ok: true, row: mapGeofenceRowToLegacy(data), org_id: orgId });
    }

    // -------------------------
    // DELETE → delete geofence
    // - por id (query ?id=)  (siempre dentro del org)
    // - bulk por { nombres_ci } (body)  (org se toma de memberships)
    // -------------------------
    if (req.method === "DELETE") {
      const id = req.query?.id ? String(req.query.id) : "";

      if (id) {
        const { error } = await admin.from("geofences").delete().eq("id", id).eq("org_id", orgId);
        if (error) return send(res, 500, { ok: false, build_tag, error: error.message });
        return send(res, 200, { ok: true });
      }

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const nombres_ci = Array.isArray(body.nombres_ci) ? body.nombres_ci : [];

      if (!nombres_ci.length) {
        return send(res, 422, { ok: false, build_tag, error: "id (query) OR { nombres_ci[] } is required" });
      }

      const wanted = new Set(nombres_ci.map(normalizeCi).filter(Boolean));

      const { data: rows, error: listErr } = await admin
        .from("geofences")
        .select("id, org_id, name")
        .eq("org_id", orgId);

      if (listErr) return send(res, 500, { ok: false, build_tag, error: listErr.message });

      const ids = (rows || [])
        .filter((r) => wanted.has(normalizeCi(r?.name)))
        .map((r) => r.id)
        .filter(Boolean);

      if (!ids.length) return send(res, 200, { ok: true, deleted: 0 });

      const { error: delErr } = await admin.from("geofences").delete().in("id", ids).eq("org_id", orgId);
      if (delErr) return send(res, 500, { ok: false, build_tag, error: delErr.message });

      return send(res, 200, { ok: true, deleted: ids.length });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return send(res, 405, { ok: false, build_tag, error: "Method not allowed" });
  } catch (err) {
    console.error("[api/geocercas][FATAL]", err);
    return send(res, 500, { ok: false, build_tag: "geocercas-v2026-02-memberships", error: err?.message || "fatal" });
  }
}
