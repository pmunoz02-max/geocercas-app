import { createClient } from "@supabase/supabase-js";

/* =========================
   Utils
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

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
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
   Context Resolver (con fallback ADMIN)
========================= */

async function resolveContext(req) {
  const SUPABASE_URL = getEnv([
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);

  const SUPABASE_ANON_KEY = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);

  const SUPABASE_SERVICE_ROLE_KEY = getEnv([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
  ]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Configuración incompleta del servidor (Supabase)",
      details: {
        required: [
          "SUPABASE_URL",
          "SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
        ],
        has: {
          SUPABASE_URL: Boolean(SUPABASE_URL),
          SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        },
      },
    };
  }

  const jwt = getCookie(req, "tg_at");
  if (!jwt) {
    return {
      ok: false,
      status: 401,
      error: "No autenticado",
      details: "Falta cookie tg_at",
    };
  }

  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user) {
    return {
      ok: false,
      status: 401,
      error: "Sesión inválida",
      details: userErr?.message || "No user",
    };
  }

  // Service role para lecturas/ escrituras server-side
  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Intento normal con JWT
  let ctx = null;
  try {
    const { data, error } = await supaUser.rpc("bootstrap_session_context");
    if (!error) ctx = normalizeCtx(data);
  } catch {
    // seguimos a fallback
  }

  // 2) Fallback ADMIN si el JWT no aplica para RPC
  if (!ctx?.org_id || !ctx?.role) {
    try {
      const { data, error } = await supaSrv.rpc(
        "bootstrap_session_context_admin",
        { p_user_id: userData.user.id }
      );
      if (error) {
        return {
          ok: false,
          status: 403,
          error: "Contexto no inicializado (org/rol)",
          details: error.message,
        };
      }
      ctx = normalizeCtx(data);
    } catch (e) {
      return {
        ok: false,
        status: 403,
        error: "Contexto no inicializado (org/rol)",
        details: e?.message || String(e),
      };
    }
  }

  if (!ctx?.org_id || !ctx?.role) {
    return {
      ok: false,
      status: 403,
      error: "Contexto incompleto",
      details: "Falta org_id o role",
    };
  }

  return { ok: true, user: userData.user, ctx, supaUser, supaSrv };
}

/* =========================
   Handlers
========================= */

async function handleList(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok)
    return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

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
  if (error) return json(res, 500, { error: "No se pudo listar personal", details: error.message });

  return json(res, 200, { items: data || [] });
}

/**
 * ✅ WRITES con supaSrv para evitar 500 por RLS.
 * Permisos se controlan por rol (ctx.role) en el API.
 */
async function handleUpsert(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok)
    return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaSrv } = ctxRes;

  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { error: "Sin permisos", details: "Requiere rol admin u owner" });
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

  const vigente = payload.vigente === undefined ? true : !!payload.vigente;

  const baseRow = {
    nombre,
    apellido: apellido || null,
    email,
    telefono: telefono || null,
    telefono_norm,
    vigente,
    updated_at: nowIso,
  };

  // Duplicado por email dentro de la org (con service role)
  const { data: existing, error: findErr } = await supaSrv
    .from("personal")
    .select("id, is_deleted")
    .eq("org_id", ctx.org_id)
    .eq("email", email)
    .maybeSingle();

  if (findErr) return json(res, 500, { error: "No se pudo validar duplicado", details: findErr.message });

  if (existing) {
    const { data, error } = await supaSrv
      .from("personal")
      .update({ ...baseRow, is_deleted: false, deleted_at: null, vigente: true })
      .eq("id", existing.id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .maybeSingle();

    if (error) return json(res, 500, { error: "No se pudo actualizar personal", details: error.message });

    return json(res, 200, { item: data, revived: true });
  }

  const insertRow = {
    ...baseRow,
    org_id: ctx.org_id,
    owner_id: user.id,
    created_at: nowIso,
    is_deleted: false,
  };

  const { data, error } = await supaSrv
    .from("personal")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo crear personal", details: error.message });

  return json(res, 200, { item: data, created: true });
}

async function handleToggle(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok)
    return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaSrv } = ctxRes;
  if (!requireWriteRole(ctx.role)) return json(res, 403, { error: "Sin permisos" });

  const body = await readBody(req);
  if (!body?.id) return json(res, 400, { error: "Missing id" });

  const nowIso = new Date().toISOString();

  const { data: row, error: rErr } = await supaSrv
    .from("personal")
    .select("id, vigente, org_id, is_deleted")
    .eq("id", body.id)
    .maybeSingle();

  if (rErr) return json(res, 500, { error: "No se pudo leer registro", details: rErr.message });
  if (!row || row.is_deleted) return json(res, 404, { error: "No encontrado" });
  if (row.org_id !== ctx.org_id) return json(res, 403, { error: "Sin permisos" });

  const { data, error } = await supaSrv
    .from("personal")
    .update({ vigente: !row.vigente, updated_at: nowIso })
    .eq("id", body.id)
    .eq("org_id", ctx.org_id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo cambiar vigencia", details: error.message });
  return json(res, 200, { item: data });
}

async function handleDelete(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok)
    return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaSrv } = ctxRes;
  if (!requireWriteRole(ctx.role)) return json(res, 403, { error: "Sin permisos" });

  const body = await readBody(req);
  if (!body?.id) return json(res, 400, { error: "Missing id" });

  const nowIso = new Date().toISOString();

  const { data, error } = await supaSrv
    .from("personal")
    .update({ is_deleted: true, vigente: false, deleted_at: nowIso, updated_at: nowIso })
    .eq("id", body.id)
    .eq("org_id", ctx.org_id)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo eliminar personal", details: error.message });
  return json(res, 200, { item: data });
}

/* =========================
   Entry
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
    console.error("[api/personal] Unexpected error:", e);
    return json(res, 500, { error: "Unexpected error", details: e?.message || String(e) });
  }
}
