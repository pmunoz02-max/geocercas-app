import { createClient } from "@supabase/supabase-js";

const VERSION = "asignaciones-api-v14-stable-preview";

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
  res.setHeader("Vary", "Cookie, Authorization");

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
  for (const k of Object.keys(o)) {
    if (o[k] === undefined) delete o[k];
  }
  return o;
}

function toYmd(input) {
  if (input === null || input === undefined || input === "") return null;
  const s = String(input).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseOpenStart(ymd) {
  if (!ymd) return Number.NEGATIVE_INFINITY;
  return Date.parse(`${ymd}T00:00:00.000Z`);
}

function parseOpenEnd(ymd) {
  if (!ymd) return Number.POSITIVE_INFINITY;
  return Date.parse(`${ymd}T23:59:59.999Z`);
}

function rangesOverlap(start1, end1, start2, end2) {
  const s1 = parseOpenStart(start1);
  const e1 = parseOpenEnd(end1);
  const s2 = parseOpenStart(start2);
  const e2 = parseOpenEnd(end2);
  return s1 <= e2 && s2 <= e1;
}

function dayBeforeYmd(ymd) {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isExclusionConstraintError(err) {
  const code = String(err?.code || "");
  const msg = String(err?.message || "").toLowerCase();
  return code === "23P01" || msg.includes("exclusion constraint");
}

function normalizeAssignmentStatus(statusLike) {
  return String(statusLike || "").trim().toLowerCase();
}

function isCompletedAssignmentStatus(statusLike) {
  const s = normalizeAssignmentStatus(statusLike);
  return s === "inactiva" || s === "completada" || s === "completed";
}

function isMissingColumnError(err, columnName) {
  const msg = String(err?.message || "").toLowerCase();
  const details = String(err?.details || "").toLowerCase();
  const hint = String(err?.hint || "").toLowerCase();
  const needle = String(columnName || "").toLowerCase();
  return (
    msg.includes(needle) ||
    details.includes(needle) ||
    hint.includes(needle) ||
    msg.includes("column") ||
    msg.includes("does not exist")
  );
}

async function insertMetricsEventSilent(sbDb, { org_id, user_id, event_type, meta = {} }) {
  try {
    await sbDb.from("org_metrics_events").insert({
      org_id,
      user_id,
      event_type,
      meta,
    });
  } catch (_) {
    // ignore
  }
}

/* =========================
   Sincronización tracker_assignments
========================= */

async function syncTrackerAssignmentFromAsignacion({ sbDb, orgId, asignacion, action }) {
  try {
    if (!asignacion || !orgId || !asignacion.personal_id) return;

    const { data: personalRow, error: personalError } = await sbDb
      .from("personal")
      .select("id, user_id")
      .eq("id", asignacion.personal_id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (personalError || !personalRow?.user_id) {
      console.warn(
        "[syncTrackerAssignment] No se pudo resolver user_id para personal_id",
        asignacion.personal_id,
        personalError
      );
      return;
    }

    const trackerUserId = personalRow.user_id;
    if (!trackerUserId) return;

    const startDate = toYmd(asignacion.start_date || asignacion.start_time);
    const endDate = toYmd(asignacion.end_date || asignacion.end_time);

    const trackerAssignmentRow = {
      org_id: orgId,
      tracker_user_id: trackerUserId,
      start_date: startDate,
      end_date: endDate,
      frequency_minutes: asignacion.frecuencia_envio_sec
        ? Math.round(asignacion.frecuencia_envio_sec / 60)
        : null,
      active: (asignacion.status || asignacion.estado) === "activa",
    };

    if (action === "delete" || trackerAssignmentRow.active === false) {
      await sbDb
        .from("tracker_assignments")
        .update({ active: false })
        .eq("org_id", orgId)
        .eq("tracker_user_id", trackerUserId)
        .eq("start_date", trackerAssignmentRow.start_date)
        .eq("end_date", trackerAssignmentRow.end_date);

      console.log("[syncTrackerAssignment] Desactivada tracker_assignment", trackerAssignmentRow);
      return;
    }

    await sbDb
      .from("tracker_assignments")
      .upsert(trackerAssignmentRow, {
        onConflict: "org_id,tracker_user_id,start_date,end_date",
      });

    console.log("[syncTrackerAssignment] Upsert tracker_assignment", trackerAssignmentRow);
  } catch (e) {
    console.warn("[syncTrackerAssignment] Error:", e);
  }
}

/* =========================
   Context Resolver
========================= */

async function resolveContext(req, { requestedOrgId = null } = {}) {
  const SUPABASE_URL = getEnv([
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);
  const SUPABASE_ANON_KEY = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
  const SUPABASE_SERVICE_ROLE_KEY = getEnv([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
  ]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      status: 500,
      error: "server_misconfigured",
      details: {
        has: {
          SUPABASE_URL: Boolean(SUPABASE_URL),
          SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        },
      },
    };
  }

  const bearerHeader = req.headers.authorization || "";
  const bearerToken = bearerHeader.startsWith("Bearer ")
    ? bearerHeader.slice(7)
    : null;
  const cookieToken = getCookie(req, "tg_at");
  const accessToken = bearerToken || cookieToken;

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "not_authenticated",
      details: "Missing access token (Bearer or cookie)",
    };
  }

  const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: u1, error: uerr } = await sbUser.auth.getUser();
  const user = u1?.user ? { id: u1.user.id, email: u1.user.email } : null;

  if (!user || uerr) {
    return {
      ok: false,
      status: 401,
      error: "invalid_session",
      details: uerr?.message || "No user",
    };
  }

  const sbSrv = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

  const sbDb = sbSrv || sbUser;

  const loadMembershipForOrg = async (orgId) => {
    if (!orgId) return null;

    const { data, error } = await sbDb
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .maybeSingle();

    if (error) return null;
    return data?.org_id ? data : null;
  };

  const loadCurrentOrgFromUserCurrentOrg = async () => {
    const { data, error } = await sbDb
      .from("user_current_org")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return null;
    return data?.org_id ? String(data.org_id) : null;
  };

  const loadDefaultMembership = async () => {
    const { data, error } = await sbDb
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { data: null, error };
    return { data, error: null };
  };

  let membership = null;
  let orgId = null;

  if (requestedOrgId) {
    orgId = String(requestedOrgId);
    membership = await loadMembershipForOrg(orgId);

    if (!membership) {
      return {
        ok: false,
        status: 403,
        error: "requested_org_not_available",
        details: "No valid membership for requestedOrgId",
      };
    }
  } else {
    const currentOrgId = await loadCurrentOrgFromUserCurrentOrg();
    if (currentOrgId) {
      membership = await loadMembershipForOrg(currentOrgId);
      if (membership) orgId = String(currentOrgId);
    }

    if (!membership) {
      const { data, error } = await loadDefaultMembership();
      if (error) {
        return {
          ok: false,
          status: 500,
          error: "memberships_lookup_failed",
          details: error.message,
        };
      }
      membership = data || null;
      orgId = membership?.org_id ? String(membership.org_id) : null;
    }

    if (!membership || !orgId) {
      return {
        ok: false,
        status: 403,
        error: "no_active_membership",
        details: "No active organization membership for current user",
      };
    }
  }

  return {
    ok: true,
    sbDb,
    sbUser,
    user,
    orgId,
    membership,
  };
}

