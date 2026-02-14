// api/asignaciones.js
// CANONICO (memberships):
// - cookie HttpOnly tg_at
// - valida JWT (supabase.auth.getUser())
// - resuelve org_id desde memberships (is_default desc)
// - NO usa bootstrap_session_context / bootstrap_user_context
// - devuelve: asignaciones + catalogs { personal, geocercas, activities, people(alias) }
//
// ✅ EXTENSION UNIVERSAL:
// - sincroniza tracker_assignments (tracker_user_id + geofence_id) desde asignaciones
// - tracker_user_id se resuelve desde personal.user_id (fallback personal.owner_id)
// - active en tracker_assignments depende de status/estado + is_deleted
// - start_date/end_date se derivan de start_time/end_time (YYYY-MM-DD)

import { createClient } from "@supabase/supabase-js";

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

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function supabaseForToken(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (!body) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
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

/**
 * Resuelve usuario + org canónico desde memberships:
 * select org_id, role from memberships where user_id=? order by is_default desc limit 1
 */
async function getCanonicalContextOr401(req) {
  const cookies = parseCookies(req);
  const token = cookies.tg_at || null;
  if (!token) return { ok: false, status: 401, error: "missing tg_at cookie" };

  const supabase = supabaseForToken(token);

  // 1) Validar token y obtener user_id
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: userErr?.message || "invalid session" };
  }
  const userId = userData.user.id;

  // 2) Resolver org desde memberships (canónico)
  const { data: mRows, error: mErr } = await supabase
    .from("memberships")
    .select("org_id, role, is_default, created_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (mErr) return { ok: false, status: 401, error: mErr.message || "memberships query error" };

  const m = Array.isArray(mRows) ? mRows[0] : null;
  const orgId = m?.org_id || null;

  if (!orgId) return { ok: false, status: 401, error: "no org in memberships" };

  return { ok: true, supabase, userId, orgId, role: m?.role || null };
}

async function loadCatalogs(supabase, { orgId }) {
  // ✅ Personal (mismo catálogo que PersonalPage)
  let personal = [];
  {
    const r = await supabase
      .from("personal")
      .select("id,nombre,apellido,email,org_id,is_deleted")
      .eq("org_id", orgId)
      .eq("is_deleted", false)
      .order("nombre", { ascending: true });

    if (!r.error) personal = r.data || [];
  }

  // ✅ Geocercas
  let geocercas = [];
  {
    const r = await supabase
      .from("geocercas")
      .select("id,nombre,org_id")
      .eq("org_id", orgId)
      .order("nombre", { ascending: true });

    if (!r.error) geocercas = r.data || [];
  }

  // ✅ Activities
  let activities = [];
  {
    const r = await supabase
      .from("activities")
      .select("id,name,org_id")
      .eq("org_id", orgId)
      .order("name", { ascending: true });

    if (!r.error) activities = r.data || [];
  }

  // Alias de compatibilidad para UIs viejas
  const people = personal.map((p) => ({
    org_people_id: p.id, // alias para selects viejos (usa el id de personal)
    nombre: p.nombre,
    apellido: p.apellido,
    email: p.email,
  }));

  return { personal, geocercas, activities, people };
}

// ======================================================
// ✅ SYNC UNIVERSAL: asignaciones -> tracker_assignments
// ======================================================

async function resolveTrackerUserIdFromPersonal(supabase, { orgId, personalId }) {
  if (!personalId) return { tracker_user_id: null, reason: "missing personal_id" };

  const { data, error } = await supabase
    .from("personal")
    .select("id, org_id, user_id, owner_id, is_deleted")
    .eq("id", personalId)
    .eq("org_id", orgId)
    .limit(1);

  if (error) return { tracker_user_id: null, reason: error.message || "personal lookup error" };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { tracker_user_id: null, reason: "personal not found in org" };
  if (row.is_deleted) return { tracker_user_id: null, reason: "personal is_deleted" };

  const tracker_user_id = row.user_id || row.owner_id || null;
  if (!tracker_user_id) return { tracker_user_id: null, reason: "personal missing user_id/owner_id" };

  return { tracker_user_id, reason: null };
}

