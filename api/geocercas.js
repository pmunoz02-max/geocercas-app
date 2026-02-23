// api/geocercas.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "geocercas-api-v11-memberships-canonical-userjwt-fallback";

/* =========================
   Cookies + Headers
========================= */

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  res.setHeader("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");

  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Api-Version", VERSION);
}

function send(res, status, body) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify({ ...body, version: VERSION }));
}

function ok(res, body) {
  return send(res, 200, body);
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

function getQuery(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const q = {};
    url.searchParams.forEach((v, k) => (q[k] = v));
    return q;
  } catch {
    return {};
  }
}

function normalizeBoolFlag(v, defaultValue) {
  if (v === undefined || v === null || v === "") return defaultValue;
  const s = String(v).toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return defaultValue;
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
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/* =========================
   Sanitizers (server-owned)
========================= */

function stripServerOwned(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const out = { ...p };

  // server-owned / generated / audit
  delete out.nombre_ci;
  delete out.created_at;
  delete out.updated_at;
  delete out.deleted_at;
  delete out.revoked_at;
  delete out.created_by;
  delete out.updated_by;

  // multi-tenant / ownership (siempre desde ctx)
  delete out.org_id;
  delete out.tenant_id;
  delete out.user_id;
  delete out.owner_id;
  delete out.usuario_id;

  // compat: NO permitir orgId enviado
  delete out.orgId;

  return out;
}

/* =========================
   Context Resolver (CANÓNICO)
   Objetivo:
   - Validar usuario con cookie tg_at
   - Resolver org/role por memberships
   - NO depender obligatoriamente de Service Role (evita mismatch prod/preview)

   Estrategia:
   - sbUser: anon key + Authorization: Bearer tg_at
   - sbSrv: (opcional) service role key
   - Resolver memberships intentando primero con sbSrv; si falla, caer a sbUser (RLS)
========================= */

async function resolveContext(req) {
  const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const SUPABASE_ANON_KEY = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);

  // OJO: Service role es útil, pero NO obligatorio
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

  // Cliente usuario (anon + bearer)
  const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: u1, error: uerr } = await sbUser.auth.getUser();
  const user = u1?.user ? { id: u1.user.id, email: u1.user.email } : null;
  if (!user || uerr) {
    return { ok: false, status: 401, error: "Invalid session", details: uerr?.message || "No user" };
  }

  // Cliente service role (opcional)
  const sbSrv = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

  // Helper: intenta consultar con client y si falla retorna null
  async function tryMaybeSingle(client, builderFn) {
    try {
      const { data, error } = await builderFn(client);
      if (error) return { ok: false, error };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: { message: String(e?.message || e) } };
    }
  }

  // 1) Intentar org activa persistida (si existe tabla user_current_org)
  let currentOrgId = null;
  const ucoQuery = (c) => c.from("user_current_org").select("org_id").eq("user_id", user.id).maybeSingle();

  // Preferimos service role si existe, pero si falla, intentamos con user JWT
  if (sbSrv) {
    const r1 = await tryMaybeSingle(sbSrv, ucoQuery);
    if (r1.ok && r1.data?.org_id) currentOrgId = String(r1.data.org_id);
  }
  if (!currentOrgId) {
    const r2 = await tryMaybeSingle(sbUser, ucoQuery);
    if (r2.ok && r2.data?.org_id) currentOrgId = String(r2.data.org_id);
  }

  // 2) Resolver membership: org activa si existe, si no default
  let mRow = null;

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
    // A) org activa
    if (currentOrgId) {
      if (sbSrv) {
        const r = await tryMaybeSingle(sbSrv, membershipForOrg(currentOrgId));
        if (r.ok && r.data?.org_id && r.data?.role) return { row: r.data, client: sbSrv };
      }
      {
        const r = await tryMaybeSingle(sbUser, membershipForOrg(currentOrgId));
        if (r.ok && r.data?.org_id && r.data?.role) return { row: r.data, client: sbUser };
      }
    }

    // B) default
    if (sbSrv) {
      const r = await tryMaybeSingle(sbSrv, membershipDefault);
      if (r.ok && r.data?.org_id && r.data?.role) return { row: r.data, client: sbSrv };
    }

    const r2 = await tryMaybeSingle(sbUser, membershipDefault);
    if (r2.ok && r2.data?.org_id && r2.data?.role) return { row: r2.data, client: sbUser };

    return { row: null, client: sbUser };
  }

  const { row: mResolved, client: dbClient } = await resolveMembership();

  if (!mResolved?.org_id || !mResolved?.role) {
    return {
      ok: false,
      status: 403,
      error: "Missing org/role context",
      details: "No active membership found for user",
    };
  }

  const ctx = {
    org_id: String(mResolved.org_id),
    role: String(mResolved.role),
    tenant_id: String(mResolved.org_id), // canónico: tenant == org
  };

  // Usaremos dbClient para TODAS las operaciones (service role si está sano; si no, user JWT)
  return { ok: true, user, ctx, sbDb: dbClient };
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

    const ctxRes = await resolveContext(req);
    if (!ctxRes.ok) {
      return send(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });
    }

    const { ctx, sbDb, user } = ctxRes;
    const org_id = String(ctx.org_id);
    const tenant_id = String(ctx.tenant_id || ctx.org_id);
    const user_id = String(user.id);

    // GET
    if (req.method === "GET") {
      const q = getQuery(req);
      const action = String(q.action || "list");

      if (action === "list") {
        const onlyActive = normalizeBoolFlag(q.onlyActive, true);
        const limit = Math.min(Number(q.limit || 2000), 2000);

        let query = sbDb
          .from("geocercas")
          .select("id,nombre,name,nombre_ci,org_id,tenant_id,activo,updated_at")
          .eq("org_id", org_id)
          .order("nombre", { ascending: true })
          .limit(limit);

        if (onlyActive) query = query.eq("activo", true);

        const { data, error } = await query;
        if (error) {
          return ok(res, { ok: false, items: [], error: "Supabase error", details: error.message });
        }

        return ok(res, { ok: true, items: Array.isArray(data) ? data : [] });
      }

      if (action === "get") {
        const id = q.id ? String(q.id) : null;
        if (!id) return send(res, 400, { ok: false, error: "id is required" });

        const { data, error } = await sbDb
          .from("geocercas")
          .select("*")
          .eq("org_id", org_id)
          .eq("id", id)
          .maybeSingle();

        if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });

        return ok(res, { ok: true, item: data || null });
      }

      return send(res, 400, { ok: false, error: "Unsupported action", action });
    }

    // POST
    if (req.method === "POST") {
      const rawPayload = await readBody(req);
      const payload = stripServerOwned(rawPayload);
      const action = String(payload?.action || "upsert").toLowerCase();

      if (!requireWriteRole(ctx.role)) {
        return send(res, 403, { ok: false, error: "Forbidden", details: "Requires owner/admin" });
      }

      if (action === "upsert") {
        const nombreIn = String(payload?.nombre || "").trim();
        const nameIn = String(payload?.name || "").trim();
        const finalName = nombreIn || nameIn;

        if (!finalName) {
          return send(res, 400, { ok: false, error: "nombre (or name) is required" });
        }

        const finalActivo =
          payload?.activo !== undefined
            ? Boolean(payload.activo)
            : payload?.active !== undefined
            ? Boolean(payload.active)
            : payload?.activa !== undefined
            ? Boolean(payload.activa)
            : true;

        // --- AUDIT HARDENING (CRÍTICO PARA PRODUCCIÓN)
        const incomingId = payload?.id ? String(payload.id) : null;

        let createdByToUse = user_id;

        // Si parece UPDATE por id, intentamos conservar created_by existente
        if (incomingId) {
          try {
            const { data: prev, error: prevErr } = await sbDb
              .from("geocercas")
              .select("created_by")
              .eq("org_id", org_id)
              .eq("id", incomingId)
              .maybeSingle();

            if (!prevErr && prev?.created_by) {
              createdByToUse = String(prev.created_by);
            }
          } catch {
            createdByToUse = user_id;
          }
        }

        const nowIso = new Date().toISOString();

        const row = {
          id: incomingId || undefined,
          org_id,
          tenant_id,

          // canonical names
          nombre: finalName,
          name: finalName,

          descripcion: payload?.descripcion ?? undefined,
          geojson: payload?.geojson ?? undefined,
          geometry: payload?.geometry ?? undefined,
          polygon: payload?.polygon ?? undefined,
          geom: payload?.geom ?? undefined,
          lat: payload?.lat ?? undefined,
          lng: payload?.lng ?? undefined,
          radius_m: payload?.radius_m ?? undefined,
          visible: payload?.visible ?? undefined,
          bbox: payload?.bbox ?? undefined,
          personal_ids: payload?.personal_ids ?? undefined,
          asignacion_ids: payload?.asignacion_ids ?? undefined,
          activo: finalActivo,

          // audit fields (FIX)
          created_by: incomingId ? createdByToUse : user_id,
          updated_by: user_id,

          // timestamps
          updated_at: nowIso,
        };

        const { data, error } = await sbDb
          .from("geocercas")
          .upsert(row, { onConflict: "org_id,nombre_ci" })
          .select("*")
          .maybeSingle();

        if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });

        return ok(res, { ok: true, item: data || null });
      }

      if (action === "delete") {
        const id = payload?.id ? String(payload.id) : null;

        const nombres_ci = Array.isArray(payload?.nombres_ci)
          ? payload.nombres_ci.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
          : [];

        const nombre_ci_single = payload?.nombre_ci ? String(payload.nombre_ci).trim().toLowerCase() : null;

        if (!id && !nombres_ci.length && !nombre_ci_single) {
          return ok(res, { ok: true, deleted: 0, skipped: true, reason: "delete called without targets" });
        }

        let q = sbDb
          .from("geocercas")
          .update({
            activo: false,
            updated_at: new Date().toISOString(),
            updated_by: user_id,
          })
          .eq("org_id", org_id)
          .select("id,nombre,name,nombre_ci,org_id,tenant_id,activo,updated_at");

        if (id) q = q.eq("id", id);
        else if (nombres_ci.length) q = q.in("nombre_ci", nombres_ci);
        else if (nombre_ci_single) q = q.eq("nombre_ci", nombre_ci_single);

        const { data, error } = await q;
        if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });

        const arr = Array.isArray(data) ? data : data ? [data] : [];
        return ok(res, { ok: true, deleted: arr.length, items: arr });
      }

      return send(res, 400, { ok: false, error: "Unsupported action", action });
    }

    res.setHeader("Allow", "GET,POST,OPTIONS,HEAD");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
}
