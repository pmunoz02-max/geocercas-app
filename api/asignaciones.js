// api/asignaciones.js
// CANÓNICO (memberships) + SERVER-OWNED (service_role):
// - cookie HttpOnly tg_at
// - valida JWT (supabase.auth.getUser()) con ANON
// - resuelve org_id desde memberships (default o 1ro)
// - TODA escritura/lectura de tablas con SERVICE_ROLE (bypass RLS)
// - devuelve: asignaciones + catalogs { personal, geocercas, activities, people(alias) }
//
// ✅ EXTENSION UNIVERSAL:
// - sincroniza tracker_assignments (tracker_user_id + geofence_id) desde asignaciones
// - tracker_user_id se resuelve desde personal.user_id (fallback personal.owner_id)
// - active en tracker_assignments depende de status/estado + is_deleted
// - start_date/end_date se derivan de start_time/end_time (YYYY-MM-DD)

import { createClient } from "@supabase/supabase-js";

const VERSION = "asignaciones-api-v1-memberships-canonical-server-owned";

/* =========================
   Utils
========================= */

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

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Api-Version", VERSION);

  // anti-cache (consistente con otros endpoints)
  res.setHeader("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");

  res.setHeader("Vary", "Cookie");
}

function json(res, status, body) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify({ ...body, version: VERSION }));
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function requireWriteRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (!body) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
  });
}

function normalizeStatus(payload) {
  // UI manda status, algunas filas viejas usan estado
  const v = payload?.status ?? payload?.estado ?? null;
  if (!v) return null;
  return String(v).trim().toLowerCase();
}

function isoToYmd(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return null;
  }
}

/* =========================
   Supabase clients
========================= */

function supabaseAnonForToken(accessToken) {
  const url = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const anon = getEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
}

function supabaseServiceRole() {
  const url = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const srv = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);
  if (!url || !srv) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, srv, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Resuelve usuario + org canónico desde memberships (lectura con service_role):
 * select org_id, role from memberships where user_id=? order by is_default desc limit 1
 */
async function getCanonicalContextOr401(req) {
  const cookies = parseCookies(req);
  const token = cookies.tg_at || null;
  if (!token) return { ok: false, status: 401, error: "missing tg_at cookie" };

  // 1) Validar token y obtener user_id (anon + bearer)
  const supaUser = supabaseAnonForToken(token);
  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: userErr?.message || "invalid session" };
  }
  const userId = userData.user.id;

  // 2) Resolver org desde memberships con SERVICE_ROLE (bypass RLS, consistente prod/preview)
  const supaSrv = supabaseServiceRole();

  // Preferir is_default true, si no existe, fallback al más reciente
  let m = null;

  const d1 = await supaSrv
    .from("memberships")
    .select("org_id, role, is_default, revoked_at, created_at")
    .eq("user_id", userId)
    .eq("is_default", true)
    .is("revoked_at", null)
    .limit(1);

  if (d1.error) return { ok: false, status: 500, error: d1.error.message || "memberships query error" };
  if (Array.isArray(d1.data) && d1.data.length) m = d1.data[0];

  if (!m?.org_id) {
    const d2 = await supaSrv
      .from("memberships")
      .select("org_id, role, is_default, revoked_at, created_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (d2.error) return { ok: false, status: 500, error: d2.error.message || "memberships query error" };
    if (Array.isArray(d2.data) && d2.data.length) m = d2.data[0];
  }

  const orgId = m?.org_id || null;
  if (!orgId) return { ok: false, status: 403, error: "no org in memberships" };

  return {
    ok: true,
    userId,
    orgId,
    role: m?.role || null,
    // cliente server-owned para TODA operación a tablas
    supaSrv,
  };
}

/* =========================
   Catalogs (server-owned)
========================= */