/* =========================
   Catálogos
========================= */

async function loadCatalogs(sbDb, orgId) {
  const catalogs = {
    geocercas: [],
    activities: [],
    personal: [],
  };

  // Personas: usar org_people si existe, si no, usar join en personal con owner_id
  try {
    let personal = [];
    let orgPeopleExists = false;
    try {
      // Verificar si existe la tabla org_people
      const { data: orgPeopleCheck, error: orgPeopleError } = await sbDb
        .from("org_people")
        .select("id")
        .limit(1);
      if (!orgPeopleError) orgPeopleExists = true;
    } catch (e) {
      orgPeopleExists = false;
    }

    if (orgPeopleExists) {
      const { data } = await sbDb
        .from("org_people")
        .select("*")
        .eq("org_id", orgId);
      personal = data || [];
    } else {
      // Si no existe org_people, usar join en personal con owner_id
      // NOTA: user.id debe estar disponible en el contexto donde se llama loadCatalogs
      // Aquí se asume que userId está disponible como parámetro o variable accesible
      if (typeof userId !== "undefined" && userId) {
        const { data } = await sbDb
          .from("personal")
          .select("*")
          .eq("owner_id", userId);
        personal = data || [];
      } else {
        personal = [];
      }
    }
    catalogs.personal = personal || [];
  } catch (e) {
    catalogs.personal = [];
    console.warn("[loadCatalogs] personal/org_people exception:", e);
  }

  // Geocercas (sin cambios)
  try {
    const r = await sbDb
      .from("geofences")
      .select("id,name,org_id,active,source_geocerca_id")
      .eq("org_id", orgId)
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(500);

    if (!r.error) {
      catalogs.geocercas = (r.data || []).map((g) => ({
        id: g.id,
        nombre: g.name,
        org_id: g.org_id,
        active: g.active,
        source_geocerca_id: g.source_geocerca_id || null,
      }));
    } else {
      console.warn("[loadCatalogs] geofences error:", r.error);
    }
  } catch (e) {
    console.warn("[loadCatalogs] geofences exception:", e);
  }

  // Actividades (sin cambios)
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
        org_id: a.org_id,
        active: a.active,
      }));
    } else {
      console.warn("[loadCatalogs] activities error:", r.error);
    }
  } catch (e) {
    console.warn("[loadCatalogs] activities exception:", e);
  }

  return catalogs;
}

