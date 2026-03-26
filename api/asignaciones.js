// =========================
// Sincronización tracker_assignments
// =========================

// =========================
// Sincronización tracker_assignments
// =========================

/**
 * Sincroniza una fila de tracker_assignments a partir de una asignación.
 * - action: "create" | "update" | "delete"
 * - Idempotente: upsert para create/update, update (active=false) para delete
 */
async function syncTrackerAssignmentFromAsignacion({ sbDb, orgId, asignacion, action }) {
  try {
    if (!asignacion || !orgId || !asignacion.personal_id) return;
    // 1. Resolver tracker_user_id desde personal
    const { data: personalRow, error: personalError } = await sbDb
      .from("personal")
      .select("id, user_id")
      .eq("id", asignacion.personal_id)
      .eq("org_id", orgId) // Hardening: multi-tenant isolation
      .eq("org_id", orgId)
      .maybeSingle();
    if (personalError || !personalRow?.user_id) {
      console.warn("[syncTrackerAssignment] No se pudo resolver user_id para personal_id", asignacion.personal_id, personalError);
      return;
    }
    const trackerUserId = personalRow.user_id;
    if (!trackerUserId) return;

    // 2. Mapear campos
    const trackerAssignmentRow = {
      org_id: orgId,
      tracker_user_id: trackerUserId,
      start_date: asignacion.start_date,
      end_date: asignacion.end_date,
      frequency_minutes: asignacion.frecuencia_envio_sec ? Math.round(asignacion.frecuencia_envio_sec / 60) : null,
      active: (asignacion.status || asignacion.estado) === "activa",
    };

    // 3. Acción según tipo
    if (action === "delete" || trackerAssignmentRow.active === false) {
      // Desactivar (no borrar físico)
      await sbDb
        .from("tracker_assignments")
        .update({ active: false })
        .eq("org_id", orgId) // Hardening: multi-tenant isolation
        .eq("tracker_user_id", trackerUserId)
        .eq("start_date", trackerAssignmentRow.start_date)
        .eq("end_date", trackerAssignmentRow.end_date);
      console.log("[syncTrackerAssignment] Desactivada tracker_assignment", trackerAssignmentRow);
      return;
    }

    // 4. Upsert (idempotente)
    await sbDb
      .from("tracker_assignments")
      .upsert(trackerAssignmentRow, { onConflict: "org_id,tracker_user_id,start_date,end_date" });
    console.log("[syncTrackerAssignment] Upsert tracker_assignment", trackerAssignmentRow);
  } catch (e) {
    console.warn("[syncTrackerAssignment] Error:", e);
  }
}
// api/asignaciones.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "asignaciones-api-v13-metrics-events-preview";

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
   Context Resolver
========================= */

async function resolveContext(req, { requestedOrgId = null } = {}) {
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

  // Regla universal: si requestedOrgId está presente, solo se permite continuar si hay membership válida en esa org
  // Si no, se permite fallback a org activa o default
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
  let mRow = null;
  if (requestedOrgId) {
    mRow = await loadMembershipForOrg(String(requestedOrgId));
    if (!mRow) {
      return { ok: false, status: 403, error: "Requested org is not available for current user", details: "No valid membership for requestedOrgId; fallback is forbidden by security policy." };
    }
  } else {
    const currentOrgId = await loadCurrentOrgFromUserCurrentOrg();
    if (currentOrgId) mRow = await loadMembershipForOrg(currentOrgId);
    if (!mRow) {
      const { data, error } = await loadDefaultMembership();
      if (error) return { ok: false, status: 500, error: error.message || "memberships lookup failed" };
      mRow = data || null;
    }
  }
  // UI usa geofences para escoger; devolvemos en geocercas por compat
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
    }
  } catch {}

  try {
    const r = await sbDb
      .from("activities")
      .select("id,name,org_id,active")
      .eq("org_id", orgId) // Hardening: multi-tenant isolation
      .order("name", { ascending: true })
      .limit(500);
    if (!r.error) {
      catalogs.activities = (r.data || []).map((a) => ({
        id: a.id,
        nombre: a.name,
        org_id: a.org_id,
        active: a.active,
      }));
    }
  } catch {}

  return catalogs;
}

/* =========================
   Resolver geocerca_id legacy
========================= */

