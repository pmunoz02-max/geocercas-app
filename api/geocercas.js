// api/geocercas.js
// Endpoint oficial: UI -> /api/geocercas (same-origin) -> Supabase
// Requiere cookie HttpOnly "tg_at" (access token de Supabase)

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY =
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json(res, 500, {
        error: "Server misconfigured",
        details: "Missing SUPABASE env vars (URL / ANON KEY)",
      });
    }

    const accessToken = getCookie(req, "tg_at");
    if (!accessToken) {
      return json(res, 401, { error: "Not authenticated (missing tg_at cookie)" });
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // action opcional (por si luego agregas toggle/delete). Por ahora soportamos upsert.
    const action = String(payload?.action || "upsert");

    // Campos permitidos (whitelist)
    // Ajusta aquí SOLO si tu UI envía otros campos.
    const allowed = [
      "id",
      "org_id",
      "nombre",
      "nombre_ci",
      "descripcion",
      "geojson",
      "geometry",
      "polygon",
      "geom",
      "lat",
      "lng",
      "radius_m",
      "visible",
      "activo",
      "activa",
      "bbox",
      "personal_ids",
      "asignacion_ids",
    ];

    if (action !== "upsert") {
      return json(res, 400, { error: "Unsupported action", action });
    }

    const row = pick(payload, allowed);

    // org_id es obligatorio en tu tabla
    if (!row.org_id) return json(res, 400, { error: "org_id is required" });

    // si tu UI usa nombre, perfecto. Si usa name, mapea en frontend.
    if (!row.nombre && !row.nombre_ci && !row.name) {
      // Nota: "name" no existe en whitelist; lo mantenemos fuera adrede.
      return json(res, 400, { error: "nombre (or nombre_ci) is required" });
    }

    // Upsert por constraint org_id,nombre_ci (como ya usas)
    const upsertUrl =
      `${SUPABASE_URL}/rest/v1/geocercas` +
      `?on_conflict=org_id,nombre_ci` +
      `&select=*`;

    const r = await fetch(upsertUrl, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });

    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!r.ok) {
      return json(res, r.status, {
        error: "Supabase error",
        status: r.status,
        details: data,
      });
    }

    // Supabase REST retorna array en upsert
    const saved = Array.isArray(data) ? data[0] : data;
    return json(res, 200, { ok: true, geocerca: saved });
  } catch (e) {
    return json(res, 500, { error: "Server error", details: String(e?.message || e) });
  }
}
