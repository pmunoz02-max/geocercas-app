// api/asignaciones.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "asignaciones-api-v9-fix-geocercaid-notnull-client-compat";

/* =========================
   Headers / Cookies / Query
========================= */

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Vary", "Cookie");

  res.setHeader("X-Api-Version", VERSION);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS,HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function send(res, status, obj) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify({ ...(obj || {}), version: VERSION }));
}

function ok(res, obj) {
  return send(res, 200, obj);
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function getEnv(keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function getQuery(req) {
  try {
    const u = new URL(req.url, "http://localhost");
    const out = {};
    for (const [k, v] of u.searchParams.entries()) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function stripUndefined(obj) {
  const o = obj && typeof obj === "object" ? obj : {};
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/* =========================
   Context Resolver
========================= */

async function resolveContext(req) {
  const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const SUPABASE_ANON_KEY = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
  const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Server misconfigured",
      details: {
        has: {
          SUPABASE_URL: Boolean(SUPABASE_URL),
          SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        },
      },
    };
  }

  const accessToken = getCookie(req, "tg_at");
  if (!accessToken) {
    return { ok: false, status: 401, error: "Not authenticated", details: "Missing tg_at cookie" };
  }

  const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: u1, error: uerr } = await sbUser.auth.getUser();
  const user = u1?.user ? { id: u1.user.id, email: u1.user.email } : null;
  if (!user || uerr) {
    return { ok: false, status: 401, error: "Invalid session", details: uerr?.message || "No user" };
  }

  const sbSrv = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

  // Resolver org_id desde memberships (default primero)
  const sbDb = sbSrv || sbUser;

  const { data: mRow, error: mErr } = await sbDb
    .from("memberships")
    .select("org_id, role, is_default, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (mErr) {
    return { ok: false, status: 500, error: "Membership lookup failed", details: mErr.message };
  }
  if (!mRow?.org_id) {
    return { ok: false, status: 403, error: "No membership", details: "User has no active membership" };
  }

  const ctx = {
    org_id: String(mRow.org_id),
    tenant_id: String(mRow.org_id),
    role: String(mRow.role || "member"),
  };

  return { ok: true, ctx, user, sbDb };
}

/* =========================
   Catalog loaders (robust)
========================= */

async function loadCatalogs(sbDb, orgId) {
  const catalogs = { personal: [], geocercas: [], activities: [], people: [] };

  // Personal
  try {
    const r = await sbDb
      .from("personal")
      .select("id,nombre,apellido,email,org_id,active")
      .eq("org_id", orgId)
      .order("nombre", { ascending: true })
      .limit(500);
    if (!r.error) {
      catalogs.personal = (r.data || []).map((p) => ({
        id: p.id,
        nombre: p.nombre || p.name || "",
        apellido: p.apellido || "",
        email: p.email || "",
        active: p.active,
      }));
    }
  } catch {}

  // Geofences → catalogs.geocercas (compat UI)
  try {
    const r = await sbDb
      .from("geofences")
      .select("id,name,org_id,active")
      .eq("org_id", orgId)
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(500);
    if (!r.error) {
      catalogs.geocercas = (r.data || []).map((g) => ({
        id: g.id,
        nombre: g.name,
        active: g.active,
      }));
    }
  } catch {}

  // Activities
  try {
    const r = await sbDb
      .from("activities")
      .select("id,name,org_id,active")
      .eq("org_id", orgId)
      .order("name", { ascending: true })
      .limit(500);
    if (!r.error) {
      catalogs.activities = (r.data || []).map((a) => ({
        id: a.id,
        nombre: a.name,
        active: a.active,
      }));
    }
  } catch {}

  return catalogs;
}

/* =========================
   Normalización IDs (CRÍTICO)
========================= */

/**
 * Tabla asignaciones en tu DB exige:
 * - geocerca_id NOT NULL
 *
 * Por compat:
 * - la UI puede mandar geofence_id (id de geofences)
 * - la UI puede mandar geocerca_id (legacy)
 *
 * Política segura:
 * - nunca nullificamos geocerca_id
 * - si viene geofence_id y no viene geocerca_id => geocerca_id = geofence_id
 *   (porque la columna NOT NULL requiere un id; en tu modelo actual, el selector de geocerca usa geofences)
 */
function normalizeIds(payload) {
  const p = payload && typeof payload === "object" ? payload : {};

  // aceptar camelCase
  if (p.geofenceId && !p.geofence_id) p.geofence_id = p.geofenceId;
  if (p.geocercaId && !p.geocerca_id) p.geocerca_id = p.geocercaId;

  // si solo viene geofence_id, úsalo para llenar geocerca_id (NOT NULL)
  if (!p.geocerca_id && p.geofence_id) {
    p.geocerca_id = p.geofence_id;
  }

  return p;
}

/* =========================
   Handler
========================= */

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      setHeaders(res);
      res.statusCode = 204;
      return res.end();
    }
    if (req.method === "HEAD") {
      setHeaders(res);
      res.statusCode = 200;
      return res.end();
    }

    const q = getQuery(req);
    const action = String(q.action || "bundle");

    const rc = await resolveContext(req);
    if (!rc.ok) return send(res, rc.status || 500, { ok: false, error: rc.error, details: rc.details });

    const orgId = rc.ctx.org_id;
    const sbDb = rc.sbDb;

    // GET bundle/list
    if (req.method === "GET" && (action === "bundle" || action === "list")) {
      let asignaciones = [];
      const r = await sbDb
        .from("asignaciones")
        .select(
          "id,org_id,personal_id,geocerca_id,geofence_id,activity_id,start_time,end_time,estado,status,frecuencia_envio_sec,is_deleted,created_at"
        )
        .eq("org_id", orgId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(500);

      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });
      asignaciones = r.data || [];

      if (action === "list") return ok(res, { ok: true, data: asignaciones, asignaciones });

      const catalogs = await loadCatalogs(sbDb, orgId);
      return ok(res, { ok: true, data: { asignaciones, catalogs } });
    }

    // POST create
    if (req.method === "POST") {
      const payload0 = await readBody(req);
      const payload = normalizeIds(payload0 || {});

      if (!payload.personal_id) return send(res, 400, { ok: false, error: "personal_id is required" });
      if (!payload.geocerca_id)
        return send(res, 400, { ok: false, error: "geocerca_id is required (NOT NULL)" });

      // enforce org_id
      payload.org_id = orgId;

      // blindaje: no aceptar is_deleted desde cliente
      delete payload.is_deleted;

      stripUndefined(payload);

      const r = await sbDb.from("asignaciones").insert(payload).select("*").single();
      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      // ✅ compat con cliente: responde en data
      return ok(res, { ok: true, data: r.data, item: r.data });
    }

    // PATCH update (cliente manda { id, patch })
    if (req.method === "PATCH") {
      const body = await readBody(req);
      const id = String(body?.id || q.id || "");
      const patch0 = body?.patch && typeof body.patch === "object" ? body.patch : body;

      if (!id) return send(res, 400, { ok: false, error: "id is required" });

      const patch = normalizeIds({ ...(patch0 || {}) });
      delete patch.id;
      delete patch.patch;

      // enforce org_id
      patch.org_id = orgId;

      // no permitir soft-delete desde patch (solo DELETE)
      delete patch.is_deleted;

      stripUndefined(patch);

      const r = await sbDb.from("asignaciones").update(patch).eq("id", id).eq("org_id", orgId).select("*").single();
      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      return ok(res, { ok: true, data: r.data, item: r.data });
    }

    // DELETE (cliente manda { id }) → soft delete (is_deleted=true)
    if (req.method === "DELETE") {
      const body = await readBody(req);
      const id = String(body?.id || q.id || "");
      if (!id) return send(res, 400, { ok: false, error: "id is required" });

      const r = await sbDb
        .from("asignaciones")
        .update({ is_deleted: true })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .single();

      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      return ok(res, { ok: true, data: r.data, item: r.data });
    }

    return send(res, 405, { ok: false, error: "Method not allowed", method: req.method });
  } catch (e) {
    return send(res, 500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
}