async function upsertTrackerAssignment(supabase, { orgId, tracker_user_id, geofence_id, active, start_date, end_date }) {
  if (!orgId || !tracker_user_id || !geofence_id) {
    return { ok: false, error: "missing orgId/tracker_user_id/geofence_id" };
  }

  // Intento 1: update si existe
  const found = await supabase
    .from("tracker_assignments")
    .select("tracker_user_id, geofence_id, org_id")
    .eq("org_id", orgId)
    .eq("tracker_user_id", tracker_user_id)
    .eq("geofence_id", geofence_id)
    .limit(1);

  if (found.error) return { ok: false, error: found.error.message || "tracker_assignments select error" };

  const exists = Array.isArray(found.data) && found.data.length > 0;

  if (exists) {
    const u = await supabase
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

  // Intento 2: insert
  const ins = await supabase.from("tracker_assignments").insert({
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

async function deactivateTrackerAssignment(supabase, { orgId, tracker_user_id, geofence_id }) {
  if (!orgId || !tracker_user_id || !geofence_id) return { ok: true, skipped: true };

  const u = await supabase
    .from("tracker_assignments")
    .update({ active: false })
    .eq("org_id", orgId)
    .eq("tracker_user_id", tracker_user_id)
    .eq("geofence_id", geofence_id);

  if (u.error) return { ok: false, error: u.error.message || "tracker_assignments deactivate error" };
  return { ok: true };
}

async function syncTrackerAssignmentsFromAsignacion(supabase, { orgId, asignacionRow }) {
  // asignacionRow debe tener personal_id, geocerca_id, status/estado, start_time, end_time, is_deleted
  const personalId = asignacionRow?.personal_id || null;
  const geofenceId = asignacionRow?.geocerca_id || asignacionRow?.geofence_id || null;

  const st = normalizeStatus(asignacionRow);
  const active = st === "activa" && asignacionRow?.is_deleted !== true;

  const start_date = isoToYmd(asignacionRow?.start_time);
  const end_date = isoToYmd(asignacionRow?.end_time);

  const r = await resolveTrackerUserIdFromPersonal(supabase, { orgId, personalId });
  if (!r.tracker_user_id) {
    // No romper la API de asignaciones: devolvemos warning, pero no fallamos duro.
    return { ok: false, warning: `cannot resolve tracker_user_id: ${r.reason}` };
  }

  const up = await upsertTrackerAssignment(supabase, {
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

export default async function handler(req, res) {
  try {
    const ctxRes = await getCanonicalContextOr401(req);
    if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error });

    const { supabase, orgId } = ctxRes;

    if (req.method === "GET") {
      let q = supabase
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

      const { data: asignaciones, error } = await q;
      if (error) return json(res, 500, { ok: false, error: error.message });

      const catalogs = await loadCatalogs(supabase, { orgId });

      return json(res, 200, { ok: true, data: { asignaciones: asignaciones || [], catalogs } });
    }

    if (req.method === "POST") {
      const body = (await readJson(req)) || {};

      const payload = {
        ...body,
        org_id: orgId, // ✅ siempre desde contexto
      };

      // ✅ Canon: personal_id obligatorio
      if (!payload.personal_id) {
        return json(res, 400, { ok: false, error: "personal_id is required" });
      }
      if (!payload.geocerca_id) {
        return json(res, 400, { ok: false, error: "geocerca_id is required" });
      }

      // Nunca confiar en legacy/cliente
      delete payload.tenant_id;
      delete payload.org_people_id;

      const { data, error } = await supabase.from("asignaciones").insert(payload).select("*").single();
      if (error) return json(res, 400, { ok: false, error: error.message });

      // ✅ Sync tracker_assignments (best effort)
      const sync = await syncTrackerAssignmentsFromAsignacion(supabase, { orgId, asignacionRow: data });

      return json(res, 200, {
        ok: true,
        data,
        sync: sync.ok ? sync : undefined,
        warning: !sync.ok ? sync.warning : undefined,
      });
    }

    if (req.method === "PATCH") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      const patch = body.patch;

      if (!id || !patch) return json(res, 400, { ok: false, error: "missing id/patch" });

      // Leer estado actual para poder desactivar relación anterior si cambió
      const prevRes = await supabase
        .from("asignaciones")
        .select("id, org_id, personal_id, geocerca_id, start_time, end_time, status, estado, is_deleted")
        .eq("id", id)
        .eq("org_id", orgId)
        .limit(1);

      if (prevRes.error) return json(res, 400, { ok: false, error: prevRes.error.message });
      const prev = Array.isArray(prevRes.data) ? prevRes.data[0] : null;
      if (!prev) return json(res, 404, { ok: false, error: "asignacion not found" });

      const safe = { ...patch };
      delete safe.org_id;
      delete safe.tenant_id;
      delete safe.org_people_id;

      let q = supabase.from("asignaciones").update(safe).eq("id", id).eq("org_id", orgId);
      const { data, error } = await q.select("*").single();
      if (error) return json(res, 400, { ok: false, error: error.message });

      // ✅ Sync nueva relación
      const syncNew = await syncTrackerAssignmentsFromAsignacion(supabase, { orgId, asignacionRow: data });

      // ✅ Si cambió personal o geocerca, desactivar la relación anterior
      let deactivatedPrev = null;
      try {
        const prevPersonalId = prev.personal_id;
        const prevGeofenceId = prev.geocerca_id;

        const changed =
          String(prevPersonalId || "") !== String(data.personal_id || "") ||
          String(prevGeofenceId || "") !== String(data.geocerca_id || "");

        if (changed) {
          const rPrev = await resolveTrackerUserIdFromPersonal(supabase, { orgId, personalId: prevPersonalId });
          if (rPrev.tracker_user_id && prevGeofenceId) {
            deactivatedPrev = await deactivateTrackerAssignment(supabase, {
              orgId,
              tracker_user_id: rPrev.tracker_user_id,
              geofence_id: prevGeofenceId,
            });
          }
        }
      } catch {
        // best effort, no romper
      }

      return json(res, 200, {
        ok: true,
        data,
        sync: syncNew.ok ? syncNew : undefined,
        warning: !syncNew.ok ? syncNew.warning : undefined,
        deactivatedPrev: deactivatedPrev && deactivatedPrev.ok ? true : undefined,
      });
    }

    if (req.method === "DELETE") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      if (!id) return json(res, 400, { ok: false, error: "missing id" });

      // Leer asignación para poder desactivar tracker_assignment
      const prevRes = await supabase
        .from("asignaciones")
        .select("id, org_id, personal_id, geocerca_id")
        .eq("id", id)
        .eq("org_id", orgId)
        .limit(1);

      if (prevRes.error) return json(res, 400, { ok: false, error: prevRes.error.message });
      const prev = Array.isArray(prevRes.data) ? prevRes.data[0] : null;

      const { error } = await supabase
        .from("asignaciones")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId);

      if (error) return json(res, 400, { ok: false, error: error.message });

      // ✅ Desactivar tracker_assignment (best effort)
      let deactivated = null;
      if (prev?.personal_id && prev?.geocerca_id) {
        const rPrev = await resolveTrackerUserIdFromPersonal(supabase, { orgId, personalId: prev.personal_id });
        if (rPrev.tracker_user_id) {
          deactivated = await deactivateTrackerAssignment(supabase, {
            orgId,
            tracker_user_id: rPrev.tracker_user_id,
            geofence_id: prev.geocerca_id,
          });
        }
      }

      return json(res, 200, { ok: true, deactivated: deactivated?.ok ? true : undefined });
    }

    return json(res, 405, { ok: false, error: "method not allowed" });
  } catch (e) {
    console.error("[api/asignaciones] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "fatal" });
  }
}
