// api/personal.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "personal-api-v21-memberships-canonical-server-owned-universal";

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

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
}

/* =========================
   Context Resolver (UNIVERSAL)
========================= */

async function resolveContext(req, { requestedOrgId = null } = {}) {
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

  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: "Invalid session", details: userErr?.message || "No user" };
  }

  const user = userData.user;

  const supaSrv = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // 1) user_current_org
  let currentOrgId = null;
  try {
    const { data: uco, error: ucoErr } = await supaSrv
      .from("user_current_org")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ucoErr && uco?.org_id) currentOrgId = String(uco.org_id);
  } catch {}

  if (requestedOrgId && isUuid(requestedOrgId)) {
    currentOrgId = String(requestedOrgId);
  }

  // 2) membership en org activa
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

  // 3) fallback default/primera
  if (!mRow) {
    if (requestedOrgId) {
      return {
        ok: false,
        status: 403,
        error: "Requested org is not available for current user",
      };
    }

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
   Helpers
========================= */

async function findExistingByEmail({ supaSrv, orgId, emailNorm }) {
  if (!emailNorm) return { row: null, error: null };

  const orClause = `email_norm.eq.${emailNorm},email.eq.${emailNorm},email.ilike.${emailNorm}`;

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

  r = await supaSrv
    .from("personal")
    .select("id,is_deleted,updated_at,created_at,email,email_norm,identity_key,user_id,owner_id")
    .eq("org_id", orgId) // Hardening: multi-tenant isolation
    .or(orClause)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(5);

  if (r.error) return { row: null, error: r.error };
  if (Array.isArray(r.data) && r.data.length) return { row: r.data[0], error: null };

  return { row: null, error: null };
}

// ✅ evita violar unique (user_id, org_id)
async function ensureUserOrgUnique({ supaSrv, orgId, desiredUserId, excludePersonalId }) {
  if (!desiredUserId) return { ok: true };
  const q = supaSrv
    .from("personal")
    .select("id,user_id,email,is_deleted")
    .eq("org_id", orgId)
    .eq("user_id", desiredUserId)
    .limit(1);

  const { data, error } = await q;
  if (error) return { ok: false, error };

  const row = Array.isArray(data) && data.length ? data[0] : null;
  if (!row) return { ok: true };

  if (excludePersonalId && String(row.id) === String(excludePersonalId)) return { ok: true };

  return {
    ok: false,
    conflict: true,
    details: {
      message: "Ya existe un registro personal vinculado a este usuario en esta organización",
      conflict_personal_id: row.id,
      conflict_email: row.email,
    },
  };
}

/**
 * Obtiene el límite de personal activo permitido por organización según el plan.
 * Busca primero en org_billing_effective.effective_plan_code, luego en org_billing.plan_code,
 * y finalmente resuelve el límite en plan_entitlements.max_members.
 * Devuelve { planCode, maxMembers } o nulls si no hay datos.
 */
async function getPersonalPlanLimit({ supaSrv, orgId }) {
  let planCode = null;

  const eff = await supaSrv
    .from("org_billing_effective")
    .select("effective_plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!eff.error && eff.data?.effective_plan_code) {
    planCode = String(eff.data.effective_plan_code);
  }

  if (!planCode) {
    const ob = await supaSrv
      .from("org_billing")
      .select("plan_code")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!ob.error && ob.data?.plan_code) {
      planCode = String(ob.data.plan_code);
    }
  }

  if (!planCode) {
    return { planCode: null, maxMembers: null };
  }

  const pe = await supaSrv
    .from("plan_entitlements")
    .select("max_members, active")
    .eq("plan_code", planCode)
    .eq("active", true)
    .maybeSingle();

  if (pe.error) throw pe.error;

  return {
    planCode,
    maxMembers:
      typeof pe.data?.max_members === "number" ? pe.data.max_members : null,
  };
}

// Helper para contar personal activo por org_id
async function countActivePersonal({ supaSrv, orgId }) {
  const { count, error } = await supaSrv
    .from("personal")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("vigente", true)
    .eq("is_deleted", false);
  if (error) throw error;
  return typeof count === "number" ? count : 0;
}

/* =========================
   Handlers
========================= */

