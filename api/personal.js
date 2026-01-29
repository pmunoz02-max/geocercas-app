// api/personal.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const VERSION = "personal-api-v20-bearer-only-tenant-guc";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Api-Version", VERSION);
  res.end(JSON.stringify({ ...payload, version: VERSION }));
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

async function readBody(req) {
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

function normalizeCtx(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

function requireWriteRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin" || r === "root" || r === "root_owner";
}

function safeUuid(s) {
  const x = String(s || "").trim();
  if (!x) return null;
  if (!/^[0-9a-fA-F-]{32,36}$/.test(x)) return null;
  return x;
}

function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const s = String(h || "").trim();
  if (!s) return "";
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
}

async function getUserFromAccessToken({ url, anonKey, accessToken }) {
  const sbUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await sbUser.auth.getUser();
  if (error) return { sbUser, user: null, error };
  return { sbUser, user: data?.user || null, error: null };
}

/* =========================
   Context resolver (BEARER ONLY)
========================= */
async function resolveContext(req) {
  const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const SUPABASE_ANON_KEY = getEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Configuración incompleta del servidor (Supabase)",
      details: {
        has: {
          SUPABASE_URL: Boolean(SUPABASE_URL),
          SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        },
      },
    };
  }

  const access_token = getBearerToken(req);
  if (!access_token) {
    return {
      ok: false,
      status: 401,
      error: "No autenticado",
      details: "Falta Authorization: Bearer <access_token>",
    };
  }

  // validate user
  const r = await getUserFromAccessToken({
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    accessToken: access_token,
  });

  const user = r.user;
  const sbUser = r.sbUser;

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Sesión inválida",
      details: r.error?.message || "No user",
    };
  }

  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ctx via RPC (user) fallback admin
  let ctx = null;
  try {
    const { data, error } = await sbUser.rpc("bootstrap_session_context");
    if (!error) ctx = normalizeCtx(data);
  } catch {}

  if (!ctx?.org_id || !ctx?.role) {
    const { data, error } = await supaSrv.rpc("bootstrap_session_context_admin", { p_user_id: user.id });
    if (error) {
      return {
        ok: false,
        status: 403,
        error: "Contexto no inicializado (org/rol)",
        details: error.message,
      };
    }
    ctx = normalizeCtx(data);
  }

  if (!ctx?.org_id || !ctx?.role) {
    return { ok: false, status: 403, error: "Contexto incompleto", details: "Falta org_id o role" };
  }

  return { ok: true, user, ctx, supaSrv };
}

async function resolveEffectiveOrgId({ req, ctx, userId, supaSrv }) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedOrgId = safeUuid(url.searchParams.get("org_id"));

  if (!requestedOrgId) return { org_id: ctx.org_id, source: "ctx" };
  if (String(requestedOrgId) === String(ctx.org_id)) return { org_id: ctx.org_id, source: "ctx_match" };

  const { data, error } = await supaSrv
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", requestedOrgId)
    .maybeSingle();

  if (error) return { org_id: ctx.org_id, source: "ctx_membership_check_error" };
  if (!data?.role) return { org_id: ctx.org_id, source: "ctx_not_member" };
  return { org_id: requestedOrgId, source: `query_member:${String(data.role).toLowerCase()}` };
}

/* =========================
   GET (list)
========================= */
async function handleList(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaSrv } = ctxRes;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = (url.searchParams.get("q") || "").trim();
  const onlyActive = (url.searchParams.get("onlyActive") || "1") !== "0";
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);
  const debug = url.searchParams.get("debug") === "1";

  const eff = await resolveEffectiveOrgId({ req, ctx, userId: user.id, supaSrv });
  const orgIdToUse = eff.org_id;

  let query = supaSrv
    .from("personal")
    .select("*")
    .eq("org_id", orgIdToUse)
    .eq("is_deleted", false)
    .order("nombre", { ascending: true })
    .limit(limit);

  if (onlyActive) query = query.eq("vigente", true);

  if (q) {
    const pattern = `%${q}%`;
    query = query.or(
      [
        `nombre.ilike.${pattern}`,
        `apellido.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `telefono.ilike.${pattern}`,
        `documento.ilike.${pattern}`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) return json(res, 500, { error: "No se pudo listar personal", details: error.message });

  return json(res, 200, {
    items: data || [],
    ...(debug
      ? {
          debug: {
            ctx_org_id: ctx.org_id,
            effective_org_id: orgIdToUse,
            org_source: eff.source,
            role: ctx.role,
            onlyActive,
            limit,
          },
        }
      : {}),
  });
}

/* =========================
   POST (writes via RPC)
========================= */
async function handlePost(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaSrv } = ctxRes;

  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { error: "Sin permisos", details: "Requiere rol admin u owner" });
  }

  const eff = await resolveEffectiveOrgId({ req, ctx, userId: user.id, supaSrv });
  const orgIdToUse = eff.org_id;

  const payload = (await readBody(req)) || {};
  const action = String(payload.action || "").toLowerCase();

  if (action === "toggle") {
    const id = payload.id;
    if (!id) return json(res, 400, { error: "Falta id" });

    const { data, error } = await supaSrv.rpc("personal_toggle_admin", {
      p_org_id: orgIdToUse,
      p_user_id: user.id,
      p_id: id,
    });

    if (error) return json(res, 500, { error: "No se pudo cambiar estado", details: error.message });
    return json(res, 200, { item: data });
  }

  if (action === "delete") {
    const id = payload.id;
    if (!id) return json(res, 400, { error: "Falta id" });

    const { data, error } = await supaSrv.rpc("personal_delete_admin", {
      p_org_id: orgIdToUse,
      p_user_id: user.id,
      p_id: id,
    });

    if (error) return json(res, 500, { error: "No se pudo eliminar", details: error.message });
    return json(res, 200, { item: data });
  }

  // upsert (default)
  const { data, error } = await supaSrv.rpc("personal_upsert_admin", {
    p_org_id: orgIdToUse,
    p_user_id: user.id,
    p_payload: payload,
  });

  if (error) {
    const isValidation = String(error.code || "") === "P0001";
    return json(res, isValidation ? 400 : 500, { error: "No se pudo crear personal", details: error.message });
  }

  return json(res, 200, { item: data });
}

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");

    // IMPORTANTE: ahora necesitamos Authorization
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (req.method === "OPTIONS") return json(res, 200, { ok: true });
    if (req.method === "GET") return await handleList(req, res);
    if (req.method === "POST") return await handlePost(req, res);

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("[api/personal] fatal:", e);
    return json(res, 500, { error: "Unexpected error", details: e?.message || String(e) });
  }
}
