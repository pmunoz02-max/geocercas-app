// api/actividades.js
//
// Actividades API (multi-tenant estricto)
// Auth por cookie HttpOnly: tg_at
// Contexto por RPC: public.bootstrap_session_context()
// NO org_id desde frontend.
//
// Debug seguro:
//   GET /api/actividades?debug=1
//   GET /api/actividades?debug_ctx=1  (muestra keys y extracción de org/rol sin exponer token)

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

function extractOrgId(ctx) {
  return (
    ctx?.org_id ??
    ctx?.current_org_id ??
    ctx?.currentOrgId ??
    ctx?.current_org?.id ??
    ctx?.org?.id ??
    (Array.isArray(ctx?.orgs) && ctx.orgs[0]?.id) ??
    null
  );
}

function extractRole(ctx) {
  return (
    ctx?.role ??
    ctx?.current_role ??
    ctx?.currentRole ??
    (ctx?.membership?.role ?? null) ??
    null
  );
}

function sanitizeCtx(ctx) {
  if (!ctx || typeof ctx !== "object") return ctx;
  const out = {};
  for (const k of Object.keys(ctx)) {
    const v = ctx[k];
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

  const { data: ctx, error: ctxErr } = await supabase.rpc("bootstrap_session_context");
  if (ctxErr) return { ok: false, status: 500, error: ctxErr.message || "bootstrap_session_context failed" };

  const orgId = extractOrgId(ctx);
  const role = extractRole(ctx);

  return { ok: true, status: 200, supabase, user: userData.user, ctx, orgId, role };
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
        orgId_extracted: ctx.orgId,
        role_extracted: ctx.role,
        ctx_keys: ctx.ctx ? Object.keys(ctx.ctx) : [],
        ctx_sanitized: sanitizeCtx(ctx.ctx),
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
