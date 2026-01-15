// api/personal.js
import { createClient } from "@supabase/supabase-js";

/* ───────────────── Helpers ───────────────── */
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

/** ✅ Universal: deja SOLO dígitos (quita +, espacios, guiones, paréntesis, etc.) */
function normalizePhone(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d]/g, "");
}

function requireWriteRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

async function resolveContext(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Missing env vars SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  const jwt = getCookie(req, "tg_at");
  if (!jwt) return { ok: false, status: 401, error: "No authenticated cookie tg_at" };

  const supaAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userErr } = await supaAnon.auth.getUser();
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };

  const { data: ctx, error: ctxErr } = await supaAnon.rpc("bootstrap_session_context");
  if (ctxErr || !ctx?.org_id) {
    return {
      ok: false,
      status: 400,
      error: "bootstrap_session_context failed",
      details: ctxErr?.message || null,
    };
  }

  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return { ok: true, user: userData.user, ctx, supaSrv };
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

/* ───────────────── Handlers ───────────────── */
async function handleList(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaSrv } = ctxRes;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = (url.searchParams.get("q") || "").trim();
  const onlyActive = (url.searchParams.get("onlyActive") || "1") !== "0";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 1), 2000);

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

async function handleUpsert(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaSrv } = ctxRes;

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
  const telefonoNorm = normalizePhone(telefono);
  const documento = payload.documento ? String(payload.documento).trim() : null;

  const fecha_inicio = payload.fecha_inicio || null;
  const fecha_fin = payload.fecha_fin || null;

  let intervalMin = Number(payload.position_interval_min ?? 5);
  if (!Number.isFinite(intervalMin) || intervalMin < 5) intervalMin = 5;
  const position_interval_sec = Math.round(intervalMin * 60);

  if (!nombre) return json(res, 400, { error: "Nombre es obligatorio" });
  if (!email) return json(res, 400, { error: "Email es obligatorio" });

  // ✅ Duplicados por (org, email, telefono_norm) si aplica
  let dupQuery = supaSrv
    .from("personal")
    .select("id")
    .eq("org_id", ctx.org_id)
    .eq("is_deleted", false)
    .eq("email", email);

  if (telefonoNorm) dupQuery = dupQuery.eq("telefono_norm", telefonoNorm);
  else dupQuery = dupQuery.is("telefono_norm", null);

  if (payload.id) dupQuery = dupQuery.neq("id", payload.id);

  const { data: dupRows, error: dupErr } = await dupQuery;
  if (dupErr) return json(res, 500, { error: "No se pudo validar duplicados", details: dupErr.message });
  if (dupRows && dupRows.length > 0) {
    return json(res, 409, { error: "Duplicado: ya existe una persona con este email y teléfono en esta organización" });
  }

  const baseRow = {
    nombre,
    apellido: apellido || null,
    email,
    telefono: telefono || null,
    telefono_norm: telefonoNorm || null,
    documento,
    fecha_inicio,
    fecha_fin,
    vigente: payload.vigente ?? true,
    position_interval_sec,
    updated_at: nowIso,
  };

  if (!payload.id) {
    const insertRow = {
      ...baseRow,
      owner_id: user.id,
      org_id: ctx.org_id,
      created_at: nowIso,
      is_deleted: false,
    };

    const { data, error } = await supaSrv.from("personal").insert(insertRow).select("*").maybeSingle();
    if (error) return json(res, 500, { error: "No se pudo crear personal", details: error.message });

    return json(res, 200, { item: data });
  }

  // Cross-org guard
  const { data: existing, error: exErr } = await supaSrv
    .from("personal")
    .select("id, org_id, is_deleted")
    .eq("id", payload.id)
    .maybeSingle();

  if (exErr) return json(res, 500, { error: "No se pudo leer registro", details: exErr.message });
  if (!existing || existing.is_deleted) return json(res, 404, { error: "Registro no encontrado" });
  if (existing.org_id !== ctx.org_id) return json(res, 403, { error: "Forbidden: cross-org" });

  const { data, error } = await supaSrv
    .from("personal")
    .update(baseRow)
    .eq("id", payload.id)
    .eq("org_id", ctx.org_id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo actualizar personal", details: error.message });

  return json(res, 200, { item: data });
}

async function handleToggle(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaSrv } = ctxRes;

  if (!requireWriteRole(ctx.role)) return json(res, 403, { error: "Forbidden: requiere rol admin u owner" });

  const body = await readBody(req);
  const id = body?.id;
  if (!id) return json(res, 400, { error: "Missing id" });

  const nowIso = new Date().toISOString();

  const { data: row, error: fetchErr } = await supaSrv
    .from("personal")
    .select("id, org_id, vigente, is_deleted")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return json(res, 500, { error: "No se pudo leer vigente", details: fetchErr.message });
  if (!row || row.is_deleted) return json(res, 404, { error: "Registro no encontrado" });
  if (row.org_id !== ctx.org_id) return json(res, 403, { error: "Forbidden: cross-org" });

  const { data, error } = await supaSrv
    .from("personal")
    .update({ vigente: !row.vigente, updated_at: nowIso })
    .eq("id", id)
    .eq("org_id", ctx.org_id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo actualizar vigente", details: error.message });

  return json(res, 200, { item: data });
}

async function handleDelete(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaSrv } = ctxRes;

  if (!requireWriteRole(ctx.role)) return json(res, 403, { error: "Forbidden: requiere rol admin u owner" });

  const body = await readBody(req);
  const id = body?.id;
  if (!id) return json(res, 400, { error: "Missing id" });

  const nowIso = new Date().toISOString();

  const { data: row, error: fetchErr } = await supaSrv
    .from("personal")
    .select("id, org_id, is_deleted")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return json(res, 500, { error: "No se pudo leer registro", details: fetchErr.message });
  if (!row || row.is_deleted) return json(res, 404, { error: "Registro no encontrado" });
  if (row.org_id !== ctx.org_id) return json(res, 403, { error: "Forbidden: cross-org" });

  const { data, error } = await supaSrv
    .from("personal")
    .update({ is_deleted: true, vigente: false, deleted_at: nowIso, updated_at: nowIso })
    .eq("id", id)
    .eq("org_id", ctx.org_id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo eliminar personal", details: error.message });

  return json(res, 200, { item: data });
}

/* ───────────────── Entry ───────────────── */
export default async function handler(req, res) {
  try {
    // ✅ CORS correcto para cookies (NO wildcard con credentials)
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
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
    return json(res, 500, { error: "Unexpected error", details: e?.message || String(e) });
  }
}