async function loadCatalogs(supaSrv, { orgId }) {
  // Personal
  let personal = [];
  {
    const r = await supaSrv
      .from("personal")
      .select("id,nombre,apellido,email,org_id,is_deleted,user_id,owner_id")
      .eq("org_id", orgId)
      .eq("is_deleted", false)
      .order("nombre", { ascending: true });

    if (!r.error) personal = r.data || [];
  }

  // Geocercas
  let geocercas = [];
  {
    const r = await supaSrv
      .from("geocercas")
      .select("id,nombre,org_id")
      .eq("org_id", orgId)
      .order("nombre", { ascending: true });

    if (!r.error) geocercas = r.data || [];
  }

  // Activities
  let activities = [];
  {
    const r = await supaSrv
      .from("activities")
      .select("id,name,org_id")
      .eq("org_id", orgId)
      .order("name", { ascending: true });

    if (!r.error) activities = r.data || [];
  }

  // Alias para UIs viejas
  const people = personal.map((p) => ({
    org_people_id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    email: p.email,
  }));

  return { personal, geocercas, activities, people };
}

/* ======================================================
   ✅ SYNC UNIVERSAL: asignaciones -> tracker_assignments
====================================================== */

async function resolveTrackerUserIdFromPersonal(supaSrv, { orgId, personalId }) {
  if (!personalId) return { tracker_user_id: null, reason: "missing personal_id" };

  const r = await supaSrv
    .from("personal")
    .select("id, org_id, user_id, owner_id, is_deleted")
    .eq("id", personalId)
    .eq("org_id", orgId)
    .limit(1);

  if (r.error) return { tracker_user_id: null, reason: r.error.message || "personal lookup error" };

  const row = Array.isArray(r.data) && r.data.length ? r.data[0] : null;
  if (!row) return { tracker_user_id: null, reason: "personal not found in org" };
  if (row.is_deleted) return { tracker_user_id: null, reason: "personal is_deleted" };

  const tracker_user_id = row.user_id || row.owner_id || null;
  if (!tracker_user_id) return { tracker_user_id: null, reason: "personal missing user_id/owner_id" };

  return { tracker_user_id, reason: null };
}

async function upsertTrackerAssignment(supaSrv, { orgId, tracker_user_id, geofence_id, active, start_date, end_date }) {
  if (!orgId || !tracker_user_id || !geofence_id) {
    return { ok: false, error: "missing orgId/tracker_user_id/geofence_id" };
  }

  const found = await supaSrv
    .from("tracker_assignments")
    .select("tracker_user_id, geofence_id, org_id")
    .eq("org_id", orgId)
    .eq("tracker_user_id", tracker_user_id)
    .eq("geofence_id", geofence_id)
    .limit(1);

  if (found.error) return { ok: false, error: found.error.message || "tracker_assignments select error" };

  const exists = Array.isArray(found.data) && found.data.length > 0;

  if (exists) {
    const u = await supaSrv
      .from("tracker_assignments")
      .update({
        active: Boolean(active),
        start_date: start_date ?? null,
        end_date: end_date ?? null,
      })
      .eq("org_id", orgId)
      .eq("tracker_user_id", tracker_user_id)
      .eq("geofence_id", geofence_id);

    if (u.error) return { ok: false, error: u.error.message || "tracker_assignments update error" };
    return { ok: true, mode: "update" };
  }

  const ins = await supaSrv.from("tracker_assignments").insert({
    org_id: orgId,
    tracker_user_id,
    geofence_id,
    active: Boolean(active),
    start_date: start_date ?? null,
    end_date: end_date ?? null,
  });

  if (ins.error) return { ok: false, error: ins.error.message || "tracker_assignments insert error" };
  return { ok: true, mode: "insert" };
}

async function deactivateTrackerAssignment(supaSrv, { orgId, tracker_user_id, geofence_id }) {
  if (!orgId || !tracker_user_id || !geofence_id) return { ok: true, skipped: true };

  const u = await supaSrv
    .from("tracker_assignments")
    .update({ active: false })
    .eq("org_id", orgId)
    .eq("tracker_user_id", tracker_user_id)
    .eq("geofence_id", geofence_id);

  if (u.error) return { ok: false, error: u.error.message || "tracker_assignments deactivate error" };
  return { ok: true };
}

