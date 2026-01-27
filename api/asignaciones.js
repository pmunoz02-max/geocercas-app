// api/asignaciones.js
// ============================================================
// TENANT-SAFE Asignaciones API (CANONICAL)
// - cookie HttpOnly tg_at
// - bootstrap_session_context() devuelve org_id/role
// - tenant_id se deriva SIEMPRE de org_id (tenant==org en tu BD actual)
// - Activities via RPC activities_list
// - Geocercas via RPC list_geocercas_for_assign
// ============================================================

import { createClient } from "@supabase/supabase-js";

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
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
  return ctxObj && typeof ctxObj === "object" ? ctxObj : null;
}

function pickOrgId(ctx) {
  return (
    ctx?.current_org_id ??
    ctx?.currentOrgId ??
    ctx?.org_id ??
    ctx?.orgId ??
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

async function readJson(req) {
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

  const { data: ctxRaw, error: ctxErr } = await supabase.rpc("bootstrap_session_context");
  if (ctxErr) return { ok: false, status: 401, error: ctxErr.message || "ctx rpc error" };

  const ctx = normalizeCtx(ctxRaw);
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
      id: g.id ?? g.geocerca_id ?? g.fence_id ?? null,
      nombre: g.nombre ?? g.name ?? g.label ?? null,
    }))
    .filter((g) => g.id);
}

async function loadCatalogs(supabase) {
  // Personal: por org (fuente)
  const { data: personal, error: pErr } = await supabase
    .from("personal")
    .select("id,nombre,apellido,email,org_id,is_deleted")
    .eq("is_deleted", false)
    .order("nombre", { ascending: true });

  // Geocercas: RPC tenant-safe
  // ✅ CANÓNICO: geocercas por contexto DB
let geocercas = [];
{
  const { data, error } = await supabase.rpc("get_geocercas_for_current_org");
  if (error) {
    console.error("[asignaciones] geocercas rpc error:", error);
  } else {
    geocercas = normalizeGeocercas(data);
  }
}
  // Activities: RPC tenant-safe
  let activities = [];
  {
    const { data, error } = await supabase.rpc("activities_list", {
      p_include_inactive: false,
    });
    if (!error && Array.isArray(data)) {
      activities = data.map((a) => ({ id: a.id, name: a.name }));
    }
  }

  // Alias compat
  const people = (personal || []).map((p) => ({
    org_people_id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    email: p.email,
  }));

  return { personal: pErr ? [] : (personal || []), geocercas, activities, people };
}

export default async function handler(req, res) {
  try {
    const ctxRes = await getContextOr401(req);
    if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error });

    const { supabase, orgId, tenantId } = ctxRes;

    if (req.method === "GET") {
      let q = supabase
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

      const { data: asignaciones, error } = await q;
      if (error) return json(res, 500, { ok: false, error: error.message });

      const catalogs = await loadCatalogs(supabase);
      return json(res, 200, { ok: true, data: { asignaciones: asignaciones || [], catalogs } });
    }

    if (req.method === "POST") {
      const body = (await readJson(req)) || {};

      if (!body.personal_id) return json(res, 400, { ok: false, error: "personal_id is required" });
      if (!body.geocerca_id) return json(res, 400, { ok: false, error: "geocerca_id is required" });
      if (!body.activity_id) return json(res, 400, { ok: false, error: "activity_id is required" });

      // ✅ UNIVERSAL: siempre forzar org+tenant desde backend
      const payload = {
        ...body,
        org_id: orgId,
        tenant_id: tenantId, // <- clave para no romper asignaciones_tenant_fk
      };

      const { data, error } = await supabase
        .from("asignaciones")
        .insert(payload)
        .select("*")
        .single();

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    if (req.method === "PATCH") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      const patch = body.patch;

      if (!id || !patch) return json(res, 400, { ok: false, error: "missing id/patch" });

      const safe = { ...patch };
      // Nunca permitir override desde cliente
      delete safe.org_id;
      delete safe.tenant_id;

      let q = supabase
        .from("asignaciones")
        .update(safe)
        .eq("id", id)
        .eq("org_id", orgId);

      const { data, error } = await q.select("*").single();
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    if (req.method === "DELETE") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      if (!id) return json(res, 400, { ok: false, error: "missing id" });

      const { error } = await supabase
        .from("asignaciones")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId);

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: "method not allowed" });
  } catch (e) {
    console.error("[api/asignaciones] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "fatal" });
  }
}
