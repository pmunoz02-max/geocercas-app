// api/asignaciones.js
// CANONICO (memberships):
// - cookie HttpOnly tg_at
// - valida JWT (supabase.auth.getUser())
// - resuelve org_id desde memberships (is_default desc)
// - NO usa bootstrap_session_context / bootstrap_user_context
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

/**
 * Resuelve usuario + org canónico desde memberships:
 * select org_id, role from memberships where user_id=? order by is_default desc limit 1
 */
async function getCanonicalContextOr401(req) {
  const cookies = parseCookies(req);
  const token = cookies.tg_at || null;
  if (!token) return { ok: false, status: 401, error: "missing tg_at cookie" };

  const supabase = supabaseForToken(token);

  // 1) Validar token y obtener user_id
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: userErr?.message || "invalid session" };
  }
  const userId = userData.user.id;

  // 2) Resolver org desde memberships (canónico)
  const { data: mRows, error: mErr } = await supabase
    .from("memberships")
    .select("org_id, role, is_default, created_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (mErr) return { ok: false, status: 401, error: mErr.message || "memberships query error" };

  const m = Array.isArray(mRows) ? mRows[0] : null;
  const orgId = m?.org_id || null;

  if (!orgId) return { ok: false, status: 401, error: "no org in memberships" };

  return { ok: true, supabase, userId, orgId, role: m?.role || null };
}

async function loadCatalogs(supabase, { orgId }) {
  // ✅ Personal (mismo catálogo que PersonalPage)
  let personal = [];
  {
    const r = await supabase
      .from("personal")
      .select("id,nombre,apellido,email,org_id,is_deleted")
      .eq("org_id", orgId)
      .eq("is_deleted", false)
      .order("nombre", { ascending: true });

    if (!r.error) personal = r.data || [];
  }

  // ✅ Geocercas
  let geocercas = [];
  {
    const r = await supabase
      .from("geocercas")
      .select("id,nombre,org_id")
      .eq("org_id", orgId)
      .order("nombre", { ascending: true });

    if (!r.error) geocercas = r.data || [];
  }

  // ✅ Activities
  let activities = [];
  {
    const r = await supabase
      .from("activities")
      .select("id,name,org_id")
      .eq("org_id", orgId)
      .order("name", { ascending: true });

    if (!r.error) activities = r.data || [];
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
    const ctxRes = await getCanonicalContextOr401(req);
    if (!ctxRes.ok) return json(res, ctxRes.status, { ok: false, error: ctxRes.error });

    const { supabase, orgId } = ctxRes;

    if (req.method === "GET") {
      let q = supabase
        .from("asignaciones")
        .select(
          `
          id,
          org_id,
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
        .eq("org_id", orgId)
        .eq("is_deleted", false)
        .order("start_time", { ascending: true });

      const { data: asignaciones, error } = await q;
      if (error) return json(res, 500, { ok: false, error: error.message });

      const catalogs = await loadCatalogs(supabase, { orgId });

      return json(res, 200, { ok: true, data: { asignaciones: asignaciones || [], catalogs } });
    }

    if (req.method === "POST") {
      const body = (await readJson(req)) || {};

      const payload = {
        ...body,
        org_id: orgId, // ✅ siempre desde contexto
      };

      // ✅ Canon: personal_id obligatorio
      if (!payload.personal_id) {
        return json(res, 400, { ok: false, error: "personal_id is required" });
      }

      // Nunca confiar en legacy/cliente
      delete payload.tenant_id;
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
      delete safe.org_people_id;

      let q = supabase.from("asignaciones").update(safe).eq("id", id).eq("org_id", orgId);

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
