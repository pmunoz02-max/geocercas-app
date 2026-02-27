// api/asignaciones.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "asignaciones-api-v8-bundle-canonical-geofences";

/* =========================
   Headers / Cookies / Query
========================= */

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
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
    if (v) return v;
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

/* =========================
   Context Resolver (copy from geofences.js pattern)
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

  async function tryMaybeSingle(client, builderFn) {
    try {
      const { data, error } = await builderFn(client);
      if (error) return { ok: false, error };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: { message: String(e?.message || e) } };
    }
  }

  let currentOrgId = null;
  const ucoQuery = (c) => c.from("user_current_org").select("org_id").eq("user_id", user.id).maybeSingle();

  if (sbSrv) {
    const r1 = await tryMaybeSingle(sbSrv, ucoQuery);
    if (r1.ok && r1.data?.org_id) currentOrgId = String(r1.data.org_id);
  }
  if (!currentOrgId) {
    const r2 = await tryMaybeSingle(sbUser, ucoQuery);
    if (r2.ok && r2.data?.org_id) currentOrgId = String(r2.data.org_id);
  }

  const membershipForOrg = (orgId) => (c) =>
    c
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .maybeSingle();

  const membershipDefault = (c) =>
    c
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

  async function resolveMembership() {
    if (currentOrgId) {
      if (sbSrv) {
        const r = await tryMaybeSingle(sbSrv, membershipForOrg(currentOrgId));
        if (r.ok && r.data?.org_id) return r.data;
      }
      const r2 = await tryMaybeSingle(sbUser, membershipForOrg(currentOrgId));
      if (r2.ok && r2.data?.org_id) return r2.data;
    }

    if (sbSrv) {
      const r = await tryMaybeSingle(sbSrv, membershipDefault);
      if (r.ok && r.data?.org_id) return r.data;
    }
    const r2 = await tryMaybeSingle(sbUser, membershipDefault);
    if (r2.ok && r2.data?.org_id) return r2.data;

    return null;
  }

  const mRow = await resolveMembership();
  if (!mRow?.org_id) {
    return { ok: false, status: 403, error: "No membership", details: "User has no active membership" };
  }

  const ctx = {
    org_id: String(mRow.org_id),
    tenant_id: String(mRow.org_id),
    role: String(mRow.role || "member"),
  };

  const sbDb = sbSrv || sbUser;
  return { ok: true, ctx, user, sbDb };
}

/* =========================
   Catalog loaders (robust)
========================= */

async function loadCatalogs(sbDb, orgId) {
  const catalogs = { personal: [], geocercas: [], activities: [], people: [] };

  // Personal (prefer 'personal' table)
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
  } catch {
    // ignore
  }

  // Fallback people (org_people) if needed by UI
  if (!catalogs.personal.length) {
    try {
      const r = await sbDb
        .from("org_people")
        .select("id,nombre,apellido,email,org_id,active")
        .eq("org_id", orgId)
        .order("nombre", { ascending: true })
        .limit(500);

      if (!r.error) {
        catalogs.people = (r.data || []).map((p) => ({
          org_people_id: p.id,
          nombre: p.nombre || "",
          apellido: p.apellido || "",
          email: p.email || "",
          active: p.active,
        }));
      }
    } catch {
      // ignore
    }
  }

  // Geofences (canonical) but return as catalogs.geocercas for UI compat
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
        nombre: g.name, // UI uses nombre
        active: g.active,
      }));
    }
  } catch {
    // ignore
  }

  // Activities (optional)
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
  } catch {
    // ignore
  }

  return catalogs;
}

/* =========================
   Geofence/Geocerca compat
========================= */

async function normalizeGeofenceIds(sbDb, orgId, payload) {
  const p = payload && typeof payload === "object" ? payload : {};

  // UI legacy: manda geocerca_id pero ahora es geofence_id
  if (!p.geofence_id && p.geocerca_id) {
    p.geofence_id = p.geocerca_id;
    p.geocerca_id = null;
  }

  // Derivar geocerca_id desde source_geocerca_id si existe (trace)
  if (p.geofence_id && !p.geocerca_id) {
    const r = await sbDb
      .from("geofences")
      .select("id,org_id,source_geocerca_id")
      .eq("org_id", orgId)
      .eq("id", p.geofence_id)
      .maybeSingle();

    if (!r.error && r.data?.source_geocerca_id) p.geocerca_id = r.data.source_geocerca_id;
  }

  // Si geocerca_id viene pero no existe, nulificar (evitar FK)
  if (p.geocerca_id) {
    const r2 = await sbDb.from("geocercas").select("id").eq("id", p.geocerca_id).maybeSingle();
    if (r2.error || !r2.data?.id) p.geocerca_id = null;
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

    if (req.method === "GET" && action === "ping") {
      return ok(res, { ok: true, ping: true, org_id: orgId });
    }

    if (req.method === "GET" && (action === "bundle" || action === "list")) {
      // asignaciones list (robust; no embeds)
      let asignaciones = [];
      try {
        const r = await sbDb
          .from("asignaciones")
          .select(
            "id,org_id,personal_id,geocerca_id,geofence_id,activity_id,start_time,end_time,estado,status,frecuencia_envio_sec,is_deleted,created_at"
          )
          .eq("org_id", orgId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(500);

        if (!r.error) asignaciones = r.data || [];
      } catch {
        // ignore
      }

      if (action === "list") return ok(res, { ok: true, asignaciones });

      const catalogs = await loadCatalogs(sbDb, orgId);
      return ok(res, { ok: true, data: { asignaciones, catalogs } });
    }

    if (req.method === "POST") {
      const payload = await readBody(req);
      if (!payload.personal_id) return send(res, 400, { ok: false, error: "personal_id is required" });
      if (!payload.geofence_id && !payload.geocerca_id)
        return send(res, 400, { ok: false, error: "geofence_id is required" });

      await normalizeGeofenceIds(sbDb, orgId, payload);

      // enforce org_id from ctx
      payload.org_id = orgId;

      const r = await sbDb.from("asignaciones").insert(payload).select("*").limit(1);
      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      return ok(res, { ok: true, item: (r.data || [])[0] || null });
    }

    if (req.method === "PATCH") {
      const payload = await readBody(req);
      const id = String(q.id || payload.id || "");
      if (!id) return send(res, 400, { ok: false, error: "id is required" });

      await normalizeGeofenceIds(sbDb, orgId, payload);

      delete payload.id;
      payload.org_id = orgId;

      const r = await sbDb.from("asignaciones").update(payload).eq("id", id).eq("org_id", orgId).select("*").limit(1);
      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      return ok(res, { ok: true, item: (r.data || [])[0] || null });
    }

    return send(res, 400, { ok: false, error: "Unsupported action/method", action, method: req.method });
  } catch (e) {
    return send(res, 500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
}
