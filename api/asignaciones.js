// api/asignaciones.js
// ============================================================
// TENANT-SAFE Asignaciones API (CANONICAL) - CommonJS safe
// - cookie HttpOnly tg_at
// - bootstrap_session_context() devuelve org_id/role
// - tenant_id se deriva SIEMPRE de org_id (tenant==org en tu BD actual)
// - Activities via RPC activities_list
// - Geocercas via RPC get_geocercas_for_current_org
// ============================================================

const { createClient } = require("@supabase/supabase-js");

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
    } catch (_) {
      out[k] = v;
    }
  });
  return out;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function normalizeCtx(ctxRaw) {
  const ctxObj = Array.isArray(ctxRaw) ? ctxRaw[0] : ctxRaw;
  return (ctxObj && typeof ctxObj === "object") ? ctxObj : null;
}

function pickOrgId(ctx) {
  return (
    (ctx && (ctx.current_org_id || ctx.currentOrgId || ctx.org_id || ctx.orgId)) ||
    null
  );
}

function supabaseForToken(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
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
  });
}

async function getContextOr401(req) {
  const cookies = parseCookies(req);
  const token = cookies.tg_at || null;
  if (!token) return { ok: false, status: 401, error: "missing tg_at cookie" };

  const supabase = supabaseForToken(token);

  const ctxResp = await supabase.rpc("bootstrap_session_context");
  if (ctxResp.error) return { ok: false, status: 401, error: ctxResp.error.message || "ctx rpc error" };

  const ctx = normalizeCtx(ctxResp.data);
  if (!ctx) return { ok: false, status: 401, error: "invalid ctx" };

  const orgId = pickOrgId(ctx);
  if (!orgId) return { ok: false, status: 401, error: "ctx missing org_id" };

  // ✅ UNIVERSAL: en tu modelo actual tenant == org
  const tenantId = orgId;

  return { ok: true, supabase, orgId, tenantId };
}

function normalizeGeocercas(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((g) => ({
      id: (g && (g.id || g.geocerca_id || g.fence_id)) || null,
      nombre: (g && (g.nombre || g.name || g.label)) || null,
    }))
    .filter((g) => g && g.id);
}

async function loadCatalogs(supabase) {
  // Personal: por org (RLS/ctx se encarga)
  const pResp = await supabase
    .from("personal")
    .select("id,nombre,apellido,email,org_id,is_deleted")
    .eq("is_deleted", false)
    .order("nombre", { ascending: true });

  // Geocercas: RPC CANÓNICO
  let geocercas = [];
  const gResp = await supabase.rpc("get_geocercas_for_current_org");
  if (gResp.error) {
    console.error("[api/asignaciones] geocercas rpc error:", gResp.error);
  } else {
    geocercas = normalizeGeocercas(gResp.data);
  }

  // Activities: RPC tenant-safe
  let activities = [];
  const aResp = await supabase.rpc("activities_list", { p_include_inactive: false });
  if (!aResp.error && Array.isArray(aResp.data)) {
    activities = aResp.data.map((a) => ({ id: a.id, name: a.name }));
  } else if (aResp.error) {
    console.error("[api/asignaciones] activities_list rpc error:", aResp.error);
  }

  const personal = pResp.error ? [] : (pResp.data || []);

  // Alias compat
  const people = personal.map((p) => ({
    org_people_id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    email: p.email,
  }));

  return { personal, geocercas, activities, people };
}

module.exports = async function handler(req, res) {
  try {
    const ctxRes = await getContextOr401(req);
    if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error });

    const supabase = ctxRes.supabase;
    const orgId = ctxRes.orgId;
    const tenantId = ctxRes.tenantId;

    if (req.method === "GET") {
      const q = supabase
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
          geocerca:geocerca_id ( id, nombre ),
          activity:activity_id ( id, name )
        `
        )
        .eq("is_deleted", false)
        .eq("org_id", orgId)
        .order("start_time", { ascending: true });

      const resp = await q;
      if (resp.error) return json(res, 500, { ok: false, error: resp.error.message });

      const catalogs = await loadCatalogs(supabase);
      return json(res, 200, { ok: true, data: { asignaciones: resp.data || [], catalogs } });
    }

    if (req.method === "POST") {
      const body = (await readJson(req)) || {};

      if (!body.personal_id) return json(res, 400, { ok: false, error: "personal_id is required" });
      if (!body.geocerca_id) return json(res, 400, { ok: false, error: "geocerca_id is required" });
      if (!body.activity_id) return json(res, 400, { ok: false, error: "activity_id is required" });

      const payload = Object.assign({}, body, {
        org_id: orgId,
        tenant_id: tenantId,
      });

      const ins = await supabase.from("asignaciones").insert(payload).select("*").single();
      if (ins.error) return json(res, 400, { ok: false, error: ins.error.message });
      return json(res, 200, { ok: true, data: ins.data });
    }

    if (req.method === "PATCH") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      const patch = body.patch;

      if (!id || !patch) return json(res, 400, { ok: false, error: "missing id/patch" });

      const safe = Object.assign({}, patch);
      delete safe.org_id;
      delete safe.tenant_id;

      const up = await supabase.from("asignaciones").update(safe).eq("id", id).eq("org_id", orgId).select("*").single();
      if (up.error) return json(res, 400, { ok: false, error: up.error.message });
      return json(res, 200, { ok: true, data: up.data });
    }

    if (req.method === "DELETE") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      if (!id) return json(res, 400, { ok: false, error: "missing id" });

      const del = await supabase
        .from("asignaciones")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId);

      if (del.error) return json(res, 400, { ok: false, error: del.error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: "method not allowed" });
  } catch (e) {
    console.error("[api/asignaciones] fatal:", e);
    return json(res, 500, { ok: false, error: (e && e.message) ? e.message : "fatal" });
  }
};
