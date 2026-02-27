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

async function resolveContext(req) {
  const accessToken = getCookie(req, "tg_at");
  if (!accessToken) return { ok: false, status: 401, error: "No session cookie (tg_at)" };

  const supabase = buildSupabaseForUser(accessToken);

  // Validar sesión
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };

  const user = userData.user;

  // Resolver org/role desde memberships (default si existe)
  const { data: mRow, error: mErr } = await supabase
    .from("memberships")
    .select("org_id, role, is_default, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (mErr) return { ok: false, status: 500, error: mErr.message || "memberships lookup failed" };

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

    const ctx = await resolveContext(req);
    if (!ctx.ok) return json(res, ctx.status, { ok: false, error: ctx.error });

    const { supabase, orgId } = ctx;

    if (!orgId) {
      return json(res, 403, { ok: false, error: "No org resolved for current user" });
    }

    // tenant real = tenant_id (NOT NULL)
    const tenantId = orgId;

    const id = typeof req.query?.id === "string" ? req.query.id : null;

    // ---------- GET ----------
    if (req.method === "GET") {
      const includeInactive = req.query?.includeInactive === "true" || req.query?.includeInactive === "1";

      let q = supabase
        .from("activities")
        .select("id, tenant_id, org_id, name, description, active, currency_code, hourly_rate, created_at, created_by")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (!includeInactive) q = q.eq("active", true);

      const { data, error } = await q;
      if (error) return json(res, 400, { ok: false, error: error.message });

      return json(res, 200, { ok: true, data: data || [] });
    }

    // ---------- POST ----------
    if (req.method === "POST") {
      const body = safeJson(req.body);
      const name = String(body?.name || "").trim();
      if (!name) return json(res, 400, { ok: false, error: "Missing name" });

      const payload = {
        tenant_id: tenantId, // ✅ NOT NULL
        org_id: tenantId, // ✅ compat
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

      if (error) return json(res, 400, { ok: false, error: error.message });

      return json(res, 201, { ok: true, data });
    }

    // Requiere id para PUT/PATCH/DELETE
    if (!id) return json(res, 400, { ok: false, error: "Missing id query param (?id=...)" });

    // ---------- PUT ----------
    if (req.method === "PUT") {
      const body = safeJson(req.body);

      const patch = {
        name: body?.name !== undefined ? String(body.name).trim() : undefined,
        description: body?.description !== undefined ? (body.description || null) : undefined,
        currency_code: body?.currency_code !== undefined ? (body.currency_code || "USD") : undefined,
        hourly_rate: body?.hourly_rate !== undefined ? body.hourly_rate : undefined,
      };
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

      if (patch.name !== undefined && !patch.name) {
        return json(res, 400, { ok: false, error: "Invalid name" });
      }

      const { data, error } = await supabase
        .from("activities")
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("id, tenant_id, org_id, name, description, active, currency_code, hourly_rate, created_at, created_by")
        .single();

      if (error) return json(res, 400, { ok: false, error: error.message });

      return json(res, 200, { ok: true, data });
    }

    // ---------- PATCH (active) ----------
    if (req.method === "PATCH") {
      const body = safeJson(req.body);
      const active = Boolean(body?.active);

      const { data, error } = await supabase
        .from("activities")
        .update({ active })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("id, tenant_id, org_id, name, description, active, currency_code, hourly_rate, created_at, created_by")
        .single();

      if (error) return json(res, 400, { ok: false, error: error.message });

      return json(res, 200, { ok: true, data });
    }

    // ---------- DELETE ----------
    if (req.method === "DELETE") {
      const { error } = await supabase.from("activities").delete().eq("id", id).eq("tenant_id", tenantId);

      if (error) return json(res, 400, { ok: false, error: error.message });

      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/actividades] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}