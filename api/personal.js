import { createClient } from "@supabase/supabase-js";

const VERSION = "personal-api-v13-e164-identity";

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

function onlyDigits(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

/**
 * Heurística “segura” para E.164.
 * - Si ya viene con + y 8-15 dígitos: OK.
 * - Si viene sin +:
 *    - si tiene 11-15 dígitos: lo asumimos como country+number → prefijo "+"
 *    - si parece Ecuador 10 dígitos empezando con 0: +593 + (sin 0)
 *    - si 10 dígitos sin 0: NO adivinamos país → null (evita romper CHECK)
 *
 * Si tu app es Ecuador-first, la regla +593 es la más útil.
 */
function toE164(rawPhone) {
  const p = String(rawPhone || "").trim();
  if (!p) return null;

  // ya E.164
  if (p.startsWith("+")) {
    const d = onlyDigits(p);
    if (d.length >= 8 && d.length <= 15) return `+${d}`;
    return null;
  }

  const d = onlyDigits(p);
  if (d.length >= 11 && d.length <= 15) return `+${d}`;

  // Ecuador: 0XXXXXXXXX (10 dígitos)
  if (d.length === 10 && d.startsWith("0")) {
    return `+593${d.slice(1)}`;
  }

  // No adivinar país
  return null;
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
    return { ok: false, status: 401, error: "No autenticado", details: "Falta cookie tg_at" };
  }

  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Sesión inválida", details: userErr?.message || "No user" };
  }

  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Intento JWT
  let ctx = null;
  try {
    const { data, error } = await supaUser.rpc("bootstrap_session_context");
    if (!error) ctx = normalizeCtx(data);
  } catch {}

  // Fallback admin
  if (!ctx?.org_id || !ctx?.role) {
    const { data, error } = await supaSrv.rpc("bootstrap_session_context_admin", {
      p_user_id: userData.user.id,
    });
    if (error) {
      return { ok: false, status: 403, error: "Contexto no inicializado (org/rol)", details: error.message };
    }
    ctx = normalizeCtx(data);
  }

  if (!ctx?.org_id || !ctx?.role) {
    return { ok: false, status: 403, error: "Contexto incompleto", details: "Falta org_id o role" };
  }

  return { ok: true, user: userData.user, ctx, supaSrv };
}

/* =========================
   Handlers
========================= */

async function handleList(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

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
      [`nombre.ilike.${pattern}`, `apellido.ilike.${pattern}`, `email.ilike.${pattern}`, `telefono.ilike.${pattern}`, `documento.ilike.${pattern}`].join(",")
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
    return json(res, 403, { error: "Sin permisos", details: "Requiere rol admin u owner" });
  }

  const payload = (await readBody(req)) || {};
  const nowIso = new Date().toISOString();

  const nombre = (payload.nombre || "").trim();
  const apellido = (payload.apellido || "").trim();
  const email = (payload.email || "").trim().toLowerCase();
  const documento = (payload.documento || "").trim() || null;

  const telefonoRaw = (payload.telefono || "").trim();
  const phoneE164 = toE164(telefonoRaw); // puede ser null si no es convertible

  if (!nombre) return json(res, 400, { error: "Nombre es obligatorio" });
  if (!email) return json(res, 400, { error: "Email es obligatorio" });

  const vigente = payload.vigente === undefined ? true : !!payload.vigente;
  const activo = vigente; // coherencia con checks “active”
  const emailNorm = email;

  // identity_key requerido cuando está activo (por tu CHECK)
  const identityKey = (documento || emailNorm || "").trim() || null;

  const baseRow = {
    nombre,
    apellido: apellido || null,
    email,
    documento,
    // Guardamos lo que el usuario escribió
    telefono: telefonoRaw || null,
    telefono_raw: telefonoRaw || null,

    // Campos derivados (para satisfacer checks)
    email_norm: emailNorm,
    identity_key: identityKey,
    activo,
    activo_bool: activo,

    // Normalización de teléfono (si podemos en E.164)
    phone_norm: phoneE164,
    telefono_norm: phoneE164, // por compatibilidad (tu tabla tiene ambos)

    vigente,
    updated_at: nowIso,
  };

  // Duplicado por email dentro de la org
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
      .update({ ...baseRow, is_deleted: false, deleted_at: null })
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
    position_interval_sec: 300, // default explícito por tus CHECKs
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
    if (req.method === "POST") return await handleUpsert(req, res);

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("[api/personal] fatal:", e);
    return json(res, 500, { error: "Unexpected error", details: e?.message || String(e) });
  }
}
