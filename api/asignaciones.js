// api/asignaciones.js
// ============================================================
// TENANT-SAFE Asignaciones API (CANONICAL) — Feb 2026
// ✅ NO depende de bootstrap_session_context()
// ✅ Resuelve org actual desde public.memberships (revoked_at IS NULL)
// ✅ Auth universal: Bearer token (preferido) o cookie tg_at (legacy)
// ✅ Valida membership con resolveOrgAndMembership() (service role)
// ✅ activities valida por tenant_id (NOT NULL) — tenant==org en tu arquitectura
// ✅ Catalogs resilientes para UI
//
// NOTAS:
// - La relación FK usada en select (geocerca:geocerca_id ...) se mantiene tal cual,
//   para no romper el join que ya tienes en Supabase.
// - ensureGeocercaInOrg intenta validar en geofences y cae a geocercas si aplica.
//
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { resolveOrgAndMembership } from "../src/server/lib/resolveOrg.js";

export const config = { runtime: "nodejs" };

// ---------------- helpers ----------------
function parseCookies(req) {
  const header = (req && req.headers && req.headers.cookie) ? req.headers.cookie : "";
  const out = {};
  header.split(";").forEach((part) => {
    const trimmed = String(part || "").trim();
    if (!trimmed) return;
    const pieces = trimmed.split("=");
    const k = pieces.shift();
    if (!k) return;
    const v = pieces.join("=") || "";
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

function getBearerToken(req) {
  const h = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  if (!h) return "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

function getAccessToken(req) {
  const bearer = getBearerToken(req);
  if (bearer) return bearer;
  const cookies = parseCookies(req);
  return cookies.tg_at || "";
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("vary", "Cookie, Authorization, x-org-id");
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (!body) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function normalizeGeocercas(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((g) => ({
      id: (g && (g.id || g.geocerca_id || g.fence_id)) || null,
      nombre: (g && (g.nombre || g.name || g.label)) || null,
      name: (g && g.name) || null,
    }))
    .filter((g) => g && g.id);
}

function toInt(v) {
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.floor(n);
}

function enrichAsignacionRow(row) {
  if (!row || typeof row !== "object") return row;

  const geocercaNombre =
    (row.geocerca && (row.geocerca.nombre || row.geocerca.name)) ||
    row.geocerca_nombre ||
    row.geocerca_name ||
    null;

  const activityName =
    (row.activity && (row.activity.name || row.activity.nombre)) ||
    row.activity_name ||
    row.activity_nombre ||
    null;

  const statusFinal = row.status || row.estado || null;

  const sec = row.frecuencia_envio_sec;
  const secInt = typeof sec === "number" ? sec : toInt(sec);
  const freqMin = secInt != null ? Math.max(1, Math.round(secInt / 60)) : null;

  return {
    ...row,
    geocerca_nombre: geocercaNombre,
    activity_name: activityName,
    status_final: statusFinal,
    frecuencia_envio_min: freqMin,
  };
}

// ---------------- membership context (UNIVERSAL) ----------------
async function getContextOr401(req) {
  const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const SUPABASE_ANON_KEY = getEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: "Missing SUPABASE env vars" };
  }

  const token = getAccessToken(req);
  if (!token) return { ok: false, status: 401, error: "Missing authentication (no Bearer, no tg_at cookie)" };

  // admin: validar user + memberships
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const user = userData?.user || null;
  if (userErr || !user?.id) return { ok: false, status: 401, error: "Invalid user" };

  const requestedOrgId = req.headers["x-org-id"] ? String(req.headers["x-org-id"]) : "";
  const membership = await resolveOrgAndMembership(admin, user.id, requestedOrgId);

  if (!membership?.org_id) {
    return { ok: false, status: 403, error: "User not member of organization" };
  }

  const orgId = membership.org_id;
  const tenantId = orgId; // tenant==org

  // user client (RLS): para leer/escribir asignaciones con policies
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return { ok: true, supabase, admin, orgId, tenantId, userId: user.id };
}

// ---------------- catalogs ----------------
async function loadCatalogs(supabase, orgId, tenantId) {
  // Personal por org (filtro explícito)
  const pResp = await supabase
    .from("personal")
    .select("id,nombre,apellido,email,org_id,is_deleted")
    .eq("org_id", orgId)
    .eq("is_deleted", false)
    .order("nombre", { ascending: true });

  // Geocercas: preferimos RPC canónica; fallback a geofences list por org
  let geocercas = [];
  const gResp = await supabase.rpc("get_geocercas_for_current_org");
  if (gResp.error) {
    // fallback seguro: geofences por org (si existe y RLS permite)
    const gf = await supabase.from("geofences").select("id,name").eq("org_id", orgId).order("created_at", { ascending: false });
    if (!gf.error) geocercas = normalizeGeocercas((gf.data || []).map((x) => ({ id: x.id, nombre: x.name, name: x.name })));
  } else {
    geocercas = normalizeGeocercas(gResp.data);
  }

  // Activities por tenant (NOT NULL)
  const aResp = await supabase
    .from("activities")
    .select("id,name,tenant_id,active")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name", { ascending: true });

  const activities = aResp.error ? [] : (aResp.data || []).map((a) => ({ id: a.id, name: a.name }));
  const personal = pResp.error ? [] : (pResp.data || []);

  // Compat legacy: people[]
  const people = personal.map((p) => ({
    org_people_id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    email: p.email,
    org_id: p.org_id || null,
  }));

  return { personal, geocercas, activities, people };
}

// ---------------- cross-org validation ----------------
async function ensureGeocercaInOrg({ supabase, orgId, geocercaId }) {
  // 1) Prefer geofences (nuevo canonical)
  {
    const q = await supabase
      .from("geofences")
      .select("id,org_id,name")
      .eq("id", geocercaId)
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();

    if (!q.error && q.data) return { ok: true };

    // Si la tabla no existe o RLS no deja leer, seguimos a fallback legacy
  }

  // 2) Fallback legacy geocercas (si existe en tu schema)
  const q2 = await supabase
    .from("geocercas")
    .select("id,org_id,name,nombre")
    .eq("id", geocercaId)
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();

  if (q2.error) return { ok: false, error: q2.error.message };
  if (!q2.data) return { ok: false, error: "geocerca_id no pertenece a la org actual" };
  return { ok: true };
}

async function ensureActivityInTenant(supabase, tenantId, activityId) {
  const q = await supabase
    .from("activities")
    .select("id,tenant_id,name,active")
    .eq("id", activityId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (q.error) return { ok: false, error: q.error.message };
  if (!q.data) return { ok: false, error: "activity_id no pertenece a la org actual" };
  return { ok: true };
}

// ---------------- handler ----------------
export default async function handler(req, res) {
  const build_tag = "asignaciones-v2026-02-memberships";

  try {
    const ctxRes = await getContextOr401(req);
    if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, build_tag, error: ctxRes.error });

    const supabase = ctxRes.supabase;
    const orgId = ctxRes.orgId;
    const tenantId = ctxRes.tenantId;

    // =========================
    // GET: bundle asignaciones + catalogs
    // =========================
    if (req.method === "GET") {
      const resp = await supabase
        .from("asignaciones")
        .select(
          `
          id,
          org_id,
          tenant_id,
          personal_id,
          geocerca_id,
          activity_id,
          start_time,
          end_time,
          estado,
          status,
          frecuencia_envio_sec,
          is_deleted,
          created_at,
          personal:personal_id ( id, nombre, apellido, email ),
          geocerca:geocerca_id ( id, nombre, name ),
          activity:activity_id ( id, name )
        `
        )
        .eq("is_deleted", false)
        .eq("org_id", orgId)
        .order("start_time", { ascending: true });

      if (resp.error) return json(res, 500, { ok: false, build_tag, error: resp.error.message });

      const rows = Array.isArray(resp.data) ? resp.data : [];
      const enriched = rows.map(enrichAsignacionRow);

      const catalogs = await loadCatalogs(supabase, orgId, tenantId);
      return json(res, 200, { ok: true, build_tag, data: { asignaciones: enriched, catalogs } });
    }

    // =========================
    // POST: crear asignacion
    // =========================
    if (req.method === "POST") {
      const body = (await readJson(req)) || {};

      if (!body.personal_id) return json(res, 400, { ok: false, build_tag, error: "personal_id is required" });
      if (!body.geocerca_id) return json(res, 400, { ok: false, build_tag, error: "geocerca_id is required" });
      if (!body.activity_id) return json(res, 400, { ok: false, build_tag, error: "activity_id is required" });

      const okG = await ensureGeocercaInOrg({ supabase, orgId, geocercaId: body.geocerca_id });
      if (!okG.ok) return json(res, 400, { ok: false, build_tag, error: okG.error });

      const okA = await ensureActivityInTenant(supabase, tenantId, body.activity_id);
      if (!okA.ok) return json(res, 400, { ok: false, build_tag, error: okA.error });

      // Blindaje: org_id / tenant_id siempre del server
      const payload = { ...body, org_id: orgId, tenant_id: tenantId };
      delete payload.orgId;
      delete payload.tenantId;

      const ins = await supabase
        .from("asignaciones")
        .insert(payload)
        .select(
          `
          id,
          org_id,
          tenant_id,
          personal_id,
          geocerca_id,
          activity_id,
          start_time,
          end_time,
          estado,
          status,
          frecuencia_envio_sec,
          is_deleted,
          created_at,
          personal:personal_id ( id, nombre, apellido, email ),
          geocerca:geocerca_id ( id, nombre, name ),
          activity:activity_id ( id, name )
        `
        )
        .single();

      if (ins.error) return json(res, 400, { ok: false, build_tag, error: ins.error.message });

      return json(res, 200, { ok: true, build_tag, data: enrichAsignacionRow(ins.data) });
    }

    // =========================
    // PATCH: actualizar asignacion
    // =========================
    if (req.method === "PATCH") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      const patch = body.patch;

      if (!id || !patch) return json(res, 400, { ok: false, build_tag, error: "missing id/patch" });

      const safe = { ...patch };
      delete safe.org_id;
      delete safe.tenant_id;
      delete safe.orgId;
      delete safe.tenantId;

      if (safe.geocerca_id) {
        const okG = await ensureGeocercaInOrg({ supabase, orgId, geocercaId: safe.geocerca_id });
        if (!okG.ok) return json(res, 400, { ok: false, build_tag, error: okG.error });
      }
      if (safe.activity_id) {
        const okA = await ensureActivityInTenant(supabase, tenantId, safe.activity_id);
        if (!okA.ok) return json(res, 400, { ok: false, build_tag, error: okA.error });
      }

      const up = await supabase
        .from("asignaciones")
        .update(safe)
        .eq("id", id)
        .eq("org_id", orgId)
        .select(
          `
          id,
          org_id,
          tenant_id,
          personal_id,
          geocerca_id,
          activity_id,
          start_time,
          end_time,
          estado,
          status,
          frecuencia_envio_sec,
          is_deleted,
          created_at,
          personal:personal_id ( id, nombre, apellido, email ),
          geocerca:geocerca_id ( id, nombre, name ),
          activity:activity_id ( id, name )
        `
        )
        .single();

      if (up.error) return json(res, 400, { ok: false, build_tag, error: up.error.message });

      return json(res, 200, { ok: true, build_tag, data: enrichAsignacionRow(up.data) });
    }

    // =========================
    // DELETE: soft-delete
    // =========================
    if (req.method === "DELETE") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      if (!id) return json(res, 400, { ok: false, build_tag, error: "missing id" });

      const del = await supabase
        .from("asignaciones")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId);

      if (del.error) return json(res, 400, { ok: false, build_tag, error: del.error.message });

      return json(res, 200, { ok: true, build_tag });
    }

    return json(res, 405, { ok: false, build_tag, error: "method not allowed" });
  } catch (e) {
    console.error("[api/asignaciones] fatal:", e);
    return json(res, 500, { ok: false, build_tag: "asignaciones-v2026-02-memberships", error: e?.message || "fatal" });
  }
}
