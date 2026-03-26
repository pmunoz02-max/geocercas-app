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

  // 2) Resolver membership según regla universal
  // Si requestedOrgId está presente, solo se permite continuar si hay membership válida en esa org
  // Si no, se permite fallback a org activa o default
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

  if (requestedOrgId) {
    // Regla: si se pidió org explícita y no hay membership válida, 403 sin fallback
    let m = null;
    if (sbSrv) {
      const r = await tryMaybeSingle(sbSrv, membershipForOrg(requestedOrgId));
      if (r.ok && r.data?.org_id) m = r.data;
    }
    if (!m) {
      const r2 = await tryMaybeSingle(sbUser, membershipForOrg(requestedOrgId));
      if (r2.ok && r2.data?.org_id) m = r2.data;
    }
    if (!m) {
      return {
        ok: false,
        status: 403,
        error: "Requested org is not available for current user",
        details: "No valid membership for requestedOrgId; fallback is forbidden by security policy."
      };
    }
    mRow = m;
  } else {
    // Sin org explícita: permitir fallback a org activa o default
    async function resolveMembership() {
      // A) org activa
      if (currentOrgId) {
        if (sbSrv) {
          const r = await tryMaybeSingle(sbSrv, membershipForOrg(currentOrgId));
          if (r.ok && r.data?.org_id) return r.data;
        }
        const r2 = await tryMaybeSingle(sbUser, membershipForOrg(currentOrgId));
        if (r2.ok && r2.data?.org_id) return r2.data;
      }
      // B) default
      if (sbSrv) {
        const r = await tryMaybeSingle(sbSrv, membershipDefault);
        if (r.ok && r.data?.org_id) return r.data;
      }
      const r2 = await tryMaybeSingle(sbUser, membershipDefault);
      if (r2.ok && r2.data?.org_id) return r2.data;
      return null;
    }
    mRow = await resolveMembership();
    if (!mRow?.org_id) {
      return {
        ok: false,
        status: 403,
        error: "No membership",
        details: "User has no active membership",
      };
    }
  }

  const ctx = {
    org_id: String(mRow.org_id),
    tenant_id: String(mRow.org_id), // tenant = org (modelo actual)
    role: String(mRow.role || "member"),
  };

  // sbDb: preferimos service role para operaciones internas si existe, si no user
  const sbDb = sbSrv || sbUser;

  return {
    ok: true,
    ctx,
    user,
    sbDb,
    env: {
      supabase_url: SUPABASE_URL,
      has_service_role: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    },
  };
}

/* =========================
   Handler
========================= */

export default async function handler(req, res) {
  try {
    // CORS preflight / OPTIONS
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

    // Multi-tenant hardening: extraer requestedOrgId universal
    const query = getQuery(req);
    const payload = req.method === "POST" ? (await readBody(req)) || {} : null;
    // Import dinámico para evitar circularidad si aplica
    const { extractRequestedOrgId } = await import("./_lib/extractRequestedOrgId.js");
    const requestedOrgId = extractRequestedOrgId({ payload, query });
    const ctxRes = await resolveContext(req, { requestedOrgId });
    if (!ctxRes.ok) {
      return send(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });
    }

    const { ctx, sbDb, user, env } = ctxRes;
    const org_id = String(ctx.org_id);
    const tenant_id = String(ctx.tenant_id || ctx.org_id);
    const user_id = String(user.id);

    // GET
    if (req.method === "GET") {
      const q = getQuery(req);
      const action = String(q.action || "list");

      // =========================
      // ENV CHECK (SAFE) - Preview only
      // =========================
      if (action === "env") {
        const token = String(req.headers["x-envcheck-token"] || "");
        const expected = getEnv(["ENVCHECK_TOKEN"]);
        if (!expected || token !== expected) {
          return send(res, 401, { ok: false, error: "Unauthorized env check" });
        }

        // Read marker from app_settings (json/jsonb)
        const { data: markerRow, error: markerErr } = await sbDb
          .from("app_settings")
          .select("key,value")
          .eq("key", "env_marker")
          .maybeSingle();

        const supabaseHost = (() => {
          try {
            return new URL(env?.supabase_url || "").host || null;
          } catch {
            return null;
          }
        })();

        const guess =
          supabaseHost && supabaseHost.includes("mujwsfhkocsuuahlrssn")
            ? "mujwsfhkocsuuahlrssn"
            : supabaseHost && supabaseHost.includes("wpaixkvokdkudymgjoua")
            ? "wpaixkvokdkudymgjoua"
            : null;

        return ok(res, {
          ok: true,
          supabase_url_host: supabaseHost,
          project_ref_guess: guess,
          has_service_role: Boolean(env?.has_service_role),
          env_marker: markerErr ? null : markerRow?.value ?? null,
          vercel_env: process.env.VERCEL_ENV || null,
          node_env: process.env.NODE_ENV || null,
        });
      }

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

      // ==========
      // Writes require role
      // ==========
      if (!requireWriteRole(ctx.role)) {
        return send(res, 403, { ok: false, error: "Forbidden", details: "Requires owner/admin role" });
      }

      if (action === "upsert") {
        const item = payload?.item && typeof payload.item === "object" ? payload.item : payload;

        const row = {
          ...item,
          org_id,
          tenant_id,
          updated_at: new Date().toISOString(),
          updated_by: user_id,
        };

        // IMPORTANT: nombre_ci is server-owned (if you use it)
        if (row.nombre) row.nombre_ci = String(row.nombre).toLowerCase().trim();

        const { data, error } = await sbDb.from("geocercas").upsert(row).select("*");
        if (error) return send(res, 500, { ok: false, error: "Supabase error", details: error.message });

        const arr = Array.isArray(data) ? data : data ? [data] : [];
        return ok(res, { ok: true, saved: arr.length, items: arr });
      }

      if (action === "delete") {
        const id = payload?.id ? String(payload.id) : null;
        if (!id) return send(res, 400, { ok: false, error: "id is required" });

        const { data, error } = await sbDb.from("geocercas").delete().eq("org_id", org_id).eq("id", id).select("*");

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