// api/actividades.js
//
// Actividades API (multi-tenant) - MEMBERSHIPS CANONICAL
// Auth por cookie HttpOnly: tg_at
// Contexto: SELECT memberships (NO RPC bootstrap)
//
// FIX universal:
// - Lee SUPABASE_URL / SUPABASE_ANON_KEY con fallback a VITE_... (Vercel)
// - Cache headers anti-parpadeo
//
// NOTA DE ESQUEMA (según tu DB):
// - activities.tenant_id: uuid NOT NULL  -> lo llenamos con orgId resuelto
// - activities.org_id: uuid NULLABLE     -> lo llenamos por compatibilidad
// - NO existe activities.updated_at      -> NO lo pedimos en select

import { createClient } from "@supabase/supabase-js";

const VERSION = "actividades-api-v2-env-fallback-memberships";

/* =========================
   Headers + helpers
========================= */

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

function json(res, status, payload) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify({ ...payload, version: VERSION }));
}

function getCookie(req, name) {
  const header = req.headers?.cookie || "";
  const parts = header.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(`${name}=`));
  if (!found) return null;
  return decodeURIComponent(found.slice(name.length + 1));
}

function safeJson(x) {
  if (!x) return {};
  if (typeof x === "object") return x;
  try {
    return JSON.parse(x);
  } catch {
    return {};
  }
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function normalizeRole(v) {
  if (!v) return null;
  return String(v).trim().toLowerCase();
}

/* =========================
   Supabase client (user JWT)
========================= */

function buildSupabaseForUser(accessToken) {
  const url = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const anon = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);

  if (!url || !anon) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
  }

  return createClient(url, anon, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/* =========================
   Context resolver
========================= */

async function resolveContext(req, { requestedOrgId = null } = {}) {
  const accessToken = getCookie(req, "tg_at");
  if (!accessToken) return { ok: false, status: 401, error: "No session cookie (tg_at)" };

  const supabase = buildSupabaseForUser(accessToken);

  // Validar sesión
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };

  const user = userData.user;

  const loadMembershipForOrg = async (orgId) => {
    if (!orgId) return null;
    const { data, error } = await supabase
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
    const { data, error } = await supabase
      .from("user_current_org")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return null;
    return data?.org_id ? String(data.org_id) : null;
  };

  const loadDefaultMembership = async () => {
    const { data, error } = await supabase
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

  // Regla universal: si requestedOrgId está presente, solo se permite continuar si hay membership válida en esa org
  // Si no, se permite fallback a org activa o default
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

  const orgId = mRow?.org_id || null;
  const role = normalizeRole(mRow?.role);

  return { ok: true, status: 200, supabase, user, orgId, role };
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

    // 1. Leer org_id de query (org_id u orgId)
    const requestedOrgId = req.query?.org_id || req.query?.orgId || null;
    if (!requestedOrgId) {
      return json(res, 400, { error: "missing org_id" });
    }
    // 2. Resolver contexto y membership
    const ctx = await resolveContext(req, { requestedOrgId });
    if (!ctx.ok) return json(res, ctx.status, { error: ctx.error });
    const { supabase, orgId } = ctx;
    if (!orgId) {
      return json(res, 403, { error: "No org resolved for current user" });
    }
    const tenantId = orgId;
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    // ---------- GET ----------
    if (req.method === "GET") {
      // 3. includeInactive: true = todas, false = solo activas
      const includeInactive = req.query?.includeInactive === "true" || req.query?.includeInactive === "1";
      let q = supabase
        .from("activities")
        .select("id, tenant_id, org_id, name, description, active, currency_code, hourly_rate, created_at, created_by")
        .eq("org_id", orgId)
        .order("name", { ascending: true });
      if (!includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: "activities_list_failed", details: error.message, code: error.code, hint: error.hint });
      return json(res, 200, { data: data || [] });
    }

    // ---------- POST ----------
    if (req.method === "POST") {
      // 8. Exigir org_id explícito
      if (!orgId) return json(res, 400, { error: "missing org_id" });
      const body = safeJson(req.body);
      const name = String(body?.name || "").trim();
      if (!name) return json(res, 400, { error: "Missing name" });
      const payload = {
        tenant_id: tenantId,
        org_id: tenantId,
        name,
        description: body?.description ?? null,
        active: body?.active ?? true,
        currency_code: body?.currency_code ?? "USD",
        hourly_rate: body?.hourly_rate ?? null,
      };
      const { data, error } = await supabase
        .from("activities")
        .insert(payload)
        .select("id, tenant_id, org_id, name, description, active, currency_code, hourly_rate, created_at, created_by")
        .single();
      if (error) return json(res, 500, { error: "activities_create_failed", details: error.message, code: error.code, hint: error.hint });
      return json(res, 201, { data });
    }

    // Requiere id para PUT/PATCH/DELETE
    if (!id) return json(res, 400, { error: "Missing id query param (?id=...)" });

    // ---------- PUT ----------
    if (req.method === "PUT") {
      if (!orgId) return json(res, 400, { error: "missing org_id" });
      const body = safeJson(req.body);
      const patch = {
        name: body?.name !== undefined ? String(body.name).trim() : undefined,
        description: body?.description !== undefined ? (body.description || null) : undefined,
        currency_code: body?.currency_code !== undefined ? (body.currency_code || "USD") : undefined,
        hourly_rate: body?.hourly_rate !== undefined ? body.hourly_rate : undefined,
      };
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
      if (patch.name !== undefined && !patch.name) {
        return json(res, 400, { error: "Invalid name" });
      }
      const { data, error } = await supabase
        .from("activities")
        .update(patch)
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id, tenant_id, org_id, name, description, active, currency_code, hourly_rate, created_at, created_by")
        .single();
      if (error) return json(res, 500, { error: "activities_update_failed", details: error.message, code: error.code, hint: error.hint });
      return json(res, 200, { data });
    }

    // ---------- PATCH (active) ----------
    if (req.method === "PATCH") {
      if (!orgId) return json(res, 400, { error: "missing org_id" });
      const body = safeJson(req.body);
      const active = Boolean(body?.active);
      const { data, error } = await supabase
        .from("activities")
        .update({ active })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id, tenant_id, org_id, name, description, active, currency_code, hourly_rate, created_at, created_by")
        .single();
      if (error) return json(res, 500, { error: "activities_toggle_failed", details: error.message, code: error.code, hint: error.hint });
      return json(res, 200, { data });
    }

    // ---------- DELETE ----------
    if (req.method === "DELETE") {
      if (!orgId) return json(res, 400, { error: "missing org_id" });
      const { error } = await supabase.from("activities").delete().eq("id", id).eq("org_id", orgId);
      if (error) return json(res, 500, { error: "activities_delete_failed", details: error.message, code: error.code, hint: error.hint });
      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/actividades] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}