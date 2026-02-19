import { createClient } from "@supabase/supabase-js";

const VERSION = "personal-api-v18-memberships-canonical";

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
  // soporta body ya parseado (por middleware) o stream
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
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

/* =========================
   Context Resolver (CANONICAL)
   memberships es fuente única
========================= */

async function resolveContext(req) {
  const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const SUPABASE_ANON_KEY = getEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
  const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

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

  // Cliente “usuario” solo para validar JWT (getUser)
  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Sesión inválida", details: userErr?.message || "No user" };
  }

  // Cliente service role (sin RLS) para queries canónicas
  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const user = userData.user;

  // memberships canonical:
  // 1) is_default = true
  // 2) fallback: primer membership
  const { data: mDefault, error: mErr } = await supaSrv
    .from("memberships")
    .select("org_id, role, is_default")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  if (mErr) {
    return { ok: false, status: 500, error: "No se pudo leer memberships (default)", details: mErr.message };
  }

  let ctx = mDefault;

  if (!ctx?.org_id || !ctx?.role) {
    const { data: mAny, error: anyErr } = await supaSrv
      .from("memberships")
      .select("org_id, role, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .limit(1);

    if (anyErr) {
      return { ok: false, status: 500, error: "No se pudo leer memberships", details: anyErr.message };
    }

    ctx = Array.isArray(mAny) ? mAny[0] : null;
  }

  if (!ctx?.org_id || !ctx?.role) {
    return {
      ok: false,
      status: 403,
      error: "Contexto no inicializado (org/rol)",
      details: "No hay memberships para este usuario. Verifica tabla memberships.",
    };
  }

  return { ok: true, user, ctx: { org_id: ctx.org_id, role: ctx.role }, supaSrv };
}

/* =========================
   Helpers universales
========================= */

// ✅ UNIVERSAL: nunca .single() / .maybeSingle() para “duplicados”
// Retorna el “mejor candidato” (activo primero, más reciente después)
async function findExistingByEmail({ supaSrv, orgId, email }) {
  const emailLc = String(email || "").trim().toLowerCase();
  if (!emailLc) return { row: null, error: null };

  // 1) Preferir NO borrados (is_deleted=false), más recientes primero
  let q1 = supaSrv
    .from("personal")
    .select("id,is_deleted,updated_at,created_at")
    .eq("org_id", orgId)
    .eq("email", emailLc)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1);

  const { data: d1, error: e1 } = await q1;
  if (e1) return { row: null, error: e1 };
  if (Array.isArray(d1) && d1.length) return { row: d1[0], error: null };

  // 2) Si no hay activos, buscar entre borrados (para “revive”), más recientes primero
  let q2 = supaSrv
    .from("personal")
    .select("id,is_deleted,updated_at,created_at")
    .eq("org_id", orgId)
    .eq("email", emailLc)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1);

  const { data: d2, error: e2 } = await q2;
  if (e2) return { row: null, error: e2 };
  if (Array.isArray(d2) && d2.length) return { row: d2[0], error: null };

  return { row: null, error: null };
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

  return json(res, 200, { items: data || [] });
}

async function handlePost(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaSrv } = ctxRes;

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

    const { data: curArr, error: curErr } = await supaSrv
      .from("personal")
      .select("id, vigente, is_deleted")
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .limit(1);

    if (curErr) return json(res, 500, { error: "No se pudo leer registro", details: curErr.message });

    const cur = Array.isArray(curArr) && curArr.length ? curArr[0] : null;
    if (!cur || cur.is_deleted) return json(res, 404, { error: "No encontrado" });

    const nextVigente = !cur.vigente;

    const { data: updArr, error: updErr } = await supaSrv
      .from("personal")
      .update({ vigente: nextVigente, updated_at: nowIso })
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .limit(1);

    if (updErr) return json(res, 500, { error: "No se pudo cambiar estado", details: updErr.message });

    const upd = Array.isArray(updArr) && updArr.length ? updArr[0] : null;
    return json(res, 200, { item: upd, toggled: true });
  }

  // ===== ACTION: DELETE (soft) =====
  if (action === "delete") {
    if (!id) return json(res, 400, { error: "Falta id" });

    const { data: delArr, error: delErr } = await supaSrv
      .from("personal")
      .update({ is_deleted: true, deleted_at: nowIso, updated_at: nowIso })
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .limit(1);

    if (delErr) return json(res, 500, { error: "No se pudo eliminar", details: delErr.message });

    const del = Array.isArray(delArr) && delArr.length ? delArr[0] : null;
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

  // ✅ DEDUPE UNIVERSAL (sin maybeSingle)
  const { row: existing, error: findErr } = await findExistingByEmail({
    supaSrv,
    orgId: ctx.org_id,
    email,
  });

  if (findErr) {
    return json(res, 500, { error: "No se pudo validar duplicado", details: findErr.message });
  }

  if (existing?.id) {
    const { data: updArr, error } = await supaSrv
      .from("personal")
      .update({ ...baseRow, is_deleted: false, deleted_at: null })
      .eq("id", existing.id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .limit(1);

    if (error) return json(res, 500, { error: "No se pudo actualizar personal", details: error.message });

    const upd = Array.isArray(updArr) && updArr.length ? updArr[0] : null;
    return json(res, 200, { item: upd, revived: true });
  }

  const insertRow = {
    ...baseRow,
    org_id: ctx.org_id,
    owner_id: user.id,
    created_at: nowIso,
    is_deleted: false,
    position_interval_sec: 300,
  };

  const { data: insArr, error } = await supaSrv.from("personal").insert(insertRow).select("*").limit(1);

  if (error) return json(res, 500, { error: "No se pudo crear personal", details: error.message });

  const created = Array.isArray(insArr) && insArr.length ? insArr[0] : null;
  return json(res, 200, { item: created, created: true });
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