async function handleList(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedOrgId = url.searchParams.get("org_id") || url.searchParams.get("orgId") || null;

  const ctxRes = await resolveContext(req, { requestedOrgId });
  if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });

  const { ctx, supaSrv } = ctxRes;

  const q = (url.searchParams.get("q") || "").trim();
  const onlyActive = (url.searchParams.get("onlyActive") || "1") !== "0";
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);

  let query = supaSrv
    .from("personal")
    .select("*")
    .eq("org_id", ctx.org_id) // Hardening: multi-tenant isolation
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
  const payload = (await readBody(req)) || {};
  const requestedOrgId =
    payload.org_id ||
    payload.orgId ||
    null;

  const ctxRes = await resolveContext(req, { requestedOrgId });
  if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error, details: ctxRes.details });

  const { ctx, user, supaSrv } = ctxRes;

  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, { ok: false, error: "Sin permisos", details: "Requiere rol admin u owner" });
  }

  const nowIso = new Date().toISOString();

  const action = String(payload.action || "").toLowerCase();
  const id = payload.id ? String(payload.id) : null;

  // TOGGLE
  if (action === "toggle") {
    if (!id) return json(res, 400, { ok: false, error: "Falta id" });

    const { data: currentArr, error: currentErr } = await supaSrv
      .from("personal")
      .select("id, vigente, is_deleted")
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .maybeSingle();

    if (currentErr || !currentArr) {
      return json(res, 404, { ok: false, error: "Not found" });
    }

    const wasVigente = !!currentArr.vigente;
    const isDeleted = !!currentArr.is_deleted;
    const nextVigente = !wasVigente;

    // Enforce only on activation false -> true
    if (!wasVigente && nextVigente && !isDeleted) {
      const { planCode, maxMembers } = await getPersonalPlanLimit({
        supaSrv,
        orgId: ctx.org_id,
      });

      if (typeof maxMembers === "number") {
        const activeCount = await countActivePersonal({
          supaSrv,
          orgId: ctx.org_id,
        });

        if (activeCount >= maxMembers) {
          return json(res, 409, {
            ok: false,
            error: "Plan limit reached",
            details: {
              resource: "personal",
              plan_code: planCode,
              limit: maxMembers,
              current_active: activeCount,
            },
          });
        }
      }
    }

    const { data: updArr, error: updErr } = await supaSrv
      .from("personal")
      .update({ vigente: nextVigente, updated_at: nowIso })
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .limit(1);

    if (updErr) {
      return json(res, 500, {
        ok: false,
        error: "No se pudo cambiar estado",
        details: updErr.message,
      });
    }

    return json(res, 200, {
      ok: true,
      item: (updArr || [])[0] || null,
      toggled: true,
    });
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

  // CREATE/REVIVE
  const nombre = String(payload.nombre || "").trim();
  const apellido = String(payload.apellido || "").trim();
  const emailNorm = normEmail(payload.email);
  const documento = String(payload.documento || "").trim() || null;

  const telefonoRaw = String(payload.telefono || "").trim();
  const telefonoE164 = toE164(telefonoRaw);

  if (!nombre) return json(res, 400, { ok: false, error: "Nombre es obligatorio" });
  if (!emailNorm) return json(res, 400, { ok: false, error: "Email es obligatorio" });

  const vigente = payload.vigente === undefined ? true : !!payload.vigente;

  // ⚠️ email_norm e identity_key son GENERATED ALWAYS -> NO se envían
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

  // user_id solo si viene explícito (vinculación real a auth.users)
  const desiredUserId = isUuid(payload.user_id) ? String(payload.user_id) : null;

  // si se intenta vincular, validar unique (user_id, org_id)
  if (desiredUserId) {
    const chk = await ensureUserOrgUnique({
      supaSrv,
      orgId: ctx.org_id,
      desiredUserId,
      excludePersonalId: null,
    });
    if (!chk.ok) {
      return json(res, 409, { ok: false, error: "Conflicto de vínculo", details: chk.details || chk.error?.message });
    }
  }

  const { row: existing, error: findErr } = await findExistingByEmail({
    supaSrv,
    orgId: ctx.org_id,
    emailNorm,
  });

  if (findErr) return json(res, 500, { ok: false, error: "No se pudo validar duplicado", details: findErr.message });

  // UPDATE/REVIVE
  if (existing?.id) {
    // si quieren vincular a user_id explícitamente, validar unique excluyendo este registro
    if (desiredUserId) {
      const chk = await ensureUserOrgUnique({
        supaSrv,
        orgId: ctx.org_id,
        desiredUserId,
        excludePersonalId: existing.id,
      });
      if (!chk.ok) {
        return json(res, 409, { ok: false, error: "Conflicto de vínculo", details: chk.details || chk.error?.message });
      }
    }

    const updateRow = {
      ...baseRow,
      owner_id: existing.owner_id || user.id,
      // ✅ NO forzar user.id aquí (evita violar personal_user_org_unique)
      ...(desiredUserId ? { user_id: desiredUserId } : {}),
      is_deleted: false,
      deleted_at: null,
    };

    const { data: updArr, error } = await supaSrv
      .from("personal")
      .update(updateRow)
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
    owner_id: user.id,      // quién lo creó
    user_id: desiredUserId, // ✅ normalmente NULL; solo si se vincula explícitamente
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
    if (req.method === "POST" && payload?.action === "toggle") {
      // ...existing code para obtener id, org_id, etc...
      // Obtener registro actual
      const { data: currentArr, error: currentErr } = await supaSrv
        .from("personal")
        .select("id, vigente, is_deleted")
        .eq("id", id)
        .eq("org_id", ctx.org_id)
        .maybeSingle();
      if (currentErr || !currentArr) {
        return json(res, 404, { ok: false, error: "Not found" });
      }
      const wasVigente = !!currentArr.vigente;
      const isDeleted = !!currentArr.is_deleted;
      const nextVigente = !wasVigente;

      // Enforce only on activation false -> true
      if (!wasVigente && nextVigente && !isDeleted) {
        const { planCode, maxMembers } = await getPersonalPlanLimit({
          supaSrv,
          orgId: ctx.org_id,
        });

        if (typeof maxMembers === "number") {
          const activeCount = await countActivePersonal({
            supaSrv,
            orgId: ctx.org_id,
          });

          if (activeCount >= maxMembers) {
            return json(res, 409, {
              ok: false,
              error: "Plan limit reached",
              details: {
                resource: "personal",
                plan_code: planCode,
                limit: maxMembers,
                current_active: activeCount,
              },
            });
          }
        }
      }

      const { data: updArr, error: updErr } = await supaSrv
        .from("personal")
        .update({ vigente: nextVigente, updated_at: nowIso })
        .eq("id", id)
        .eq("org_id", ctx.org_id)
        .select("*")
        .limit(1);

      if (updErr) {
        return json(res, 500, {
          ok: false,
          error: "No se pudo cambiar estado",
          details: updErr.message,
        });
      }

      return json(res, 200, {
        ok: true,
        item: (updArr || [])[0] || null,
        toggled: true,
      });
    }
    if (req.method === "POST") return await handlePost(req, res);

    res.setHeader("Allow", "GET,POST,OPTIONS");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/personal] fatal:", e);
    return json(res, 500, { ok: false, error: "Unexpected error", details: e?.message || String(e) });
  }
}
