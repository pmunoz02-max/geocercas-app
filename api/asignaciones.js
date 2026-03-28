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

  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  if (req.method === "HEAD") {
    setHeaders(res);
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "GET") {
    return send(res, 405, {
      ok: false,
      error: "method_not_allowed",
      method: req.method,
      version: VERSION,
    });
  }

  // Consulta mínima a personal
  let personal = [];
  let geocercas = [];
  const requested_org_id = q.org_id || q.orgId || null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
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
      // Geocercas desde tabla geocercas
      const { data: geocercasData, error: geocercasError } = await supabase
        .from("geocercas")
        .select("id,nombre,name,is_deleted,activo")
        .eq("org_id", requested_org_id)
        .eq("is_deleted", false)
        .eq("activo", true)
        .order("nombre", { ascending: true });
      if (!geocercasError && Array.isArray(geocercasData)) {
        geocercas = geocercasData.map(g => ({
          id: g.id,
          nombre: g.nombre || g.name || null
        }));
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
      },
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