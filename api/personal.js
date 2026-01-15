import { createClient } from "@supabase/supabase-js";

/* =========================
   Helpers
========================= */

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(name + "="));
  if (!found) return null;
  return decodeURIComponent(found.split("=").slice(1).join("="));
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function normalizePhone(phone) {
  if (!phone) return null;
  const p = String(phone).replace(/[^\d]/g, "");
  return p || null;
}

function requireWriteRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
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

/* =========================
   Context resolution
========================= */

async function resolveContext(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Missing Supabase env vars",
    };
  }

  const jwt = getCookie(req, "tg_at");
  if (!jwt) {
    return { ok: false, status: 401, error: "No authenticated cookie" };
  }

  // Cliente con JWT del usuario (auth.uid() válido en DB)
  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid session" };
  }

  const { data: rpcData, error: ctxErr } = await supaUser.rpc("bootstrap_session_context");
  if (ctxErr) {
    return {
      ok: false,
      status: 400,
      error: "bootstrap_session_context failed",
      details: ctxErr.message,
    };
  }

  const ctx = normalizeCtx(rpcData);
  if (!ctx?.org_id || !ctx?.role) {
    return {
      ok: false,
      status: 400,
      error: "Invalid session context",
      details: rpcData,
    };
  }

  // Cliente service role (lecturas / queries complejas)
  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    ok: true,
    user: userData.user,
    ctx,
    supaUser,
    supaSrv,
  };
}

/* =========================
   Handlers
========================= */

async function handleList(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, ctxRes);

  const { ctx, supaSrv } = ctxRes;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = (url.searchParams.get("q") || "").trim();
  const onlyActive = (url.searchParams.get("onlyActive") || "1") !== "0";
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);

  let query = supaSrv
    .from("personal")
    .select("*")
    .eq("org_id", ctx.org_id)
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
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) {
    return json(res, 500, { error: "No se pudo listar personal", details: error.message });
  }

  return json(res, 200, { items: data || [] });
}

async function handleUpsert(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, ctxRes);

  const { ctx, user, supaUser } = ctxRes;

  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { error: "Forbidden: requiere rol admin u owner" });
  }

  const body = await readBody(req);
  const payload = body?.payload || body || {};
  const nowIso = new Date().toISOString();

  const nombre = (payload.nombre || "").trim();
  const apellido = (payload.apellido || "").trim();
  const email = (payload.email || "").trim().toLowerCase();
  const telefono = (payload.telefono || "").trim();
  const telefono_norm = normalizePhone(telefono);

  if (!nombre) return json(res, 400, { error: "Nombre es obligatorio" });
  if (!email) return json(res, 400, { error: "Email es obligatorio" });

  const baseRow = {
    nombre,
    apellido: apellido || null,
    email,
    telefono: telefono || null,
    telefono_norm,
    vigente: payload.vigente ?? true,
    updated_at: nowIso,
  };

  // 1) Buscar existente por org + email (incluye borrados)
  const { data: existing, error: findErr } = await supaUser
    .from("personal")
    .select("*")
    .eq("org_id", ctx.org_id)
    .eq("email", email)
    .maybeSingle();

  if (findErr) {
    return json(res, 500, { error: "No se pudo validar duplicado", details: findErr.message });
  }

  // 2) Existe → UPDATE / REVIVE
  if (existing) {
    const revive = {
      ...baseRow,
      is_deleted: false,
      deleted_at: null,
    };

    const { data, error } = await supaUser
      .from("personal")
      .update(revive)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();

    if (error) {
      return json(res, 500, { error: "No se pudo actualizar personal", details: error.message });
    }

    return json(res, 200, { item: data, revived: true });
  }

  // 3) No existe → INSERT
  const insertRow = {
    ...baseRow,
    org_id: ctx.org_id,
    owner_id: user.id,
    created_at: nowIso,
    is_deleted: false,
  };

  const { data, error } = await supaUser
    .from("personal")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (error) {
    return json(res, 500, { error: "No se pudo crear personal", details: error.message });
  }

  return json(res, 200, { item: data, created: true });
}

async function handleToggle(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, ctxRes);

  const { ctx, supaUser } = ctxRes;
  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { error: "Forbidden: requiere rol admin u owner" });
  }

  const body = await readBody(req);
  if (!body?.id) return json(res, 400, { error: "Missing id" });

  const nowIso = new Date().toISOString();

  const { data, error } = await supaUser
    .from("personal")
    .update({ vigente: supaUser.sql`not vigente`, updated_at: nowIso })
    .eq("id", body.id)
    .eq("org_id", ctx.org_id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) {
    return json(res, 500, { error: "No se pudo cambiar vigencia", details: error.message });
  }

  return json(res, 200, { item: data });
}

async function handleDelete(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, ctxRes);

  const { ctx, supaUser } = ctxRes;
  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { error: "Forbidden: requiere rol admin u owner" });
  }

  const body = await readBody(req);
  if (!body?.id) return json(res, 400, { error: "Missing id" });

  const nowIso = new Date().toISOString();

  const { data, error } = await supaUser
    .from("personal")
    .update({ is_deleted: true, vigente: false, deleted_at: nowIso, updated_at: nowIso })
    .eq("id", body.id)
    .eq("org_id", ctx.org_id)
    .select("*")
    .maybeSingle();

  if (error) {
    return json(res, 500, { error: "No se pudo eliminar personal", details: error.message });
  }

  return json(res, 200, { item: data });
}

/* =========================
   Main handler
========================= */

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");

    if (req.method === "OPTIONS") return json(res, 200, { ok: true });

    if (req.method === "GET") return await handleList(req, res);
    if (req.method === "POST") return await handleUpsert(req, res);
    if (req.method === "PATCH") return await handleToggle(req, res);
    if (req.method === "DELETE") return await handleDelete(req, res);

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: "Unexpected error", details: String(e) });
  }
}