async function syncTrackerAssignmentsFromAsignacion(supaSrv, { orgId, asignacionRow }) {
  const personalId = asignacionRow?.personal_id || null;
  const geofenceId = asignacionRow?.geocerca_id || asignacionRow?.geofence_id || null;

  const st = normalizeStatus(asignacionRow);
  const active = st === "activa" && asignacionRow?.is_deleted !== true;

  const start_date = isoToYmd(asignacionRow?.start_time);
  const end_date = isoToYmd(asignacionRow?.end_time);

  const r = await resolveTrackerUserIdFromPersonal(supaSrv, { orgId, personalId });
  if (!r.tracker_user_id) {
    return { ok: false, warning: `cannot resolve tracker_user_id: ${r.reason}` };
  }

  const up = await upsertTrackerAssignment(supaSrv, {
    orgId,
    tracker_user_id: r.tracker_user_id,
    geofence_id: geofenceId,
    active,
    start_date,
    end_date,
  });

  if (!up.ok) return { ok: false, warning: up.error || "sync error" };
  return { ok: true, tracker_user_id: r.tracker_user_id, geofence_id: geofenceId, mode: up.mode };
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

    const ctxRes = await getCanonicalContextOr401(req);
    if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error });

    const { supaSrv, orgId, role } = ctxRes;

    // ======================
    // GET
    // ======================
    if (req.method === "GET") {
      const q = await supaSrv
        .from("asignaciones")
        .select(
          `
          id,
          org_id,
          personal_id,
          geocerca_id,
          activity_id,
          start_time,
          end_time,
          estado,
          status,
          frecuencia_envio_sec,
          is_deleted,
          created_at,
          personal:personal_id ( id, nombre, apellido, email ),
          geocerca:geocerca_id ( id, nombre ),
          activity:activity_id ( id, name )
        `
        )
        .eq("org_id", orgId)
        .eq("is_deleted", false)
        .order("start_time", { ascending: true });

      if (q.error) return json(res, 500, { ok: false, error: q.error.message });

      const catalogs = await loadCatalogs(supaSrv, { orgId });

      return json(res, 200, {
        ok: true,
        data: { asignaciones: q.data || [], catalogs },
      });
    }

    // ======================
    // POST (create)
    // ======================
    if (req.method === "POST") {
      if (!requireWriteRole(role)) {
        return json(res, 403, { ok: false, error: "forbidden", details: "requires owner/admin" });
      }

      const body = (await readJson(req)) || {};

      // Server-owned payload
      const payload = { ...body, org_id: orgId };

      // requeridos
      if (!payload.personal_id) return json(res, 400, { ok: false, error: "personal_id is required" });
      if (!payload.geocerca_id) return json(res, 400, { ok: false, error: "geocerca_id is required" });

      // Nunca confiar en legacy/cliente
      delete payload.tenant_id;
      delete payload.org_people_id;

      const ins = await supaSrv.from("asignaciones").insert(payload).select("*").limit(1);
      if (ins.error) return json(res, 400, { ok: false, error: ins.error.message });

      const row = Array.isArray(ins.data) && ins.data.length ? ins.data[0] : null;

      // Sync tracker_assignments (best effort)
      const sync = row ? await syncTrackerAssignmentsFromAsignacion(supaSrv, { orgId, asignacionRow: row }) : null;

      return json(res, 200, {
        ok: true,
        data: row,
        sync: sync && sync.ok ? sync : undefined,
        warning: sync && !sync.ok ? sync.warning : undefined,
      });
    }

    // ======================
    // PATCH (update)
    // ======================
    if (req.method === "PATCH") {
      if (!requireWriteRole(role)) {
        return json(res, 403, { ok: false, error: "forbidden", details: "requires owner/admin" });
      }

      const body = (await readJson(req)) || {};
      const id = body.id;
      const patch = body.patch;

      if (!id || !patch) return json(res, 400, { ok: false, error: "missing id/patch" });

      // Leer estado actual (server-owned)
      const prevRes = await supaSrv
        .from("asignaciones")
        .select("id, org_id, personal_id, geocerca_id, start_time, end_time, status, estado, is_deleted")
        .eq("id", id)
        .eq("org_id", orgId)
        .limit(1);

      if (prevRes.error) return json(res, 400, { ok: false, error: prevRes.error.message });

      const prev = Array.isArray(prevRes.data) && prevRes.data.length ? prevRes.data[0] : null;
      if (!prev) return json(res, 404, { ok: false, error: "asignacion not found" });

      const safe = { ...patch };
      delete safe.org_id;
      delete safe.tenant_id;
      delete safe.org_people_id;

      const updRes = await supaSrv
        .from("asignaciones")
        .update(safe)
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .limit(1);

      if (updRes.error) return json(res, 400, { ok: false, error: updRes.error.message });

      const updated = Array.isArray(updRes.data) && updRes.data.length ? updRes.data[0] : null;

      // Sync nueva relación
      const syncNew = updated
        ? await syncTrackerAssignmentsFromAsignacion(supaSrv, { orgId, asignacionRow: updated })
        : null;

      // Si cambió personal o geocerca, desactivar la relación anterior
      let deactivatedPrev = null;
      try {
        const changed =
          String(prev.personal_id || "") !== String(updated?.personal_id || "") ||
          String(prev.geocerca_id || "") !== String(updated?.geocerca_id || "");

        if (changed) {
          const rPrev = await resolveTrackerUserIdFromPersonal(supaSrv, { orgId, personalId: prev.personal_id });
          if (rPrev.tracker_user_id && prev.geocerca_id) {
            deactivatedPrev = await deactivateTrackerAssignment(supaSrv, {
              orgId,
              tracker_user_id: rPrev.tracker_user_id,
              geofence_id: prev.geocerca_id,
            });
          }
        }
      } catch {
        // best effort
      }

      return json(res, 200, {
        ok: true,
        data: updated,
        sync: syncNew && syncNew.ok ? syncNew : undefined,
        warning: syncNew && !syncNew.ok ? syncNew.warning : undefined,
        deactivatedPrev: deactivatedPrev && deactivatedPrev.ok ? true : undefined,
      });
    }

    // ======================
    // DELETE (soft)
    // ======================
    if (req.method === "DELETE") {
      if (!requireWriteRole(role)) {
        return json(res, 403, { ok: false, error: "forbidden", details: "requires owner/admin" });
      }

      const body = (await readJson(req)) || {};
      const id = body.id;
      if (!id) return json(res, 400, { ok: false, error: "missing id" });

      // Leer asignación para desactivar tracker_assignment
      const prevRes = await supaSrv
        .from("asignaciones")
        .select("id, org_id, personal_id, geocerca_id")
        .eq("id", id)
        .eq("org_id", orgId)
        .limit(1);

      if (prevRes.error) return json(res, 400, { ok: false, error: prevRes.error.message });

      const prev = Array.isArray(prevRes.data) && prevRes.data.length ? prevRes.data[0] : null;

      const delRes = await supaSrv
        .from("asignaciones")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId);

      if (delRes.error) return json(res, 400, { ok: false, error: delRes.error.message });

      // Desactivar tracker_assignment (best effort)
      let deactivated = null;
      if (prev?.personal_id && prev?.geocerca_id) {
        const rPrev = await resolveTrackerUserIdFromPersonal(supaSrv, { orgId, personalId: prev.personal_id });
        if (rPrev.tracker_user_id) {
          deactivated = await deactivateTrackerAssignment(supaSrv, {
            orgId,
            tracker_user_id: rPrev.tracker_user_id,
            geofence_id: prev.geocerca_id,
          });
        }
      }

      return json(res, 200, { ok: true, deactivated: deactivated?.ok ? true : undefined });
    }

    res.setHeader("Allow", "GET,POST,PATCH,DELETE,OPTIONS,HEAD");
    return json(res, 405, { ok: false, error: "method not allowed" });
  } catch (e) {
    console.error("[api/asignaciones] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "fatal" });
  }
}
