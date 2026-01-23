import { createClient } from "@supabase/supabase-js";

const VERSION = "personal-api-v17-org-override-safe";

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

function requireWriteRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin" || r === "root";
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

function onlyDigits(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

// Ecuador friendly E.164 (solo si se puede asegurar)
function toE164(rawPhone) {
  const p = String(rawPhone || "").trim();
  if (!p) return null;

  if (p.startsWith("+")) {
    const d = onlyDigits(p);
    if (d.length >= 8 && d.length <= 15) return `+${d}`;
    return null;
  }

  const d = onlyDigits(p);
  if (d.length >= 11 && d.length <= 15) return `+${d}`;

  // Ecuador: 0XXXXXXXXX (10) => +593XXXXXXXXX
  if (d.length === 10 && d.startsWith("0")) return `+593${d.slice(1)}`;

  return null;
}

function safeUuid(s) {
  const x = String(s || "").trim();
  if (!x) return null;
  // UUID v4-ish check (suficiente para evitar basura)
  if (!/^[0-9a-fA-F-]{32,36}$/.test(x)) return null;
  return x;
}

/* =========================
   Context Resolver
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
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
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

  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let ctx = null;
  try {
    const { data, error } = await supaUser.rpc("bootstrap_session_context");
    if (!error) ctx = normalizeCtx(data);
  } catch {}

  if (!ctx?.org_id || !ctx?.role) {
    const { data, error } = await supaSrv.rpc("bootstrap_session_context_admin", {
      p_user_id: userData.user.id,
    });
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

  return { ok: true, user: userData.user, ctx, supaSrv };
}

/* =========================
   Org override SAFE
========================= */

async function resolveEffectiveOrgId({ req, ctx, userId, supaSrv }) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedOrgId = safeUuid(url.searchParams.get("org_id"));

  // Si no piden org_id, usar ctx.org_id
  if (!requestedOrgId) return { org_id: ctx.org_id, source: "ctx" };

  // Si piden el mismo, OK
  if (String(requestedOrgId) === String(ctx.org_id)) {
    return { org_id: ctx.org_id, source: "ctx_match" };
  }

  // Validar pertenencia: app_user_roles debe tener user_id+org_id
  const { data, error } = await supaSrv
    .from("app_user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", requestedOrgId)
    .maybeSingle();

  if (error) {
    // Ante duda, NO cambiar org (seguridad)
    return { org_id: ctx.org_id, source: "ctx_membership_check_error" };
  }

  if (!data?.role) {
    // No pertenece => no permitir override
    return { org_id: ctx.org_id, source: "ctx_not_member" };
  }

  // Es miembro => permitir override
  return { org_id: requestedOrgId, source: `query_member:${String(data.role).toLowerCase()}` };
}

/* =========================
   Handlers
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

  // ✅ ORG efectiva (ctx por defecto, override solo si pertenece)
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

async function handlePost(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaSrv } = ctxRes;

  // ✅ org efectiva para escrituras también (seguro)
  const eff = await resolveEffectiveOrgId({ req, ctx, userId: user.id, supaSrv });
  const orgIdToUse = eff.org_id;

  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { error: "Sin permisos", details: "Requiere rol admin u owner" });
  }

  const payload = (await readBody(req)) || {};
  const nowIso = new Date().toISOString();

  const action = String(payload.action || "").toLowerCase();
  const id = payload.id ? String(payload.id) : null;

  // ===== ACTION: TOGGLE =====
  if (action === "toggle") {
    if (!id) return json(res, 400, { error: "Falta id" });

    const { data: cur, error: curErr } = await supaSrv
      .from("personal")
      .select("id, vigente, is_deleted")
      .eq("id", id)
      .eq("org_id", orgIdToUse)
      .maybeSingle();

    if (curErr) return json(res, 500, { error: "No se pudo leer registro", details: curErr.message });
    if (!cur || cur.is_deleted) return json(res, 404, { error: "No encontrado" });

    const nextVigente = !cur.vigente;

    const { data: upd, error: updErr } = await supaSrv
      .from("personal")
      .update({ vigente: nextVigente, updated_at: nowIso })
      .eq("id", id)
      .eq("org_id", orgIdToUse)
      .select("*")
      .maybeSingle();

    if (updErr) return json(res, 500, { error: "No se pudo cambiar estado", details: updErr.message });

    return json(res, 200, { item: upd, toggled: true });
  }

  // ===== ACTION: DELETE (soft) =====
  if (action === "delete") {
    if (!id) return json(res, 400, { error: "Falta id" });

    const { data: del, error: delErr } = await supaSrv
      .from("personal")
      .update({ is_deleted: true, deleted_at: nowIso, updated_at: nowIso })
      .eq("id", id)
      .eq("org_id", orgIdToUse)
      .select("*")
      .maybeSingle();

    if (delErr) return json(res, 500, { error: "No se pudo eliminar", details: delErr.message });
    if (!del) return json(res, 404, { error: "No encontrado" });

    return json(res, 200, { item: del, deleted: true });
  }

  // ===== UPSERT CREATE/REVIVE =====

  const nombre = (payload.nombre || "").trim();
  const apellido = (payload.apellido || "").trim();
  const email = (payload.email || "").trim().toLowerCase();
  const documento = (payload.documento || "").trim() || null;

  const telefonoRaw = (payload.telefono || "").trim();
  const telefonoE164 = toE164(telefonoRaw);

  if (!nombre) return json(res, 400, { error: "Nombre es obligatorio" });
  if (!email) return json(res, 400, { error: "Email es obligatorio" });

  const vigente = payload.vigente === undefined ? true : !!payload.vigente;

  const baseRow = {
    nombre,
    apellido: apellido || null,
    email,
    documento,
    telefono: telefonoE164 || null,
    telefono_raw: telefonoRaw || null,
    vigente,
    updated_at: nowIso,
  };

  const { data: existing, error: findErr } = await supaSrv
    .from("personal")
    .select("id, is_deleted")
    .eq("org_id", orgIdToUse)
    .eq("email", email)
    .maybeSingle();

  if (findErr) return json(res, 500, { error: "No se pudo validar duplicado", details: findErr.message });

  if (existing) {
    const { data, error } = await supaSrv
      .from("personal")
      .update({ ...baseRow, is_deleted: false, deleted_at: null })
      .eq("id", existing.id)
      .eq("org_id", orgIdToUse)
      .select("*")
      .maybeSingle();

    if (error) return json(res, 500, { error: "No se pudo actualizar personal", details: error.message });
    return json(res, 200, { item: data, revived: true });
  }

  const insertRow = {
    ...baseRow,
    org_id: orgIdToUse,
    owner_id: user.id,
    created_at: nowIso,
    is_deleted: false,
    position_interval_sec: 300,
  };

  const { data, error } = await supaSrv
    .from("personal")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (error) return json(res, 500, { error: "No se pudo crear personal", details: error.message });

  return json(res, 200, { item: data, created: true });
}

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
