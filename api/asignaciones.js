// api/asignaciones.js

// Force Node.js runtime on Vercel (avoid Edge runtime incompatibilities)
export const config = { runtime: "nodejs" };
// CANÓNICO (memberships) + SERVER-OWNED (service_role):
// - cookie HttpOnly tg_at
// - valida JWT (supabase.auth.getUser()) con ANON
// - resuelve org_id desde memberships (default o 1ro) [tolerante a schemas]
// - TODA escritura/lectura de tablas con SERVICE_ROLE (bypass RLS)
// - devuelve: asignaciones + catalogs { personal, geocercas, activities, people(alias) }
//
// ✅ EXTENSION UNIVERSAL:
// - sincroniza tracker_assignments (tracker_user_id + geofence_id) desde asignaciones
// - tracker_user_id se resuelve desde personal.user_id (fallback personal.owner_id)
// - active en tracker_assignments depende de status/estado + is_deleted
// - start_date/end_date se derivan de start_time/end_time (YYYY-MM-DD)
//
// ✅ FIX UNIVERSAL:
// - catalogs.geocercas muestra SOLO activas por defecto (si existen columnas activo/active)
//   sin romper si no existen esas columnas.

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

function toInt(v, fallback = null) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}


/* =========================
   Geofence/Geocerca compat
   - UI legacy manda geocerca_id pero ahora es geofence_id (Opción 1)
   - geocerca_id es legacy/trace (nullable)
========================= */

async function normalizeGeofenceIds(supaSrv, { orgId, payload }) {
  const p = payload && typeof payload === "object" ? payload : {};

  // Caso 1: UI manda geocerca_id con un id de geofences (por compat)
  if (!p.geofence_id && p.geocerca_id) {
    p.geofence_id = p.geocerca_id;
    p.geocerca_id = null;
  }

  // Caso 2: tenemos geofence_id -> opcionalmente derivar geocerca_id desde source_geocerca_id
  if (p.geofence_id && !p.geocerca_id) {
    const gid = String(p.geofence_id);
    const r = await supaSrv
      .from("geofences")
      .select("id, org_id, source_geocerca_id")
      .eq("org_id", orgId)
      .eq("id", gid)
      .maybeSingle();

    if (!r.error && r.data?.source_geocerca_id) {
      p.geocerca_id = r.data.source_geocerca_id;
    }
  }

  // Caso 3: si geocerca_id viene y es inválido, lo nulificamos para evitar FK
  if (p.geocerca_id) {
    const cid = String(p.geocerca_id);
    const r2 = await supaSrv.from("geocercas").select("id").eq("id", cid).maybeSingle();
    if (r2.error || !r2.data?.id) {
      p.geocerca_id = null;
    }
  }

  return p;
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

/* =========================
   Context resolver (universal)
========================= */

async function getCanonicalContextOr401(req) {
  const cookies = parseCookies(req);
  const token = cookies.tg_at || null;
  if (!token) return { ok: false, status: 401, error: "missing tg_at cookie" };

  const supaUser = supabaseAnonForToken(token);
  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: userErr?.message || "invalid session" };
  }
  const userId = userData.user.id;

  const supaSrv = supabaseServiceRole();

  // memberships: tolerante a esquemas (revoked_at puede no existir)
  async function queryMembership({ withRevokedAt }) {
    const cols = withRevokedAt
      ? "org_id, role, is_default, revoked_at, created_at"
      : "org_id, role, is_default, created_at";

    let q = supaSrv
      .from("memberships")
      .select(cols)
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (withRevokedAt) q = q.is("revoked_at", null);

    return await q;
  }

  let mRes = await queryMembership({ withRevokedAt: true });
  if (mRes.error) {
    // fallback sin revoked_at
    mRes = await queryMembership({ withRevokedAt: false });
    if (mRes.error) return { ok: false, status: 500, error: mRes.error.message || "memberships query error" };
  }

  const m = Array.isArray(mRes.data) && mRes.data.length ? mRes.data[0] : null;
  const orgId = m?.org_id || null;
  if (!orgId) return { ok: false, status: 403, error: "no org in memberships" };

  return { ok: true, userId, orgId, role: m?.role || null, supaSrv };
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

  // Geocercas (universal: intenta activo/active, si no, sin filtro)
  let geocercas = [];
  {
    // 1) activo=true
    let r = await supaSrv
      .from("geocercas")
      .select("id,nombre,org_id,activo")
      .eq("org_id", orgId)
      .eq("activo", true)
      .order("nombre", { ascending: true });

    // 2) active=true
    if (r.error) {
      r = await supaSrv
        .from("geocercas")
        .select("id,nombre,org_id,active")
        .eq("org_id", orgId)
        .eq("active", true)
        .order("nombre", { ascending: true });
    }

    // 3) fallback sin filtro (no romper)
    if (r.error) {
      r = await supaSrv
        .from("geocercas")
        .select("id,nombre,org_id")
        .eq("org_id", orgId)
        .order("nombre", { ascending: true });
    }

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

  // Alias compat
  const people = personal.map((p) => ({
    org_people_id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    email: p.email,
  }));

  return { personal, geocercas, activities, people };
}

