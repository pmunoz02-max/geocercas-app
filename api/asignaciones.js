const VERSION = "asignaciones-clean-04";

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("X-Api-Version", VERSION);
}

function send(res, status, payload) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const q = req.query || {};
  const { method } = req;

  if (method === "OPTIONS") {
    return send(res, 204, {});
  }
  if (method === "HEAD") {
    setHeaders(res);
    res.statusCode = 200;
    return res.end();
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (method === "PATCH") {
    // PATCH: editar asignación o cambiar estado
    const { id, ...fields } = req.body || {};
    if (!id) return send(res, 400, { ok: false, error: "missing_id" });
    const { error } = await supabase
      .from("asignaciones")
      .update(fields)
      .eq("id", id)
      .eq("is_deleted", false);
    if (error) return send(res, 500, { ok: false, error: error.message });
    return send(res, 200, { ok: true });
  }

  if (method === "DELETE") {
    // DELETE lógico: is_deleted=true
    const { id } = req.body || {};
    if (!id) return send(res, 400, { ok: false, error: "missing_id" });
    const { error } = await supabase
      .from("asignaciones")
      .update({ is_deleted: true })
      .eq("id", id);
    if (error) return send(res, 500, { ok: false, error: error.message });
    return send(res, 200, { ok: true });
  }

  if (method !== "GET") {
    return send(res, 405, {
      ok: false,
      error: "method_not_allowed",
      method,
      version: VERSION,
    });
  }

  // GET: bundle de asignaciones y catálogos
  let personal = [];
  let geocercas = [];
  let activities = [];
  let asignaciones = [];
  const requested_org_id = q.org_id || q.orgId || null;
  try {
    if (requested_org_id) {
      // Personal
      const { data: personalData, error: personalError } = await supabase
        .from("personal")
        .select("id,nombre,apellido,email,org_id")
        .eq("org_id", requested_org_id)
        .eq("is_deleted", false)
        .eq("vigente", true)
        .order("apellido", { ascending: true })
        .order("nombre", { ascending: true });
      if (!personalError && Array.isArray(personalData)) {
        personal = personalData;
      }
      // Geocercas desde tabla geofences (canónica)
      const { data: geocercasData, error: geocercasError } = await supabase
        .from("geofences")
        .select("id,name,org_id,active")
        .eq("org_id", requested_org_id)
        .eq("active", true)
        .order("name", { ascending: true });
      if (!geocercasError && Array.isArray(geocercasData)) {
        geocercas = geocercasData.map(g => ({
          id: g.id,
          name: g.name || null
        }));
      }
      // Activities desde tabla activities
      const { data: activitiesData, error: activitiesError } = await supabase
        .from("activities")
        .select("id,name")
        .eq("org_id", requested_org_id)
        .order("name", { ascending: true });
      if (!activitiesError && Array.isArray(activitiesData)) {
        activities = activitiesData;
      }

      // Asignaciones desde tabla asignaciones
      const { data: asignacionesData, error: asignacionesError } = await supabase
        .from("asignaciones")
        .select("*")
        .eq("org_id", requested_org_id)
        .eq("is_deleted", false);
      if (!asignacionesError && Array.isArray(asignacionesData)) {
        asignaciones = asignacionesData;
      }
    }
  } catch (e) {
    // Si hay error, personal y geocercas quedan como []
  }

  return send(res, 200, {
    ok: true,
    data: {
      catalogs: {
        personal,
        geocercas,
        activities,
      },
      asignaciones,
      debug: {
        requested_org_id,
        personal_count: Array.isArray(personal) ? personal.length : -1,
        personal_org_ids: Array.isArray(personal)
          ? [...new Set(personal.map(p => p.org_id))]
          : [],
      },
    },
  });
}