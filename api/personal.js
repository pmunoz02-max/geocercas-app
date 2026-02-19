// api/personal.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "personal-api-v20-memberships-canonical-server-owned-universal";

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

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Api-Version", VERSION);

  res.setHeader("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Vary", "Cookie");
}

function json(res, status, payload) {
  setHeaders(res);
  res.statusCode = status;
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

  if (d.length === 10 && d.startsWith("0")) return `+593${d.slice(1)}`;

  return null;
}

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/* =========================
   Context Resolver (UNIVERSAL)
   - tg_at valida user (anon)
   - org: user_current_org (si existe) -> memberships de esa org
   - fallback: memberships default/first
   - supaSrv: service role para TODA tabla (bypass RLS)
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
      error: "Server misconfigured",
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
  if (!jwt) return { ok: false, status: 401, error: "Not authenticated", details: "Missing tg_at cookie" };

  // validar usuario con anon + bearer
  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: "Invalid session", details: userErr?.message || "No user" };
  }

  const user = userData.user;

  // service role (server-owned)
  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // 1) user_current_org (si existe)
  let currentOrgId = null;
  try {
    const { data: uco, error: ucoErr } = await supaSrv
      .from("user_current_org")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ucoErr && uco?.org_id) currentOrgId = String(uco.org_id);
  } catch {}

  // 2) membership preferida: org activa
  let mRow = null;

  if (currentOrgId) {
    const { data, error } = await supaSrv
      .from("memberships")
      .select("org_id, role, is_default, revoked_at, created_at")
      .eq("user_id", user.id)
      .eq("org_id", currentOrgId)
      .is("revoked_at", null)
      .maybeSingle();

    if (!error && data?.org_id && data?.role) mRow = data;
  }

  // 3) fallback: default o primera (revoked_at tolerante)
  if (!mRow) {
    let r = await supaSrv
      .from("memberships")
      .select("org_id, role, is_default, revoked_at, created_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (r.error) {
      r = await supaSrv
        .from("memberships")
        .select("org_id, role, is_default, created_at")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
    }

    const row = Array.isArray(r.data) && r.data.length ? r.data[0] : null;
    if (row?.org_id && row?.role) mRow = row;
  }

  if (!mRow?.org_id || !mRow?.role) {
    return { ok: false, status: 403, error: "Missing org/role context", details: "No active membership found" };
  }

  return { ok: true, user, ctx: { org_id: String(mRow.org_id), role: String(mRow.role) }, supaSrv };
}

/* =========================
   Helpers universales
========================= */

// ✅ Universal: dedupe por email_norm / email sin single/maybeSingle
async function findExistingByEmail({ supaSrv, orgId, emailNorm }) {
  if (!emailNorm) return { row: null, error: null };

  const orClause = `email_norm.eq.${emailNorm},email.eq.${emailNorm},email.ilike.${emailNorm}`;

  // 1) preferir NO borrados
  let r = await supaSrv
    .from("personal")
    .select("id,is_deleted,updated_at,created_at,email,email_norm,identity_key,user_id,owner_id")
    .eq("org_id", orgId)
    .eq("is_deleted", false)
    .or(orClause)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(5);

  if (r.error) return { row: null, error: r.error };
  if (Array.isArray(r.data) && r.data.length) return { row: r.data[0], error: null };

  // 2) fallback: incluye deleted (revive)
  r = await supaSrv
    .from("personal")
    .select("id,is_deleted,updated_at,created_at,email,email_norm,identity_key,user_id,owner_id")
    .eq("org_id", orgId)
    .or(orClause)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(5);

  if (r.error) return { row: null, error: r.error };
  if (Array.isArray(r.data) && r.data.length) return { row: r.data[0], error: null };

  return { row: null, error: null };
}

/* =========================
   Handlers
========================= */

async function handleList(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });

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
  if (error) return json(res, 500, { ok: false, error: "No se pudo listar personal", details: error.message });

  return json(res, 200, { ok: true, items: data || [] });
}