/* =========================
   Resolver geocerca_id legacy
========================= */

async function resolveLegacyGeocercaId(sbDb, orgId, payload) {
  const p = payload && typeof payload === "object" ? payload : {};

  if (p.geofenceId && !p.geofence_id) p.geofence_id = p.geofenceId;
  if (p.geocercaId && !p.geocerca_id) p.geocerca_id = p.geocercaId;

  const gfId =
    p.geofence_id && typeof p.geofence_id === "string" && p.geofence_id.trim()
      ? p.geofence_id.trim()
      : null;

  const gcId =
    p.geocerca_id && typeof p.geocerca_id === "string" && p.geocerca_id.trim()
      ? p.geocerca_id.trim()
      : null;

  console.log("[resolveLegacyGeocercaId] geofence_id recibido:", gfId ?? "(vacío/ausente)");
  console.log(
    "[resolveLegacyGeocercaId] geocerca_id recibido:",
    gcId ?? "(vacío/ausente — se ignora cuando geofence_id está presente)"
  );
  console.log("[resolveLegacyGeocercaId] org_id de contexto:", orgId);

  if (gfId) {
    const rAny = await sbDb
      .from("geofences")
      .select("id,org_id,source_geocerca_id")
      .eq("id", gfId)
      .maybeSingle();

    if (rAny.error) throw new Error(`Error buscando geofence: ${rAny.error.message}`);

    if (!rAny.data?.id) {
      throw new Error(`geofence_id '${gfId}' no existe en la base de datos.`);
    }

    if (String(rAny.data.org_id) !== String(orgId)) {
      throw new Error(
        `geofence_id '${gfId}' pertenece a org '${rAny.data.org_id}', no a la org en contexto '${orgId}'.`
      );
    }

    if (!rAny.data.source_geocerca_id) {
      throw new Error(
        `geofence_id '${gfId}' no tiene source_geocerca_id vinculado a geocercas.`
      );
    }

    const r2 = await sbDb
      .from("geocercas")
      .select("id")
      .eq("id", rAny.data.source_geocerca_id)
      .maybeSingle();

    if (r2.error || !r2.data?.id) {
      throw new Error(
        `source_geocerca_id '${rAny.data.source_geocerca_id}' no existe en geocercas.`
      );
    }

    return String(rAny.data.source_geocerca_id);
  }

  if (gcId) {
    const r = await sbDb
      .from("geocercas")
      .select("id")
      .eq("id", gcId)
      .maybeSingle();

    if (!r.error && r.data?.id) return String(gcId);
    throw new Error(`geocerca_id '${gcId}' no existe en geocercas.`);
  }

  throw new Error("Falta geofence_id o geocerca_id legacy.");
}

/* =========================
   Queries de asignaciones
========================= */

async function listAssignmentsCanonical(sbDb, orgId) {
  const baseSelect =
    "id,org_id,personal_id,geocerca_id,geofence_id,activity_id,start_date,end_date,start_time,end_time,estado,status,frecuencia_envio_sec,is_deleted,created_at";

  const q1 = await sbDb
    .from("asignaciones")
    .select(baseSelect)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (q1.error) {
    throw q1.error;
  }

  let legacyRows = [];
  try {
    const q2 = await sbDb
      .from("asignaciones")
      .select(baseSelect)
      .is("org_id", null)
      .eq("tenant_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!q2.error) {
      legacyRows = q2.data || [];
    } else if (!isMissingColumnError(q2.error, "tenant_id")) {
      console.warn("[api/asignaciones] tenant_id legacy query warning:", q2.error);
    }
  } catch (e) {
    console.warn("[api/asignaciones] tenant_id legacy query exception:", e);
  }

  const rows = [...(q1.data || []), ...legacyRows];
  const seen = new Set();

  return rows.filter((r) => {
    if (!r?.id) return false;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return r.is_deleted !== true;
  });
}

