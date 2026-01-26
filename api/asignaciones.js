// api/asignaciones.js
// DEFINITIVO: Asignaciones usa catalogo "personal" y guarda personal_id
// - cookie HttpOnly tg_at
// - contexto via public.bootstrap_session_context()
// - normaliza array vs objeto
// - filtra por org_id (fallback tenant_id)
// - devuelve: asignaciones + catalogs { personal, geocercas, activities, people(alias) }

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
  res.end(JSON.stringify(body));
}

function normalizeCtx(ctxRaw) {
  const ctxObj = Array.isArray(ctxRaw) ? ctxRaw[0] : ctxRaw;
  return ctxObj && typeof ctxObj === "object" ? ctxObj : null;
}

function pickTenantId(ctx) {
  return (
    ctx?.tenant_id ??
    ctx?.tenantId ??
    ctx?.org_tenant_id ??
    ctx?.orgTenantId ??
    null
  );
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

  const tenantId = pickTenantId(ctx);
  const orgId = pickOrgId(ctx);

  if (!orgId && !tenantId) return { ok: false, status: 401, error: "ctx missing org/tenant" };

  return { ok: true, supabase, tenantId, orgId };
}

async function loadCatalogs(supabase, { orgId, tenantId }) {
  // ✅ Personal (mismo catálogo que PersonalPage)
  let personal = [];
  {
    let q = supabase
      .from("personal")
      .select("id,nombre,apellido,email,org_id,is_deleted")
      .eq("is_deleted", false)
      .order("nombre", { ascending: true });

    if (orgId) q = q.eq("org_id", orgId);
    else q = q.eq("tenant_id", tenantId); // legacy por si existiera

    const r = await q;
    if (!r.error) personal = r.data || [];
  }

  // Geocercas
  let geocercas = [];
  {
    let q = supabase
      .from("geocercas")
      .select("id,nombre,org_id")
      .order("nombre", { ascending: true });

    if (orgId) q = q.eq("org_id", orgId);
    else q = q.eq("tenant_id", tenantId);

    const r = await q;
    if (!r.error) geocercas = r.data || [];
  }

  // Activities (org_id -> fallback legacy)
  let activities = [];
  {
   let activities = [];
{
  const { data, error } = await supabase.rpc("activities_list", {
    p_include_inactive: false,
  });

  if (!error && Array.isArray(data)) {
    activities = data.map((a) => ({
      id: a.id,
      name: a.name,
    }));
  }
}

  // Alias de compatibilidad para UIs viejas
  const people = personal.map((p) => ({
    org_people_id: p.id, // alias para selects viejos (usa el id de personal)
    nombre: p.nombre,
    apellido: p.apellido,
    email: p.email,
  }));

  return { personal, geocercas, activities, people };
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
          org_people_id,
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
        .order("start_time", { ascending: true });

      if (orgId) q = q.eq("org_id", orgId);
      else q = q.eq("tenant_id", tenantId);

      const { data: asignaciones, error } = await q;
      if (error) return json(res, 500, { ok: false, error: error.message });

      const catalogs = await loadCatalogs(supabase, { orgId, tenantId });

      return json(res, 200, { ok: true, data: { asignaciones: asignaciones || [], catalogs } });
    }

    if (req.method === "POST") {
      const body = (await readJson(req)) || {};

      // Forzar contexto
      const payload = {
        ...body,
        org_id: orgId ?? null,
        tenant_id: tenantId ?? body.tenant_id ?? null,
      };

      // ✅ Canon: personal_id obligatorio
      if (!payload.personal_id) {
        return json(res, 400, { ok: false, error: "personal_id is required" });
      }

      // Nunca confiar en org_people_id desde cliente
      delete payload.org_people_id;

      const { data, error } = await supabase.from("asignaciones").insert(payload).select("*").single();
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    if (req.method === "PATCH") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      const patch = body.patch;

      if (!id || !patch) return json(res, 400, { ok: false, error: "missing id/patch" });

      const safe = { ...patch };
      delete safe.org_id;
      delete safe.tenant_id;

      // Si estás migrando: permitimos actualizar personal_id
      delete safe.org_people_id;

      let q = supabase.from("asignaciones").update(safe).eq("id", id);
      if (orgId) q = q.eq("org_id", orgId);
      else q = q.eq("tenant_id", tenantId);

      const { data, error } = await q.select("*").single();
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    if (req.method === "DELETE") {
      const body = (await readJson(req)) || {};
      const id = body.id;
      if (!id) return json(res, 400, { ok: false, error: "missing id" });

      let q = supabase
        .from("asignaciones")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", id);

      if (orgId) q = q.eq("org_id", orgId);
      else q = q.eq("tenant_id", tenantId);

      const { error } = await q;
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: "method not allowed" });
  } catch (e) {
    console.error("[api/asignaciones] fatal:", e);
    return json(res, 500, { ok: false, error: e?.message || "fatal" });
  }
}
