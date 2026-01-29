// api/personal.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const VERSION = "personal-api-v21-dual-auth-tenant-guc";

/* =========================
   Helpers
========================= */
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
  try { return JSON.parse(raw); } catch { return {}; }
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

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const p of cookieHeader.split(";")) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const s = String(h || "").trim();
  if (!s) return "";
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
}

/* =========================
   Cookie refresh (legacy compat)
========================= */
async function refreshAccessToken({ supabaseUrl, anonKey, refreshToken }) {
  const url = `${String(supabaseUrl).replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await r.text();
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }

  if (!r.ok || !j?.access_token) {
    const msg = j?.error_description || j?.error || "Failed to refresh token";
    const err = new Error(msg);
    err.status = 401;
    throw err;
  }
  return j;
}

function makeCookie(name, value, opts = {}) {
  const {
    httpOnly = true,
    secure = true,
    sameSite = "Lax",
    path = "/",
    maxAge,
  } = opts;

  let s = `${name}=${encodeURIComponent(value ?? "")}`;
  if (path) s += `; Path=${path}`;
  if (typeof maxAge === "number") s += `; Max-Age=${maxAge}`;
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += `; Secure`;
  if (httpOnly) s += `; HttpOnly`;
  return s;
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
   Context resolver (DUAL)
   Priority:
   1) Authorization Bearer
   2) Cookies tg_at/tg_rt (legacy)
========================= */
async function resolveContext(req, res) {
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

  // 1) Bearer
  let access_token = getBearerToken(req);

  // 2) Legacy cookies if no bearer
  const cookies = parseCookies(req.headers.cookie || "");
  const cookie_at = cookies.tg_at || "";
  const refresh_token = cookies.tg_rt || "";

  if (!access_token) access_token = cookie_at;

  // refresh legacy if needed (only if using cookies path)
  if (!access_token && refresh_token) {
    const r = await refreshAccessToken({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      refreshToken: refresh_token,
    });
    access_token = r.access_token;

    // keep legacy cookies updated for old modules
    res.setHeader("Set-Cookie", [
      makeCookie("tg_at", r.access_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: Number(r.expires_in || 3600) }),
      makeCookie("tg_rt", r.refresh_token || refresh_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 30 * 24 * 60 * 60 }),
    ]);
  }

  if (!access_token) {
    return {
      ok: false,
      status: 401,
      error: "No autenticado",
      details: "Falta Authorization: Bearer <token> y/o cookies tg_at/tg_rt",
    };
  }

  // validate user
  let sbUser, user;
  {
    const r = await getUserFromAccessToken({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, accessToken: access_token });
    sbUser = r.sbUser;
    user = r.user;

    // legacy: if token invalid and refresh exists, refresh once
    if (!user && refresh_token && !getBearerToken(req)) {
      const refreshed = await refreshAccessToken({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, refreshToken: refresh_token });
      access_token = refreshed.access_token;

      res.setHeader("Set-Cookie", [
        makeCookie("tg_at", refreshed.access_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: Number(refreshed.expires_in || 3600) }),
        makeCookie("tg_rt", refreshed.refresh_token || refresh_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 30 * 24 * 60 * 60 }),
      ]);

      const r2 = await getUserFromAccessToken({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, accessToken: access_token });
      sbUser = r2.sbUser;
      user = r2.user;
    }
  }

  if (!user) return { ok: false, status: 401, error: "Sesión inválida", details: "No user" };

  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ctx via RPC (user)
  let ctx = null;
  try {
    const { data, error } = await sbUser.rpc("bootstrap_session_context");
    if (!error) ctx = normalizeCtx(data);
  } catch {}

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
  const ctxRes = await resolveContext(req, res);
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
      ? { debug: { ctx_org_id: ctx.org_id, effective_org_id: orgIdToUse, org_source: eff.source, role: ctx.role, onlyActive, limit } }
      : {}),
  });
}

/* =========================
   POST (writes via RPC)
========================= */
async function handlePost(req, res) {
  const ctxRes = await resolveContext(req, res);
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
    res.setHeader("Access-Control-Allow-Credentials", "true");
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