async function listExistingAssignmentsForConflict(sbDb, orgId, personalId) {
  const baseSelect =
    "id,org_id,personal_id,start_date,end_date,start_time,end_time,estado,status,geofence_id,geocerca_id,is_deleted";

  const q1 = await sbDb
    .from("asignaciones")
    .select(baseSelect)
    .eq("org_id", orgId)
    .eq("personal_id", personalId)
    .limit(500);

  if (q1.error) throw q1.error;

  let legacyRows = [];
  try {
    const q2 = await sbDb
      .from("asignaciones")
      .select(baseSelect)
      .is("org_id", null)
      .eq("tenant_id", orgId)
      .eq("personal_id", personalId)
      .limit(500);

    if (!q2.error) {
      legacyRows = q2.data || [];
    } else if (!isMissingColumnError(q2.error, "tenant_id")) {
      console.warn("[api/asignaciones] tenant_id conflict query warning:", q2.error);
    }
  } catch (e) {
    console.warn("[api/asignaciones] tenant_id conflict query exception:", e);
  }

  const rows = [...(q1.data || []), ...legacyRows];
  const seen = new Set();

  return rows.filter((r) => {
    if (!r?.id) return false;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return r.is_deleted !== true;
  });
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

let body = null;
if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
  body = await readBody(req);
}

const requestedOrgId =
  q?.org_id ||
  q?.orgId ||
  body?.org_id ||
  body?.orgId ||
  null;

if (!requestedOrgId) {
  return send(res, 400, {
    ok: false,
    error: "missing_org_id",
    message: "org_id es requerido",
  });
}