async function resolveLegacyGeocercaId(sbDb, orgId, payload) {
  const p = payload && typeof payload === "object" ? payload : {};

  // camelCase compat
  if (p.geofenceId && !p.geofence_id) p.geofence_id = p.geofenceId;
  if (p.geocercaId && !p.geocerca_id) p.geocerca_id = p.geocercaId;

  // Normalizar: null / undefined / string vacío → null
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

  // 1) geofence_id es la fuente principal
  if (gfId) {
    // Búsqueda sin filtro de org para poder distinguir inexistencia real vs. filtro de org
    const rAny = await sbDb
      .from("geofences")
      .select("id,org_id,source_geocerca_id")
      .eq("id", gfId)
      .maybeSingle();

    if (rAny.error) throw new Error(`Error buscando geofence: ${rAny.error.message}`);

    if (!rAny.data?.id) {
      console.log(
        "[resolveLegacyGeocercaId] geofence_id NO existe en ninguna org:",
        gfId
      );
      throw new Error(`geofence_id '${gfId}' no existe en la base de datos (inexistencia real).`);
    }

    // Existe globalmente — verificar que pertenezca a este org
    if (String(rAny.data.org_id) !== String(orgId)) {
      console.log(
        `[resolveLegacyGeocercaId] geofence_id '${gfId}' existe pero su org_id='${rAny.data.org_id}' ` +
          `no coincide con el org de contexto '${orgId}' (filtrado por org_id).`
      );
      throw new Error(
        `geofence_id '${gfId}' existe pero pertenece a org '${rAny.data.org_id}', ` +
          `no a la org en contexto '${orgId}'. Acceso denegado (filtro org_id).`
      );
    }

    console.log("[resolveLegacyGeocercaId] geofence encontrado:", {
      id: rAny.data.id,
      org_id: rAny.data.org_id,
      source_geocerca_id: rAny.data.source_geocerca_id ?? "(null)",
    });

    if (!rAny.data.source_geocerca_id) {
      throw new Error(
        `geofence_id '${gfId}' no tiene source_geocerca_id vinculado. ` +
          `Falta enlazarlo a la tabla geocercas (legacy FK).`
      );
    }

    // Validar que el source_geocerca_id exista en geocercas
    const r2 = await sbDb
      .from("geocercas")
      .select("id")
      .eq("id", rAny.data.source_geocerca_id)
      .maybeSingle();
    if (r2.error || !r2.data?.id) {
      throw new Error(
        `source_geocerca_id '${rAny.data.source_geocerca_id}' no existe en geocercas (FK inválida).`
      );
    }

    return String(rAny.data.source_geocerca_id);
  }

  // 2) geocerca_id: rama legacy exclusiva cuando geofence_id está vacío/ausente
  if (gcId) {
    console.log("[resolveLegacyGeocercaId] geofence_id ausente — usando geocerca_id legacy:", gcId);
    const r = await sbDb.from("geocercas").select("id").eq("id", gcId).maybeSingle();
    if (!r.error && r.data?.id) return String(gcId);
    throw new Error(`geocerca_id '${gcId}' no existe en geocercas (FK).`);
  }

  throw new Error(
    "Falta geofence_id (o geocerca_id legacy). Ambos están vacíos o ausentes."
  );
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
    const requestedOrgId = q?.org_id || q?.orgId || null;

    // Validar org_id explícito
    if (!requestedOrgId) {
      return send(res, 400, { ok: false, error: "missing_org_id", message: "org_id es requerido" });
    }

    const rc = await resolveContext(req, { requestedOrgId });
    if (!rc.ok) return send(res, rc.status || 500, { ok: false, error: rc.error, details: rc.details });

    const orgId = String(requestedOrgId);
    if (!orgId) {
      return send(res, 400, { ok: false, error: "missing_org_id" });
    }
    const sbDb = rc.sbDb;
    const userId = rc?.user?.id || null;

    // GET bundle/list SOLO LECTURA
    if (req.method === "GET" && (action === "bundle" || action === "list")) {
      try {
        // Compatibilidad legacy: dos queries y merge
        const q1 = await sbDb
          .from("asignaciones")
          .select("id,org_id,personal_id,geocerca_id,geofence_id,activity_id,start_time,end_time,estado,status,frecuencia_envio_sec,is_deleted,created_at")
          .eq("org_id", orgId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(500);
        const q2 = await sbDb
          .from("asignaciones")
          .select("id,org_id,personal_id,geocerca_id,geofence_id,activity_id,start_time,end_time,estado,status,frecuencia_envio_sec,is_deleted,created_at")
          .is("org_id", null)
          .eq("tenant_id", orgId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(500);

        if (q1.error || q2.error) {
          const err = q1.error || q2.error;
          console.error("[api/asignaciones] error", {
            message: err?.message,
            details: err?.details,
            hint: err?.hint,
            code: err?.code,
            orgId
          });
          return send(res, 500, { ok: false, error: "Supabase error", details: err.message });
        }

        // Merge y dedup por id
        const rows = [...(q1.data || []), ...(q2.data || [])];
        const seen = new Set();
        const merged = rows.filter(r => {
          if (!r?.id) return false;
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });

        if (action === "list") return ok(res, { ok: true, data: merged });

        // Catálogos: aislar cada lectura
        let catalogs = {};
        try {
          catalogs = await loadCatalogs(sbDb, orgId);
        } catch (e) {
          console.error("[api/asignaciones] error loadCatalogs", {
            message: e?.message,
            details: e?.details,
            hint: e?.hint,
            code: e?.code,
            orgId
          });
        }
        return ok(res, { ok: true, data: { asignaciones: merged, catalogs } });
      } catch (error) {
        console.error("[api/asignaciones] error", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
          orgId
        });
        return send(res, 500, { ok: false, error: "Server error", details: String(error?.message || error) });
      }
    }

    // POST create
    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body?.personal_id) return send(res, 400, { ok: false, error: "personal_id is required" });

      const replaceExisting = body?.replaceExisting === true || String(body?.replaceExisting || "").toLowerCase() === "true";
      const requestedOrgId = body?.org_id ? String(body.org_id) : String(orgId);

      if (!requestedOrgId) return send(res, 400, { ok: false, error: "org_id is required" });
      if (requestedOrgId !== String(orgId)) {
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
        return send(res, 500, { ok: false, error: "Supabase error", details: orgExistsRes.error.message });
      }
      if (!orgExistsRes.data?.id) {
        return send(res, 400, {
          ok: false,
          error: "invalid_org_id",
          message: "org_id no existe para el contexto actual.",
        });
      }

      const personalId = String(body.personal_id || "").trim();
      if (!personalId) return send(res, 400, { ok: false, error: "personal_id is required" });

      const startDate = toYmd(body?.start_date);
      const endDate = toYmd(body?.end_date);

      if (body?.start_date && !startDate) {
        return send(res, 400, { ok: false, error: "invalid_start_date", message: "start_date inválida" });
      }
      if (body?.end_date && !endDate) {
        return send(res, 400, { ok: false, error: "invalid_end_date", message: "end_date inválida" });
      }

      if (startDate && endDate && startDate > endDate) {
        return send(res, 400, {
          ok: false,
          error: "invalid_date_range",
          message: "start_date no puede ser mayor que end_date",
        });
      }

      console.log("[asignaciones POST] geofence_id recibido:", body.geofence_id ?? "(no presente)");
      console.log("[asignaciones POST] geocerca_id recibido:", body.geocerca_id ?? "(no presente)");
      console.log("[asignaciones POST] org_id contexto:", orgId);

      const personalExistsRes = await sbDb
        .from("personal")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", personalId)
        .maybeSingle();

      if (personalExistsRes.error) {
        return send(res, 500, { ok: false, error: "Supabase error", details: personalExistsRes.error.message });
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
        return send(res, 400, { ok: false, error: "Invalid geofence/geocerca", details: String(e?.message || e) });
      }

      const row = {
        ...body,
        org_id: orgId,
        personal_id: personalId,
        start_date: startDate,
        end_date: endDate,
        geocerca_id, // ✅ FK legacy
      };

      // si quieres guardar también geofence_id (si existe la columna), lo dejamos si viene
      // pero nunca lo inventamos
      delete row.is_deleted;
      delete row.replaceExisting;

      stripUndefined(row);

      const existingRes = await sbDb
        .from("asignaciones")
        .select("id,org_id,personal_id,start_date,end_date,estado,status,geofence_id,geocerca_id,is_deleted")
        .eq("org_id", orgId)
        .eq("personal_id", personalId)
        .or("is_deleted.is.null,is_deleted.eq.false");

      if (existingRes.error) {
        return send(res, 500, { ok: false, error: "Supabase error", details: existingRes.error.message });
      }

      const existingRows = Array.isArray(existingRes.data) ? existingRes.data : [];

      const activeRows = existingRows.filter((r) => {
        if (!r || r.is_deleted === true) return false;
        const hasEstadoVal = r.estado !== undefined && r.estado !== null && String(r.estado).trim() !== "";
        const hasStatusVal = r.status !== undefined && r.status !== null && String(r.status).trim() !== "";
        if (!hasEstadoVal && !hasStatusVal) return true;
        return String(r.estado || "").toLowerCase() === "activa" || String(r.status || "").toLowerCase() === "activa";
      });

      const conflicts = activeRows
        .filter((r) => rangesOverlap(startDate, endDate, toYmd(r.start_date), toYmd(r.end_date)))
        .map((r) => ({
          id: r.id,
          start_date: toYmd(r.start_date),
          end_date: toYmd(r.end_date),
          geofence_id: r.geofence_id || null,
          geocerca_id: r.geocerca_id || null,
        }));

      console.log("[asignaciones POST] conflict check rows:", activeRows.length, "conflicts:", conflicts.length);

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
        console.log("[asignaciones POST] replaceExisting=true closing conflicts:", conflicts.length, "closeDate:", closeDate);

        for (const c of conflicts) {
          const closeRes = await sbDb
            .from("asignaciones")
            .update({ end_date: closeDate })
            .eq("id", c.id)
            .eq("org_id", orgId)
            .eq("personal_id", personalId);

          if (closeRes.error) {
            return send(res, 500, { ok: false, error: "Supabase error", details: closeRes.error.message });
          }
        }
      }

      const r = await sbDb.from("asignaciones").insert(row).select("*").single();
      if (r.error) {
        if (isExclusionConstraintError(r.error)) {
          console.log("[asignaciones POST] exclusion constraint conflict at insert");
          return send(res, 409, {
            ok: false,
            error: "assignment_conflict",
            message:
              "Ya existe una asignación activa o superpuesta para esta persona. Cierra o reemplaza la asignación actual antes de crear una nueva.",
            conflicts,
          });
        }
        return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });
      }

      await syncTrackerAssignmentFromAsignacion({ sbDb, orgId, asignacion: r.data, action: "create" });

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

    // PATCH update (cliente manda {id, patch})
    if (req.method === "PATCH") {
      const body = await readBody(req);
      const id = String(body?.id || "");
      const patch0 = body?.patch && typeof body.patch === "object" ? body.patch : body;

      if (!id) return send(res, 400, { ok: false, error: "id is required" });

      const patch = { ...(patch0 || {}) };
      delete patch.id;
      delete patch.patch;

      // si intentan cambiar geofence/geocerca, resolver otra vez
      if (patch.geofence_id || patch.geocerca_id || patch.geofenceId || patch.geocercaId) {
        try {
          patch.geocerca_id = await resolveLegacyGeocercaId(sbDb, orgId, patch);
        } catch (e) {
          return send(res, 400, { ok: false, error: "Invalid geofence/geocerca", details: String(e?.message || e) });
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

      const r = await sbDb.from("asignaciones").update(patch).eq("id", id).eq("org_id", orgId).select("*").single();
      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      await syncTrackerAssignmentFromAsignacion({ sbDb, orgId, asignacion: r.data, action: "update" });

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

    // DELETE soft
    if (req.method === "DELETE") {
      const body = await readBody(req);
      const id = String(body?.id || "");
      if (!id) return send(res, 400, { ok: false, error: "id is required" });

      // Leer fila previa antes de borrar
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

      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      await syncTrackerAssignmentFromAsignacion({ sbDb, orgId, asignacion: prev.data, action: "delete" });

      return ok(res, { ok: true, data: r.data });
    }

    return send(res, 405, { ok: false, error: "Method not allowed", method: req.method });
  } catch (e) {
    return send(res, 500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
}