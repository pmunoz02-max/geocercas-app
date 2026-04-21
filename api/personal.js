import { createClient } from "@supabase/supabase-js";

const VERSION = "personal-api-v31-clean-universal";

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
  res.setHeader("Vary", "Origin, Cookie, Authorization");
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

  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function normalizeOrgId(value) {
  if (typeof value === "string") {
    const v = value.trim();
    if (!v || v === "[object Object]") return null;
    return v;
  }

  if (value && typeof value === "object" && typeof value.id === "string") {
    const v = value.id.trim();
    if (!v || v === "[object Object]") return null;
    return v;
  }

  return null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function normEmail(v) {
  const s = String(v || "").trim().toLowerCase();
  return s || null;
}

function toE164(v) {
  const raw = String(v || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;

  return `+${digits}`;
}

function buildUserClient({ supabaseUrl, anonKey, accessToken }) {
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function buildServiceClient({ supabaseUrl, serviceRoleKey }) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/* =========================
   Context resolution
========================= */

async function findMembershipForOrg({ supaSrv, userId, orgId }) {
  if (!userId || !orgId) return null;

  let r = await supaSrv
    .from("memberships")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(2);

  if (!r.error && Array.isArray(r.data) && r.data.length) {
    return r.data[0];
  }

  r = await supaSrv
    .from("memberships")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(2);

  if (!r.error && Array.isArray(r.data) && r.data.length) {
    return r.data[0];
  }

  r = await supaSrv
    .from("memberships")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(2);

  if (!r.error && Array.isArray(r.data) && r.data.length) {
    return r.data[0];
  }

  return null;
}

async function findAnyMembership({ supaSrv, userId }) {
  if (!userId) return null;

  let r = await supaSrv
    .from("memberships")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(2);

  if (!r.error && Array.isArray(r.data) && r.data.length) {
    return r.data[0];
  }

  r = await supaSrv
    .from("memberships")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(2);

  if (!r.error && Array.isArray(r.data) && r.data.length) {
    return r.data[0];
  }

  r = await supaSrv
    .from("memberships")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(2);

  if (!r.error && Array.isArray(r.data) && r.data.length) {
    return r.data[0];
  }

  return null;
}

async function resolveContext(req, { requestedOrgId = null, body = {} } = {}) {
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

  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const cookieToken = getCookie(req, "tg_at") || "";
  const accessToken = bearer || cookieToken;

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Not authenticated",
      details: "Missing access token (Bearer or cookie)",
    };
  }

  const supaUser = buildUserClient({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    accessToken,
  });

  const { data: userData, error: userErr } = await supaUser.auth.getUser();

  if (userErr || !userData?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Invalid session",
      details: userErr?.message || "No user",
    };
  }

  const user = userData.user;
  const supaSrv = buildServiceClient({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  });

  let currentOrgId = null;

  try {
    const { data: uco, error: ucoErr } = await supaSrv
      .from("user_current_org")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ucoErr && uco?.org_id) currentOrgId = String(uco.org_id);
  } catch (e) {
    console.warn("[api/personal] user_current_org lookup warning", e?.message || e);
  }

  const explicitRequestedOrgId = normalizeOrgId(requestedOrgId);
  const queryOrgId = normalizeOrgId(req.query?.org_id || req.query?.orgId);
  const bodyOrgId = normalizeOrgId(body?.org_id || body?.orgId);

  let resolvedOrgId = null;

  if (isUuid(explicitRequestedOrgId)) {
    resolvedOrgId = explicitRequestedOrgId;
  } else if (isUuid(queryOrgId)) {
    resolvedOrgId = queryOrgId;
  } else if (isUuid(bodyOrgId)) {
    resolvedOrgId = bodyOrgId;
  } else if (isUuid(currentOrgId)) {
    resolvedOrgId = currentOrgId;
  }

  let membership = null;

  if (resolvedOrgId) {
    membership = await findMembershipForOrg({
      supaSrv,
      userId: user.id,
      orgId: resolvedOrgId,
    });
  }

  if (!membership) {
    membership = await findAnyMembership({
      supaSrv,
      userId: user.id,
    });
  }

  if (!membership?.org_id || !membership?.role) {
    return {
      ok: false,
      status: 403,
      error: "Missing org/role context",
      details: "No active membership found",
    };
  }

  return {
    ok: true,
    user,
    ctx: {
      org_id: String(membership.org_id),
      role: String(membership.role),
    },
    supaSrv,
  };
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
    .eq("org_id", orgId)
    .or(orClause)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(5);

  if (r.error) return { row: null, error: r.error };
  if (Array.isArray(r.data) && r.data.length) return { row: r.data[0], error: null };

  return { row: null, error: null };
}