const rc = await resolveContext(req, { requestedOrgId });
    if (!rc.ok) {
      return send(res, rc.status || 500, {
        ok: false,
        error: rc.error,
        details: rc.details,
      });
    }

    const sbDb = rc.sbDb;
    const orgId = String(rc.orgId || requestedOrgId);
    const userId = rc?.user?.id || null;

    if (!orgId) {
      return send(res, 400, { ok: false, error: "missing_org_id" });
    }

    if (req.method === "GET" && (action === "bundle" || action === "list")) {
      try {
        const merged = await listAssignmentsCanonical(sbDb, orgId);

        if (action === "list") {
          return ok(res, { ok: true, data: merged });
        }

        let catalogs = { geocercas: [], activities: [], personal: [] };
        try {
          catalogs = await loadCatalogs(sbDb, orgId);
        } catch (e) {
          console.error("[api/asignaciones] error loadCatalogs", {
            message: e?.message,
            details: e?.details,
            hint: e?.hint,
            code: e?.code,
            orgId,
          });
        }

        // Refuerza que catalogs.personal siempre se cargue correctamente antes de responder
        try {
          let r = await sbDb
            .from("personal")
            .select("id,personal_id,org_id,user_id,nombre,name,first_name,apellido,last_name,full_name,email")
            .eq("org_id", orgId)
            .limit(1000);
          if (!r.error && Array.isArray(r.data) && r.data.length > 0) {
            catalogs.personal = r.data;
          } else {
            r = await sbDb
              .from("org_people")
              .select("id,personal_id,org_id,user_id,nombre,name,first_name,apellido,last_name,full_name,email")
              .eq("org_id", orgId)
              .limit(1000);
            if (!r.error && Array.isArray(r.data)) {
              catalogs.personal = r.data;
            }
          }
        } catch (e) {
          console.warn("[api/asignaciones] refuerzo personal/org_people exception:", e);
        }

        return ok(res, {
          ok: true,
          data: {
            asignaciones: merged,
            catalogs,
          },
        });
      } catch (error) {
        console.error("[api/asignaciones] GET error", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
          orgId,
        });

        return send(res, 500, {
          ok: false,
          error: "server_error",
          details: String(error?.message || error),
        });
      }
    }

    if (req.method === "POST") {
      const body = await readBody(req);

      if (!body?.personal_id) {
        return send(res, 400, { ok: false, error: "personal_id_is_required" });
      }

      const replaceExisting =
        body?.replaceExisting === true ||
        String(body?.replaceExisting || "").toLowerCase() === "true";

      const requestedBodyOrgId = body?.org_id ? String(body.org_id) : String(orgId);

      if (!requestedBodyOrgId) {
        return send(res, 400, { ok: false, error: "org_id_is_required" });
      }

      if (requestedBodyOrgId !== String(orgId)) {
        return send(res, 403, {
          ok: false,
          error: "org_id_mismatch",
          message: "org_id del payload no coincide con la organización activa.",
        });
      }

      const orgExistsRes = await sbDb
        .from("organizations")
        .select("id")
        .eq("id", orgId)
        .maybeSingle();

      if (orgExistsRes.error) {
        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: orgExistsRes.error.message,
        });
      }

      if (!orgExistsRes.data?.id) {
        return send(res, 400, {
          ok: false,
          error: "invalid_org_id",
          message: "org_id no existe para el contexto actual.",
        });
      }

      const personalId = String(body.personal_id || "").trim();
      if (!personalId) {
        return send(res, 400, { ok: false, error: "personal_id_is_required" });
      }

      const startDate = toYmd(body?.start_date || body?.start_time);
      const endDate = toYmd(body?.end_date || body?.end_time);

      if ((body?.start_date || body?.start_time) && !startDate) {
        return send(res, 400, {
          ok: false,
          error: "invalid_start_date",
          message: "start_date/start_time inválida",
        });
      }

      if ((body?.end_date || body?.end_time) && !endDate) {
        return send(res, 400, {
          ok: false,
          error: "invalid_end_date",
          message: "end_date/end_time inválida",
        });
      }

      if (startDate && endDate && startDate > endDate) {
        return send(res, 400, {
          ok: false,
          error: "invalid_date_range",
          message: "start_date no puede ser mayor que end_date",
        });
      }

      const personalExistsRes = await sbDb
        .from("personal")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", personalId)
        .maybeSingle();

      if (personalExistsRes.error) {
        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: personalExistsRes.error.message,
        });
      }

      if (!personalExistsRes.data?.id) {
        return send(res, 400, {
          ok: false,
          error: "invalid_personal_id",
          message: "personal_id no existe para la organización activa.",
        });
      }

      let geocerca_id;
      try {
        geocerca_id = await resolveLegacyGeocercaId(sbDb, orgId, body);
      } catch (e) {
        return send(res, 400, {
          ok: false,
          error: "invalid_geofence_or_geocerca",
          details: String(e?.message || e),
        });
      }

      const row = {
        ...body,
        org_id: orgId,
        personal_id: personalId,
        start_date: body?.start_date ? startDate : undefined,
        end_date: body?.end_date ? endDate : undefined,
        geocerca_id,
      };

      delete row.is_deleted;
      delete row.replaceExisting;
      stripUndefined(row);

      let existingRows = [];
      try {
        existingRows = await listExistingAssignmentsForConflict(sbDb, orgId, personalId);
      } catch (e) {
        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: String(e?.message || e),
        });
      }

      const activeRows = existingRows.filter((r) => {
        if (!r || r.is_deleted === true) return false;

        const hasEstadoVal =
          r.estado !== undefined && r.estado !== null && String(r.estado).trim() !== "";
        const hasStatusVal =
          r.status !== undefined && r.status !== null && String(r.status).trim() !== "";

        if (!hasEstadoVal && !hasStatusVal) return true;

        return (
          String(r.estado || "").toLowerCase() === "activa" ||
          String(r.status || "").toLowerCase() === "activa"
        );
      });

      const conflicts = activeRows
        .filter((r) =>
          rangesOverlap(
            startDate,
            endDate,
            toYmd(r.start_date || r.start_time),
            toYmd(r.end_date || r.end_time)
          )
        )
        .map((r) => ({
          id: r.id,
          start_date: toYmd(r.start_date || r.start_time),
          end_date: toYmd(r.end_date || r.end_time),
          geofence_id: r.geofence_id || null,
          geocerca_id: r.geocerca_id || null,
        }));

      if (conflicts.length > 0 && !replaceExisting) {
        return send(res, 409, {
          ok: false,
          error: "assignment_conflict",
          message:
            "Ya existe una asignación activa o superpuesta para esta persona. Cierra o reemplaza la asignación actual antes de crear una nueva.",
          conflicts,
        });
      }

      if (conflicts.length > 0 && replaceExisting) {
        if (!startDate) {
          return send(res, 400, {
            ok: false,
            error: "replace_requires_start_date",
            message: "replaceExisting=true requiere start_date para cerrar asignaciones previas.",
            conflicts,
          });
        }

        const closeDate = dayBeforeYmd(startDate);

        for (const c of conflicts) {
          const closeRes = await sbDb
            .from("asignaciones")
            .update({ end_date: closeDate })
            .eq("id", c.id)
            .eq("org_id", orgId)
            .eq("personal_id", personalId);

          if (closeRes.error) {
            return send(res, 500, {
              ok: false,
              error: "supabase_error",
              details: closeRes.error.message,
            });
          }
        }
      }

      const r = await sbDb.from("asignaciones").insert(row).select("*").single();

      if (r.error) {
        if (isExclusionConstraintError(r.error)) {
          return send(res, 409, {
            ok: false,
            error: "assignment_conflict",
            message:
              "Ya existe una asignación activa o superpuesta para esta persona. Cierra o reemplaza la asignación actual antes de crear una nueva.",
            conflicts,
          });
        }

        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: r.error.message,
        });
      }

      await syncTrackerAssignmentFromAsignacion({
        sbDb,
        orgId,
        asignacion: r.data,
        action: "create",
      });

      if (userId) {
        await insertMetricsEventSilent(sbDb, {
          org_id: orgId,
          user_id: userId,
          event_type: "assignment_created",
          meta: {},
        });
      }

      return ok(res, { ok: true, data: r.data });
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const id = String(body?.id || "");
      const patch0 = body?.patch && typeof body.patch === "object" ? body.patch : body;

      if (!id) {
        return send(res, 400, { ok: false, error: "id_is_required" });
      }

      const patch = { ...(patch0 || {}) };
      delete patch.id;
      delete patch.patch;

      if (patch.geofence_id || patch.geocerca_id || patch.geofenceId || patch.geocercaId) {
        try {
          patch.geocerca_id = await resolveLegacyGeocercaId(sbDb, orgId, patch);
        } catch (e) {
          return send(res, 400, {
            ok: false,
            error: "invalid_geofence_or_geocerca",
            details: String(e?.message || e),
          });
        }
      }

      patch.org_id = orgId;
      delete patch.is_deleted;
      stripUndefined(patch);

      let shouldTrackCompleted = false;
      const nextStatusFromPatch = normalizeAssignmentStatus(patch.status || patch.estado);

      if (nextStatusFromPatch) {
        try {
          const beforeRes = await sbDb
            .from("asignaciones")
            .select("id,status,estado")
            .eq("id", id)
            .eq("org_id", orgId)
            .maybeSingle();

          const beforeStatus = normalizeAssignmentStatus(
            beforeRes?.data?.status || beforeRes?.data?.estado
          );

          shouldTrackCompleted =
            isCompletedAssignmentStatus(nextStatusFromPatch) &&
            !isCompletedAssignmentStatus(beforeStatus);
        } catch (_) {
          // ignore
        }
      }

      const r = await sbDb
        .from("asignaciones")
        .update(patch)
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .single();

      if (r.error) {
        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: r.error.message,
        });
      }

      await syncTrackerAssignmentFromAsignacion({
        sbDb,
        orgId,
        asignacion: r.data,
        action: "update",
      });

      if (shouldTrackCompleted && userId) {
        await insertMetricsEventSilent(sbDb, {
          org_id: orgId,
          user_id: userId,
          event_type: "assignment_completed",
          meta: {},
        });
      }

      return ok(res, { ok: true, data: r.data });
    }

    if (req.method === "DELETE") {
      const body = await readBody(req);
      const id = String(body?.id || "");

      if (!id) {
        return send(res, 400, { ok: false, error: "id_is_required" });
      }

      const prev = await sbDb
        .from("asignaciones")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();

      const r = await sbDb
        .from("asignaciones")
        .update({ is_deleted: true })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .single();

      if (r.error) {
        return send(res, 500, {
          ok: false,
          error: "supabase_error",
          details: r.error.message,
        });
      }

      await syncTrackerAssignmentFromAsignacion({
        sbDb,
        orgId,
        asignacion: prev.data,
        action: "delete",
      });

      return ok(res, { ok: true, data: r.data });
    }

    return send(res, 405, {
      ok: false,
      error: "method_not_allowed",
      method: req.method,
    });
  } catch (e) {
    console.error("[api/asignaciones] fatal", e);
    return send(res, 500, {
      ok: false,
      error: "server_error",
      details: String(e?.message || e),
    });
  }
}