async function handlePost(req, res) {
  const ctxRes = await resolveContext(req);
  if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaSrv } = ctxRes;

  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { ok: false, error: "Sin permisos", details: "Requiere rol admin u owner" });
  }

  const payload = (await readBody(req)) || {};
  const nowIso = new Date().toISOString();

  const action = String(payload.action || "").toLowerCase();
  const id = payload.id ? String(payload.id) : null;

  // TOGGLE
  if (action === "toggle") {
    if (!id) return json(res, 400, { ok: false, error: "Falta id" });

    const { data: curArr, error: curErr } = await supaSrv
      .from("personal")
      .select("id, vigente, is_deleted")
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .limit(1);

    if (curErr) return json(res, 500, { ok: false, error: "No se pudo leer registro", details: curErr.message });

    const cur = Array.isArray(curArr) && curArr.length ? curArr[0] : null;
    if (!cur || cur.is_deleted) return json(res, 404, { ok: false, error: "No encontrado" });

    const nextVigente = !cur.vigente;

    const { data: updArr, error: updErr } = await supaSrv
      .from("personal")
      .update({ vigente: nextVigente, updated_at: nowIso })
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .limit(1);

    if (updErr) return json(res, 500, { ok: false, error: "No se pudo cambiar estado", details: updErr.message });

    return json(res, 200, { ok: true, item: (updArr || [])[0] || null, toggled: true });
  }

  // DELETE (soft)
  if (action === "delete") {
    if (!id) return json(res, 400, { ok: false, error: "Falta id" });

    const { data: delArr, error: delErr } = await supaSrv
      .from("personal")
      .update({ is_deleted: true, deleted_at: nowIso, updated_at: nowIso })
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .limit(1);

    if (delErr) return json(res, 500, { ok: false, error: "No se pudo eliminar", details: delErr.message });

    const del = Array.isArray(delArr) && delArr.length ? delArr[0] : null;
    if (!del) return json(res, 404, { ok: false, error: "No encontrado" });

    return json(res, 200, { ok: true, item: del, deleted: true });
  }

  // UPSERT CREATE/REVIVE
  const nombre = String(payload.nombre || "").trim();
  const apellido = String(payload.apellido || "").trim();
  const emailNorm = normEmail(payload.email);
  const documento = String(payload.documento || "").trim() || null;

  const telefonoRaw = String(payload.telefono || "").trim();
  const telefonoE164 = toE164(telefonoRaw);

  if (!nombre) return json(res, 400, { ok: false, error: "Nombre es obligatorio" });
  if (!emailNorm) return json(res, 400, { ok: false, error: "Email es obligatorio" });

  const vigente = payload.vigente === undefined ? true : !!payload.vigente;

  // ⚠️ IMPORTANTE (UNIVERSAL):
  // email_norm e identity_key son GENERATED ALWAYS -> NO se envían en INSERT/UPDATE.
  // El constraint personal_active_requires_identity se cumple porque email NO es null.

  const baseRow = {
    nombre,
    apellido: apellido || null,
    email: emailNorm,
    documento,
    telefono: telefonoE164 || null,
    telefono_raw: telefonoRaw || null,
    vigente,
    updated_at: nowIso,
  };

  const { row: existing, error: findErr } = await findExistingByEmail({
    supaSrv,
    orgId: ctx.org_id,
    emailNorm,
  });

  if (findErr) return json(res, 500, { ok: false, error: "No se pudo validar duplicado", details: findErr.message });

  // REVIVE/UPDATE
  if (existing?.id) {
    const ensureUserCols = {
      user_id: existing.user_id || user.id,
      owner_id: existing.owner_id || user.id,
    };

    const { data: updArr, error } = await supaSrv
      .from("personal")
      .update({ ...baseRow, ...ensureUserCols, is_deleted: false, deleted_at: null })
      .eq("id", existing.id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .limit(1);

    if (error) return json(res, 500, { ok: false, error: "No se pudo actualizar personal", details: error.message });

    return json(res, 200, { ok: true, item: (updArr || [])[0] || null, revived: true });
  }

  // INSERT
  const insertRow = {
    ...baseRow,
    org_id: ctx.org_id,
    owner_id: user.id,
    user_id: user.id,
    created_at: nowIso,
    is_deleted: false,
    position_interval_sec: 300,
  };

  const { data: insArr, error } = await supaSrv.from("personal").insert(insertRow).select("*").limit(1);
  if (error) return json(res, 500, { ok: false, error: "No se pudo crear personal", details: error.message });

  return json(res, 200, { ok: true, item: (insArr || [])[0] || null, created: true });
}

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (req.method === "OPTIONS") {
      setHeaders(res);
      res.statusCode = 204;
      return res.end();
    }

    if (req.method === "GET") return await handleList(req, res);
    if (req.method === "POST") return await handlePost(req, res);

    res.setHeader("Allow", "GET,POST,OPTIONS");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/personal] fatal:", e);
    return json(res, 500, { ok: false, error: "Unexpected error", details: e?.message || String(e) });
  }
}
