// api/actividades.js
//
// Actividades API (multi-tenant estricto)
// Auth por cookie HttpOnly: tg_at
// Contexto por RPC: public.bootstrap_session_context()
// NO org_id desde frontend.
//
// Debug seguro:
//   GET /api/actividades?debug=1
//   GET /api/actividades?debug_ctx=1  (muestra keys y extracción org/rol; soporta ctx como ARRAY)

import { createClient } from "@supabase/supabase-js";

function json(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
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

function buildSupabaseForUser(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");

  return createClient(url, anon, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function normalizeCtx(ctx) {
  // Si el RPC devuelve TABLE/SETOF, Supabase suele entregar array.
  if (Array.isArray(ctx)) return ctx[0] ?? null;
  return ctx ?? null;
}

function asUuidOrNull(v) {
  if (typeof v !== "string") return null;
  // UUID simple check (no perfecto, pero evita booleans/numbers)
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  return ok ? v : null;
}

function extractOrgId(ctxObj) {
  const candidate =
    ctxObj?.org_id ??
    ctxObj?.current_org_id ??
    ctxObj?.currentOrgId ??
    ctxObj?.current_org?.id ??
    ctxObj?.org?.id ??
    (Array.isArray(ctxObj?.orgs) && ctxObj.orgs[0]?.id) ??
    null;

  return asUuidOrNull(candidate);
}

function extractRole(ctxObj) {
  const r =
    ctxObj?.role ??
    ctxObj?.current_role ??
    ctxObj?.currentRole ??
    ctxObj?.membership?.role ??
    null;

  return typeof r === "string" ? r : null;
}

function sanitizeObjectShallow(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = v;
    else if (Array.isArray(v)) out[k] = { type: "array", length: v.length };
    else out[k] = { type: typeof v };
  }
  return out;
}

async function resolveContext(req) {
  const accessToken = getCookie(req, "tg_at");
  if (!accessToken) return { ok: false, status: 401, error: "No session cookie (tg_at)" };

  const supabase = buildSupabaseForUser(accessToken);

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };

  const { data: ctxRaw, error: ctxErr } = await supabase.rpc("bootstrap_session_context");
  if (ctxErr) return { ok: false, status: 500, error: ctxErr.message || "bootstrap_session_context failed" };

  const ctxObj = normalizeCtx(ctxRaw);
  const orgId = extractOrgId(ctxObj);
  const role = extractRole(ctxObj);

  return {
    ok: true,
    status: 200,
    supabase,
    user: userData.user,
    ctxRaw,
    ctxObj,
    orgId,
    role,
  };
}

export default async function handler(req, res) {
  try {
    // Debug básico: cookie llega y user valida
    if (req.method === "GET" && (req.query?.debug === "1" || req.query?.debug === "true")) {
      const accessToken = getCookie(req, "tg_at");
      let userOk = false;

      if (accessToken) {
        const supabase = buildSupabaseForUser(accessToken);
        const { data } = await supabase.auth.getUser(accessToken);
        userOk = Boolean(data?.user);
      }

      return json(res, 200, {
        ok: true,
        has_tg_at: Boolean(accessToken),
        tg_at_len: accessToken ? accessToken.length : 0,
        user_ok: userOk,
        note: "Debug seguro: no se devuelve el token",
      });
    }

    // Debug de contexto (CLAVE)
    if (req.method === "GET" && (req.query?.debug_ctx === "1" || req.query?.debug_ctx === "true")) {
      const ctx = await resolveContext(req);
      if (!ctx.ok) return json(res, ctx.status, { ok: false, error: ctx.error });

      return json(res, 200, {
        ok: true,
        user_id: ctx.user?.id || null,
        ctx_is_array: Array.isArray(ctx.ctxRaw),
        ctx_raw_keys: ctx.ctxRaw && typeof ctx.ctxRaw === "object" ? Object.keys(ctx.ctxRaw) : [],
        ctx_obj_keys: ctx.ctxObj && typeof ctx.ctxObj === "object" ? Object.keys(ctx.ctxObj) : [],
        orgId_extracted: ctx.orgId,
        role_extracted: ctx.role,
        ctx_obj_sanitized: sanitizeObjectShallow(ctx.ctxObj),
      });
    }

    const ctx = await resolveContext(req);
    if (!ctx.ok) return json(res, ctx.status, { ok: false, error: ctx.error });

    const { supabase, orgId } = ctx;

    if (!orgId) {
      return json(res, 403, { ok: false, error: "No org resolved for current user" });
    }

    const id = typeof req.query?.id === "string" ? req.query.id : null;

    if (req.method === "GET") {
      const includeInactive = req.query?.includeInactive === "true" || req.query?.includeInactive === "1";

      let q = supabase
        .from("activities")
        .select("id, org_id, name, description, active, currency_code, hourly_rate, created_at, updated_at")
        .eq("org_id", orgId)
        .order("name", { ascending: true });

      if (!includeInactive) q = q.eq("active", true);

      const { data, error } = await q;
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data: data || [] });
    }

    if (req.method === "POST") {
      const body = safeJson(req.body);
      const name = String(body?.name || "").trim();
      if (!name) return json(res, 400, { ok: false, error: "Missing name" });

      const payload = {
        org_id: orgId,
        name,
        description: body?.description ?? null,
        active: body?.active ?? true,
        currency_code: body?.currency_code ?? "USD",
        hourly_rate: body?.hourly_rate ?? null,
      };

      const { data, error } = await supabase
        .from("activities")
        .insert(payload)
        .select("id, org_id, name, description, active, currency_code, hourly_rate, created_at, updated_at")
        .single();

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 201, { ok: true, data });
    }

    if (!id) return json(res, 400, { ok: false, error: "Missing id query param (?id=...)" });

    if (req.method === "PUT") {
      const body = safeJson(req.body);
      const patch = {
        name: body?.name !== undefined ? String(body.name).trim() : undefined,
        description: body?.description !== undefined ? (body.description || null) : undefined,
        currency_code: body?.currency_code !== undefined ? (body.currency_code || "USD") : undefined,
        hourly_rate: body?.hourly_rate !== undefined ? body.hourly_rate : undefined,
      };
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

      if (patch.name !== undefined && !patch.name) return json(res, 400, { ok: false, error: "Invalid name" });

      const { data, error } = await supabase
        .from("activities")
        .update(patch)
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id, org_id, name, description, active, currency_code, hourly_rate, created_at, updated_at")
        .single();

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    if (req.method === "PATCH") {
      const body = safeJson(req.body);
      const active = Boolean(body?.active);

      const { data, error } = await supabase
        .from("activities")
        .update({ active })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id, org_id, name, description, active, currency_code, hourly_rate, created_at, updated_at")
        .single();

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    if (req.method === "DELETE") {
      const { error } = await supabase.from("activities").delete().eq("id", id).eq("org_id", orgId);
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/actividades] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}
