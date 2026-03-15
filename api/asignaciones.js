// api/asignaciones.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "asignaciones-api-v11-geofence-id-primary-resolve";

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

  const sbDb = sbSrv || sbUser;

  const { data: mRow, error: mErr } = await sbDb
    .from("memberships")
    .select("org_id, role, is_default, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (mErr) return { ok: false, status: 500, error: "Membership lookup failed", details: mErr.message };
  if (!mRow?.org_id) return { ok: false, status: 403, error: "No membership" };

  return { ok: true, ctx: { org_id: String(mRow.org_id) }, user, sbDb };
}

/* =========================
   Catalog loaders
========================= */

async function loadCatalogs(sbDb, orgId) {
  const catalogs = { personal: [], geocercas: [], activities: [] };

  try {
    const r = await sbDb
      .from("personal")
      .select("id,nombre,apellido,email,org_id,active")
      .eq("org_id", orgId)
      .order("nombre", { ascending: true })
      .limit(500);
    if (!r.error) catalogs.personal = r.data || [];
  } catch {}

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

    const rc = await resolveContext(req);
    if (!rc.ok) return send(res, rc.status || 500, { ok: false, error: rc.error, details: rc.details });

    const orgId = rc.ctx.org_id;
    const sbDb = rc.sbDb;

    // GET bundle/list
    if (req.method === "GET" && (action === "bundle" || action === "list")) {
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

      if (action === "list") return ok(res, { ok: true, data: r.data || [] });

      const catalogs = await loadCatalogs(sbDb, orgId);
      return ok(res, { ok: true, data: { asignaciones: r.data || [], catalogs } });
    }

    // POST create
    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body?.personal_id) return send(res, 400, { ok: false, error: "personal_id is required" });

      console.log("[asignaciones POST] geofence_id recibido:", body.geofence_id ?? "(no presente)");
      console.log("[asignaciones POST] geocerca_id recibido:", body.geocerca_id ?? "(no presente)");
      console.log("[asignaciones POST] org_id contexto:", orgId);

      let geocerca_id;
      try {
        geocerca_id = await resolveLegacyGeocercaId(sbDb, orgId, body);
      } catch (e) {
        return send(res, 400, { ok: false, error: "Invalid geofence/geocerca", details: String(e?.message || e) });
      }

      const row = {
        ...body,
        org_id: orgId,
        geocerca_id, // ✅ FK legacy
      };

      // si quieres guardar también geofence_id (si existe la columna), lo dejamos si viene
      // pero nunca lo inventamos
      delete row.is_deleted;

      stripUndefined(row);

      const r = await sbDb.from("asignaciones").insert(row).select("*").single();
      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

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

      const r = await sbDb.from("asignaciones").update(patch).eq("id", id).eq("org_id", orgId).select("*").single();
      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      return ok(res, { ok: true, data: r.data });
    }

    // DELETE soft
    if (req.method === "DELETE") {
      const body = await readBody(req);
      const id = String(body?.id || "");
      if (!id) return send(res, 400, { ok: false, error: "id is required" });

      const r = await sbDb
        .from("asignaciones")
        .update({ is_deleted: true })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .single();

      if (r.error) return send(res, 500, { ok: false, error: "Supabase error", details: r.error.message });

      return ok(res, { ok: true, data: r.data });
    }

    return send(res, 405, { ok: false, error: "Method not allowed", method: req.method });
  } catch (e) {
    return send(res, 500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
}