async function ensureUserOrgUnique({ supaSrv, orgId, desiredUserId, excludePersonalId }) {
  if (!desiredUserId) return { ok: true };

  const { data, error } = await supaSrv
    .from("personal")
    .select("id,user_id,email,is_deleted")
    .eq("org_id", orgId)
    .eq("user_id", desiredUserId)
    .limit(1);

  if (error) return { ok: false, error };

  const row = Array.isArray(data) && data.length ? data[0] : null;
  if (!row) return { ok: true };

  if (excludePersonalId && String(row.id) === String(excludePersonalId)) {
    return { ok: true };
  }

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

/* =========================
   Handlers
========================= */

async function handleList(req, res) {
  // Nueva lógica: aceptar org_id desde query, validar, loggear y devolver 400 si falta
  const orgId =
    (typeof req.query?.org_id === "string" && req.query.org_id.trim()) ||
    (typeof req.query?.orgId === "string" && req.query.orgId.trim()) ||
    (typeof ctxRes?.ctx?.org_id === "string" && ctxRes.ctx.org_id.trim()) ||
    null;

  console.log("[PERSONAL GET] query.org_id =", req.query?.org_id);
  console.log("[PERSONAL GET] ctx.org_id =", ctxRes?.ctx?.org_id);
  console.log("[PERSONAL GET] resolved orgId =", orgId);

  if (!orgId) {
    return json(res, 400, { ok: false, error: "Missing org_id" });
  }

  const { ctx, supaSrv } = ctxRes;

  const { data, error } = await supaSrv
    .from("personal")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return json(res, 500, {
      ok: false,
      error: "Could not list personnel",
      details: error.message,
    });
  }

  return json(res, 200, {
    ok: true,
    items: Array.isArray(data) ? data : [],
    version: "personal-api-v31-clean-universal",
  });
}

