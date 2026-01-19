// api/geocercas.js
// Geocercas API (same-origin). Auth via HttpOnly cookie "tg_at".
// Supports: OPTIONS, HEAD, GET(list/get), POST(upsert)
// HARD GUARANTEE: GET action=list ALWAYS returns HTTP 200 with {ok:true, items:[]}
// Adds X-Api-Version header for verification.

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function setCommonHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Api-Version", "geocercas-api-v3-force-200-list");
}

function sendJson(res, status, body) {
  setCommonHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function ok(res, body) {
  return sendJson(res, 200, body);
}

function bad(res, status, body) {
  return sendJson(res, status, body);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
}

function getQuery(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const q = {};
    url.searchParams.forEach((v, k) => (q[k] = v));
    return q;
  } catch {
    return {};
  }
}

async function sbFetch({ url, anonKey, accessToken, method = "GET", body }) {
  const r = await fetch(url, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req, res) {
  try {
    // Preflight / compat
    if (req.method === "OPTIONS") {
      setCommonHeaders(res);
      res.statusCode = 204;
      return res.end();
    }
    if (req.method === "HEAD") {
      setCommonHeaders(res);
      res.statusCode = 200;
      return res.end();
    }

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY =
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return bad(res, 500, {
        error: "Server misconfigured",
        details: "Missing SUPABASE env vars (URL / ANON KEY)",
      });
    }

    const accessToken = getCookie(req, "tg_at");
    if (!accessToken) {
      return bad(res, 401, { error: "Not authenticated (missing tg_at cookie)" });
    }

    // ✅ GET: list/get
    if (req.method === "GET") {
      const q = getQuery(req);
      const action = String(q.action || "list");
      const org_id = q.org_id ? String(q.org_id) : null;

      // ✅ HARD GUARANTEE: list ALWAYS 200 (even without org_id)
      if (action === "list") {
        if (!org_id) {
          return ok(res, { ok: true, items: [] });
        }

        const url =
          `${SUPABASE_URL}/rest/v1/geocercas` +
          `?org_id=eq.${encodeURIComponent(org_id)}` +
          `&select=id,nombre,org_id,activo,updated_at` +
          `&order=nombre.asc`;

        const r = await sbFetch({
          url,
          anonKey: SUPABASE_ANON_KEY,
          accessToken,
          method: "GET",
        });

        if (!r.ok) {
          // No propagamos status de Supabase a la UI para LIST (evita popups por cosas transitorias)
          // pero sí devolvemos details para debug.
          return ok(res, { ok: false, items: [], supabase_status: r.status, details: r.data });
        }

        return ok(res, { ok: true, items: Array.isArray(r.data) ? r.data : [] });
      }

      // get requiere org_id + id
      if (action === "get") {
        const id = q.id ? String(q.id) : null;
        if (!org_id) return bad(res, 400, { error: "org_id is required" });
        if (!id) return bad(res, 400, { error: "id is required" });

        const url =
          `${SUPABASE_URL}/rest/v1/geocercas` +
          `?id=eq.${encodeURIComponent(id)}` +
          `&org_id=eq.${encodeURIComponent(org_id)}` +
          `&select=*` +
          `&limit=1`;

        const r = await sbFetch({
          url,
          anonKey: SUPABASE_ANON_KEY,
          accessToken,
          method: "GET",
        });

        if (!r.ok) return bad(res, r.status, { error: "Supabase error", details: r.data });

        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        return ok(res, { ok: true, geocerca: row || null });
      }

      return bad(res, 400, { error: "Unsupported action", action });
    }

    // ✅ POST: upsert
    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const action = String(payload?.action || "upsert");

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

      if (action !== "upsert") return bad(res, 400, { error: "Unsupported action", action });

      const row = pick(payload, allowed);

      if (!row.org_id) return bad(res, 400, { error: "org_id is required" });
      if (!row.nombre && !row.nombre_ci) {
        return bad(res, 400, { error: "nombre (or nombre_ci) is required" });
      }

      const upsertUrl =
        `${SUPABASE_URL}/rest/v1/geocercas` +
        `?on_conflict=org_id,nombre_ci` +
        `&select=*`;

      const r = await sbFetch({
        url: upsertUrl,
        anonKey: SUPABASE_ANON_KEY,
        accessToken,
        method: "POST",
        body: row,
      });

      if (!r.ok) {
        return bad(res, r.status, {
          error: "Supabase error",
          status: r.status,
          details: r.data,
        });
      }

      const saved = Array.isArray(r.data) ? r.data[0] : r.data;
      return ok(res, { ok: true, geocerca: saved });
    }

    res.setHeader("Allow", "GET,POST,OPTIONS,HEAD");
    return bad(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return bad(res, 500, { error: "Server error", details: String(e?.message || e) });
  }
}