/* ======================================================
   SYNC: asignaciones -> tracker_assignments (server-owned)
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
  if (!r.tracker_user_id) return { ok: false, warning: `cannot resolve tracker_user_id: ${r.reason}` };

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

    if (req.method === "GET") {
      // ⛑️  Bundle robusto: NO fallar 500 por joins/embeds. Siempre devolver catalogs.
      let asignaciones = [];
      let asignaciones_error = null;

      try {
        const q = await supaSrv
          .from("asignaciones")
          .select(
            `
            id,
            org_id,
            personal_id,
            geocerca_id,
            geofence_id,
            activity_id,
            start_time,
            end_time,
            estado,
            status,
            frecuencia_envio_sec,
            is_deleted,
            created_at
          `
          )
          .eq("org_id", orgId)
          .eq("is_deleted", false)
          .order("start_time", { ascending: true });

        if (q.error) {
          asignaciones_error = q.error.message;
        } else {
          asignaciones = q.data || [];
        }
      } catch (e) {
        asignaciones_error = String(e?.message || e);
      }

      let catalogs = null;
      let catalogs_error = null;
      try {
        catalogs = await loadCatalogs(supaSrv, { orgId });
      } catch (e) {
        catalogs_error = String(e?.message || e);
        catalogs = { personal: [], geocercas: [], activities: [], people: [] };
      }

      return json(res, 200, {
        ok: true,
        data: { asignaciones, catalogs },
        warning: asignaciones_error || catalogs_error ? { asignaciones_error, catalogs_error } : undefined,
      });
    }

    if (req.method === "POST") {
      if (!requireWriteRole(role)) {
        return json(res, 403, { ok: false, error: "forbidden", details: "requires owner/admin" });
      }

      const body = (await readJson(req)) || {};
      const payload = { ...body, org_id: orgId };

      if (!payload.personal_id) return json(res, 400, { ok: false, error: "personal_id is required" });
      // Opción 1: geofence_id canónico. geocerca_id es legacy/trace (nullable)
      if (!payload.geofence_id && !payload.geocerca_id) {
        return json(res, 400, { ok: false, error: "geofence_id is required" });
      }

      // normaliza frecuencia: UI suele mandar minutos -> segundos
      if (payload.frecuencia_envio_min !== undefined && payload.frecuencia_envio_sec === undefined) {
        const m = toInt(payload.frecuencia_envio_min, null);
        if (m !== null) payload.frecuencia_envio_sec = m * 60;
        delete payload.frecuencia_envio_min;
      }
      if (payload.frecuencia_envio_sec !== undefined) {
        const s = toInt(payload.frecuencia_envio_sec, 300);
        payload.frecuencia_envio_sec = Math.max(300, s);
      }

      delete payload.tenant_id;
      delete payload.org_people_id;

      await normalizeGeofenceIds(supaSrv, { orgId, payload });

      const ins = await supaSrv.from("asignaciones").insert(payload).select("*").limit(1);
      if (ins.error) return json(res, 400, { ok: false, error: ins.error.message });

      const row = Array.isArray(ins.data) && ins.data.length ? ins.data[0] : null;
      const sync = row ? await syncTrackerAssignmentsFromAsignacion(supaSrv, { orgId, asignacionRow: row }) : null;

      return json(res, 200, {
        ok: true,
        data: row,
        sync: sync && sync.ok ? sync : undefined,
        warning: sync && !sync.ok ? sync.warning : undefined,
      });
    }

    if (req.method === "PATCH") {
      if (!requireWriteRole(role)) {
        return json(res, 403, { ok: false, error: "forbidden", details: "requires owner/admin" });
      }

      const body = (await readJson(req)) || {};
      const id = body.id;
      const patch = body.patch;

      if (!id || !patch) return json(res, 400, { ok: false, error: "missing id/patch" });

      const prevRes = await supaSrv
        .from("asignaciones")
        .select("id, org_id, personal_id, geocerca_id,
          geofence_id, start_time, end_time, status, estado, is_deleted")
        .eq("id", id)
        .eq("org_id", orgId)
        .limit(1);

      if (prevRes.error) return json(res, 400, { ok: false, error: prevRes.error.message });
      const prev = Array.isArray(prevRes.data) && prevRes.data.length ? prevRes.data[0] : null;
      if (!prev) return json(res, 404, { ok: false, error: "asignacion not found" });

      const safe = { ...patch };
      await normalizeGeofenceIds(supaSrv, { orgId, payload: safe });
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

      const syncNew = updated ? await syncTrackerAssignmentsFromAsignacion(supaSrv, { orgId, asignacionRow: updated }) : null;

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
          geofence_id,
            });
          }
        }
      } catch {}

      return json(res, 200, {
        ok: true,
        data: updated,
        sync: syncNew && syncNew.ok ? syncNew : undefined,
        warning: syncNew && !syncNew.ok ? syncNew.warning : undefined,
        deactivatedPrev: deactivatedPrev && deactivatedPrev.ok ? true : undefined,
      });
    }

    if (req.method === "DELETE") {
      if (!requireWriteRole(role)) {
        return json(res, 403, { ok: false, error: "forbidden", details: "requires owner/admin" });
      }

      const body = (await readJson(req)) || {};
      const id = body.id;
      if (!id) return json(res, 400, { ok: false, error: "missing id" });

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

      let deactivated = null;
      if (prev?.personal_id && prev?.geocerca_id) {
        const rPrev = await resolveTrackerUserIdFromPersonal(supaSrv, { orgId, personalId: prev.personal_id });
        if (rPrev.tracker_user_id) {
          deactivated = await deactivateTrackerAssignment(supaSrv, {
            orgId,
            tracker_user_id: rPrev.tracker_user_id,
            geofence_id: prev.geocerca_id,
          geofence_id,
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
