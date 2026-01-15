// api/actividades.js
//
// Endpoints de Actividades (multi-tenant, sin org_id en frontend)
// Fuente de auth: cookie HttpOnly tg_at
// Contexto: public.bootstrap_session_context()
// Patrón: igual a Personal (server resuelve org + role)

import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const cookie = req.headers?.cookie || "";
  const parts = cookie.split(";").map((p) => p.trim());
  const hit = parts.find((p) => p.startsWith(`${name}=`));
  if (!hit) return null;
  return decodeURIComponent(hit.slice(name.length + 1));
}

function supabaseFromReq(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in env");
  }

  const accessToken = getCookie(req, "tg_at");
  // Usamos anon + Authorization Bearer para correr como usuario (RLS)
  return {
    supabase: createClient(url, anon, {
      global: {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    accessToken,
  };
}

async function resolveContext(req) {
  const { supabase, accessToken } = supabaseFromReq(req);
  if (!accessToken) {
    return { ok: false, status: 401, supabase, message: "No session cookie (tg_at)" };
  }

  // Validar token (opcional pero recomendable)
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, supabase, message: "Invalid session" };
  }

  // Bootstrap de contexto (org/role)
  const { data: ctx, error: ctxErr } = await supabase.rpc("bootstrap_session_context");
  if (ctxErr) {
    return { ok: false, status: 500, supabase, message: ctxErr.message || "bootstrap_session_context failed" };
  }

  // ctx típicamente trae org_id / role; tolerante:
  const orgId = ctx?.org_id ?? ctx?.current_org_id ?? null;
  const role = (ctx?.role ?? ctx?.current_role ?? ctx?.currentRole ?? null);
  return {
    ok: true,
    status: 200,
    supabase,
    user: userData.user,
    orgId,
    role,
  };
}

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    const ctx = await resolveContext(req);
    if (!ctx.ok) {
      return json(res, ctx.status, { ok: false, error: ctx.message });
    }

    const { supabase, orgId } = ctx;

    // Si no hay org resuelta por servidor, el módulo no puede operar
    if (!orgId) {
      return json(res, 403, { ok: false, error: "No org resolved for current user" });
    }

    // /api/actividades?id=UUID
    const id = typeof req.query?.id === "string" ? req.query.id : null;

    // ---------- GET: listar ----------
    if (req.method === "GET") {
      const includeInactive =
        req.query?.includeInactive === "true" || req.query?.includeInactive === "1";

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

    // ---------- POST: crear ----------
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
      const name = String(body?.name || "").trim();
      if (!name) return json(res, 400, { ok: false, error: "Missing name" });

      const payload = {
        org_id: orgId, // ✅ org desde servidor
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

    // Para PUT/PATCH/DELETE requerimos id
    if (!id) {
      return json(res, 400, { ok: false, error: "Missing id query param (?id=...)" });
    }

    // ---------- PUT: actualizar ----------
    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
      const patch = {
        name: body?.name !== undefined ? String(body.name).trim() : undefined,
        description: body?.description !== undefined ? (body.description || null) : undefined,
        currency_code: body?.currency_code !== undefined ? (body.currency_code || "USD") : undefined,
        hourly_rate: body?.hourly_rate !== undefined ? body.hourly_rate : undefined,
      };

      // limpiar undefined
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

      if (patch.name !== undefined && !patch.name) {
        return json(res, 400, { ok: false, error: "Invalid name" });
      }

      const { data, error } = await supabase
        .from("activities")
        .update(patch)
        .eq("id", id)
        .eq("org_id", orgId) // ✅ seguridad extra multi-tenant
        .select("id, org_id, name, description, active, currency_code, hourly_rate, created_at, updated_at")
        .single();

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    // ---------- PATCH: toggle active ----------
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
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

    // ---------- DELETE ----------
    if (req.method === "DELETE") {
      const { error } = await supabase
        .from("activities")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId);

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/actividades] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}

function safeJson(txt) {
  try {
    return JSON.parse(txt || "{}");
  } catch {
    return {};
  }
}
