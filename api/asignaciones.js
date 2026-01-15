// api/asignaciones.js
// ENDPOINT CANONICO (TWA/WebView safe)
// - Lee cookie HttpOnly tg_at
// - Resuelve contexto SOLO en backend via RPC public.bootstrap_session_context()
// - Normaliza array vs objeto
// - NO requiere org_id desde frontend
// - Devuelve: asignaciones + catalogos (people/geocercas/activities)

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

  if (!url || !anon) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
  }

  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

async function getContextOr401(req) {
  const cookies = parseCookies(req);
  const token = cookies.tg_at || null;
  if (!token) return { ok: false, status: 401, error: "missing tg_at cookie" };

  const supabase = supabaseForToken(token);

  const { data: ctxRaw, error: ctxErr } = await supabase.rpc(
    "bootstrap_session_context"
  );

  if (ctxErr) {
    return { ok: false, status: 401, error: ctxErr.message || "ctx rpc error" };
  }

  const ctx = normalizeCtx(ctxRaw);
  if (!ctx) return { ok: false, status: 401, error: "invalid ctx" };

  const tenantId = pickTenantId(ctx);
  const orgId = pickOrgId(ctx);

  if (!orgId && !tenantId) {
    return { ok: false, status: 401, error: "ctx missing org/tenant" };
  }

  return { ok: true, supabase, ctx, tenantId, orgId };
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

async function loadCatalogs(supabase, { orgId, tenantId }) {
  // People options (mantener compatibilidad con tu UI actual)
  // Preferido: v_org_people_ui (como el frontend legacy)
  let people = [];
  {
    const q = await supabase
      .from("v_org_people_ui")
      .select("org_people_id, nombre, apellido, is_deleted, org_id")
      .eq("is_deleted", false)
      .eq("org_id", orgId);

    if (!q.error) people = q.data || [];
    // Si la vista no existe en algún entorno, no rompemos:
    // people queda [] y la UI mostrará mensaje correspondiente.
  }

  // Geocercas
  let geocercas = [];
  {
    let q = supabase.from("geocercas").select("id,nombre,org_id").order("nombre", {
      ascending: true,
    });

    if (orgId) q = q.eq("org_id", orgId);
    else q = q.eq("tenant_id", tenantId);

    const r = await q;
    if (!r.error) geocercas = r.data || [];
  }

  // Activities (fallback: org_id -> tenant_id, igual que tu legacy)
  let activities = [];
  {
    let r1 = await supabase
      .from("activities")
      .select("id,name,org_id")
      .eq("org_id", orgId)
      .order("name", { ascending: true });

    if (!r1.error && Array.isArray(r1.data) && r1.data.length > 0) {
      activities = r1.data;
    } else {
      let r2 = await supabase
        .from("activities")
        .select("id,name,tenant_id")
        .eq("tenant_id", orgId) // legacy: algunos datos guardaron tenant_id = org_id
        .order("name", { ascending: true });

      if (!r2.error) activities = r2.data || [];
    }
  }

  return { people, geocercas, activities };
}

export default async function handler(req, res) {
  try {
    const ctxRes = await getContextOr401(req);
    if (!ctxRes.ok) {
      return json(res, ctxRes.status, {
        ok: false,
        error: ctxRes.error,
      });
    }

    const { supabase, orgId, tenantId } = ctxRes;

    // ---- GET: bundle (asignaciones + catalogos)
    if (req.method === "GET") {
      const asignQ = await supabase
        .from("asignaciones")
        .select(
          `
          id,
          org_id,
          tenant_id,
          org_people_id,
          personal_id,
          geocerca_id,
          activity_id,
          start_time,
          end_time,
          estado,
          status,
          frecuencia_envio_sec,
          is_deleted,
          created_at
        `
        )
        .eq("is_deleted", false)
        .order("start_time", { ascending: true });

      // filtro estricto preferido por org_id, fallback tenant_id
      // (si ambos existen, org_id manda)
      if (orgId) asignQ.eq?.("org_id", orgId); // compat: supabase v2 tiene encadenamiento
      // Si tu client no soporta chaining por el "await" anterior, usamos patrón seguro:
      // (pero aquí ya es await; arriba usamos await supabase.from...; para ser correctos, hacemos sin await)

      // 🔧 Rehacer query correctamente (sin mezclar await)
      let q = supabase
        .from("asignaciones")
        .select(
          `
          id,
          org_id,
          tenant_id,
          org_people_id,
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
          org_people:org_people_id (
            id,
            people:person_id ( nombre, apellido, email )
          ),
          geocerca:geocerca_id ( id, nombre ),
          activity:activity_id ( id, name )
        `
        )
        .eq("is_deleted", false)
        .order("start_time", { ascending: true });

      if (orgId) q = q.eq("org_id", orgId);
      else q = q.eq("tenant_id", tenantId);

      const { data: asignaciones, error: asignErr } = await q;
      if (asignErr) {
        return json(res, 500, { ok: false, error: asignErr.message });
      }

      const catalogs = await loadCatalogs(supabase, { orgId, tenantId });

      return json(res, 200, {
        ok: true,
        data: {
          asignaciones: asignaciones || [],
          catalogs,
        },
      });
    }

    // ---- POST: crear
    if (req.method === "POST") {
      const body = await readJson(req);

      // Nunca aceptamos org_id desde el cliente como fuente de verdad:
      // si viene, lo ignoramos y forzamos el orgId del contexto
      const payload = {
        ...body,
        org_id: orgId ?? body?.org_id ?? null,
        tenant_id: tenantId ?? body?.tenant_id ?? null,
      };

      const { data, error } = await supabase
        .from("asignaciones")
        .insert(payload)
        .select("*")
        .single();

      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    // ---- PATCH: actualizar (soft update)
    if (req.method === "PATCH") {
      const body = await readJson(req);
      const id = body?.id;
      const patch = body?.patch;

      if (!id || !patch) {
        return json(res, 400, { ok: false, error: "missing id/patch" });
      }

      const safePatch = { ...patch };
      delete safePatch.org_id;
      delete safePatch.tenant_id;

      let q = supabase.from("asignaciones").update(safePatch).eq("id", id);
      if (orgId) q = q.eq("org_id", orgId);
      else q = q.eq("tenant_id", tenantId);

      const { data, error } = await q.select("*").single();
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, data });
    }

    // ---- DELETE: soft delete
    if (req.method === "DELETE") {
      const body = await readJson(req);
      const id = body?.id;
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