async function handlePost(req, res) {
  const payload = await readBody(req);

  const ctxRes = await resolveContext(req, {
    requestedOrgId: normalizeOrgId(payload.org_id || payload.orgId),
    body: payload,
  });

  if (!ctxRes.ok) {
    return json(res, ctxRes.status, {
      ok: false,
      error: ctxRes.error,
      details: ctxRes.details,
    });
  }

  const { ctx, user, supaSrv } = ctxRes;

  if (!requireWriteRole(ctx.role)) {
    return json(res, 403, {
      ok: false,
      error: "Sin permisos",
      details: "Requiere rol admin u owner",
    });
  }

  const nowIso = new Date().toISOString();
  const action = String(payload.action || "").toLowerCase();
  const id = payload.id ? String(payload.id) : null;

  if (action === "toggle") {
    if (!id) return json(res, 400, { ok: false, error: "Falta id" });

    const { data: curArr, error: curErr } = await supaSrv
      .from("personal")
      .select("id, vigente, is_deleted")
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .limit(1);

    if (curErr) {
      return json(res, 500, {
        ok: false,
        error: "No se pudo leer registro",
        details: curErr.message,
      });
    }

    const cur = Array.isArray(curArr) && curArr.length ? curArr[0] : null;
    if (!cur || cur.is_deleted) {
      return json(res, 404, { ok: false, error: "No encontrado" });
    }

    const nextVigente = !cur.vigente;

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

  if (action === "delete") {
    if (!id) return json(res, 400, { ok: false, error: "Falta id" });

    const { data: delArr, error: delErr } = await supaSrv
      .from("personal")
      .update({
        is_deleted: true,
        deleted_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("org_id", ctx.org_id)
      .select("*")
      .limit(1);

    if (delErr) {
      return json(res, 500, {
        ok: false,
        error: "No se pudo eliminar",
        details: delErr.message,
      });
    }

    const del = Array.isArray(delArr) && delArr.length ? delArr[0] : null;
    if (!del) return json(res, 404, { ok: false, error: "No encontrado" });

    return json(res, 200, { ok: true, item: del, deleted: true });
  }

  const nombre = String(payload.nombre || "").trim();
    // Log org_id para debug POST
    console.log("[api/personal] POST org_id:", ctx.org_id);

    if (!ctx.org_id) {
      return json(res, 400, {
        ok: false,
        error: "Missing org_id in context",
      });
    }
  const apellido = String(payload.apellido || "").trim();
  const emailNorm = normEmail(payload.email);
  const documento = String(payload.documento || "").trim() || null;
  const telefonoRaw = String(payload.telefono || "").trim();
  const telefonoE164 = toE164(telefonoRaw);

  if (!nombre) return json(res, 400, { ok: false, error: "Nombre es obligatorio" });
  if (!emailNorm) return json(res, 400, { ok: false, error: "Email es obligatorio" });

  const vigente = payload.vigente === undefined ? true : !!payload.vigente;

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

  const desiredUserId = isUuid(payload.user_id) ? String(payload.user_id) : null;

  const { row: existing, error: findErr } = await findExistingByEmail({
    supaSrv,
    orgId: ctx.org_id,
    emailNorm,
  });

  console.log("[api/personal] existing by email", {
    orgId: ctx.org_id,
    emailNorm,
    hasExisting: Boolean(existing?.id),
    existingId: existing?.id || null,
    existingDeleted: existing?.is_deleted ?? null,
  });

  if (findErr) {
    return json(res, 500, {
      ok: false,
      error: "No se pudo validar duplicado",
      details: findErr.message,
    });
  }

  if (existing?.id) {
    if (desiredUserId) {
      const chk = await ensureUserOrgUnique({
        supaSrv,
        orgId: ctx.org_id,
        desiredUserId,
        excludePersonalId: existing.id,
      });

      if (!chk.ok) {
        return json(res, 409, {
          ok: false,
          error: "Conflicto de vínculo",
          details: chk.details || chk.error?.message,
        });
      }
    }

    console.log("[api/personal] branch", {
      type: "update_or_revive",
      orgId: ctx.org_id,
      emailNorm,
      existingId: existing.id,
    });

    const updateRow = {
      ...baseRow,
      owner_id: existing.owner_id || user.id,
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

    if (error) {
      return json(res, 500, {
        ok: false,
        error: "No se pudo actualizar personal",
        details: error.message,
      });
    }

    return json(res, 200, {
      ok: true,
      item: (updArr || [])[0] || null,
      revived: true,
    });
  }

  // Anti-seat-cycling deshabilitado en preview.
  // Se reemplazará por control de cupos activos por plan.

  const insertRow = {
      // Debug temporal: log org_id antes del insert
      console.log("[PERSONAL CREATE] org_id:", ctx.org_id);
    ...baseRow,
    org_id: ctx.org_id,
    owner_id: user.id,
    user_id: desiredUserId,
    created_at: nowIso,
    is_deleted: false,
    position_interval_sec: 300,
  };

  const { data: insArr, error } = await supaSrv
    .from("personal")
    .insert({
      ...insertRow,
      vigente: baseRow.vigente !== false,
    })
    .select("*")
    .limit(1);

  if (error) {
    if (error.code === "23505") {
      return json(res, 409, {
        ok: false,
        error: "Personal ya existe (email o teléfono duplicado)",
        details: error.message,
      });
    }
    return json(res, 500, {
      ok: false,
      error: "No se pudo crear personal",
      details: error.message,
    });
  }

  return json(res, 200, {
    ok: true,
    item: (insArr || [])[0] || null,
    created: true,
  });
}

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, apikey, x-client-info"
    );
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
    return json(res, 500, {
      ok: false,
      error: "Unexpected error",
      details: e?.message || String(e),
    });
  }
}