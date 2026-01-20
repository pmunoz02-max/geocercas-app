// api/geocercas.js
// v7: API-first + UX-safe status + soft delete DB-first
// - GET action=list: SIEMPRE 200 con {ok:true|false, items:[]}
// - GET action=get
// - POST action=upsert
// - POST action=delete (soft delete: activo=false) UX-safe (nunca 400 por targets vacios)
// - Header X-Api-Version para verificar que Vercel usa este archivo

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function setHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Api-Version", "geocercas-api-v7-uxsafe-delete");
}

function send(res, status, body) {
  setHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function ok(res, body) {
  return send(res, 200, body);
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
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const r = await fetch(url, {
    method,
    headers,
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

function normalizeBoolFlag(v, defaultValue) {
  if (v === undefined || v === null || v === "") return defaultValue;
  const s = String(v).toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return defaultValue;
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      setHeaders(res);
      res.statusCode = 204;
      return res.end();
    }
    if (req.method === "HEAD") {
      setHeaders(res);
      res.statusCode = 200;
      return res.end();
    }

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY =
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return send(res, 500, {
        ok: false,
        error: "Server misconfigured",
        details: "Missing SUPABASE env vars (URL / ANON KEY)",
      });
    }

    const accessToken = getCookie(req, "tg_at");
    if (!accessToken) {
      return send(res, 401, { ok: false, error: "Not authenticated (missing tg_at cookie)" });
    }

    // GET
    if (req.method === "GET") {
      const q = getQuery(req);
      const action = String(q.action || "list");

      if (action === "list") {
        const org_id = q.org_id ? String(q.org_id) : null;
        const onlyActive = normalizeBoolFlag(q.onlyActive, true);

        if (!org_id) return ok(res, { ok: true, items: [] });

        const activoFilter = onlyActive ? `&activo=eq.true` : ``;

        const url =
          `${SUPABASE_URL}/rest/v1/geocercas` +
          `?org_id=eq.${encodeURIComponent(org_id)}` +
          activoFilter +
          `&select=id,nombre,nombre_ci,org_id,activo,updated_at` +
          `&order=nombre.asc`;

        const r = await sbFetch({
          url,
          anonKey: SUPABASE_ANON_KEY,
          accessToken,
          method: "GET",
        });

        if (!r.ok)
          return ok(res, {
            ok: false,
            items: [],
            supabase_status: r.status,
            details: r.data,
          });

        return ok(res, { ok: true, items: Array.isArray(r.data) ? r.data : [] });
      }

      if (action === "get") {
        const org_id = q.org_id ? String(q.org_id) : null;
        const id = q.id ? String(q.id) : null;
        if (!org_id) return send(res, 400, { ok: false, error: "org_id is required" });
        if (!id) return send(res, 400, { ok: false, error: "id is required" });

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

        if (!r.ok) return send(res, r.status, { ok: false, error: "Supabase error", details: r.data });

        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        return ok(res, { ok: true, geocerca: row || null });
      }

      return send(res, 400, { ok: false, error: "Unsupported action", action });
    }

    // POST (upsert / delete)
    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const action = String(payload?.action || "upsert");

      // UPSERT
      if (action === "upsert") {
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

        const row = pick(payload, allowed);

        if (!row.org_id) return send(res, 400, { ok: false, error: "org_id is required" });
        if (!row.nombre && !row.nombre_ci) {
          return send(res, 400, { ok: false, error: "nombre (or nombre_ci) is required" });
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

        if (!r.ok) return send(res, r.status, { ok: false, error: "Supabase error", details: r.data });

        const saved = Array.isArray(r.data) ? r.data[0] : r.data;
        return ok(res, { ok: true, geocerca: saved });
      }

      // DELETE (soft) — UX-safe
      if (action === "delete") {
        const org_id = payload?.org_id ? String(payload.org_id) : null;
        const id = payload?.id ? String(payload.id) : null;
        const nombre_ci = payload?.nombre_ci ? String(payload.nombre_ci) : null;
        const nombre = payload?.nombre ? String(payload.nombre) : null;
        const nombres_ci = Array.isArray(payload?.nombres_ci) ? payload.nombres_ci : null;
        const ids = Array.isArray(payload?.ids) ? payload.ids : null;

        if (!org_id) return send(res, 400, { ok: false, error: "org_id is required" });

        const targets = [];
        if (id) targets.push({ type: "id", value: id });
        if (nombre_ci) targets.push({ type: "nombre_ci", value: nombre_ci });
        if (nombre) targets.push({ type: "nombre_ci", value: nombre.toLowerCase() });
        if (Array.isArray(ids)) {
          for (const x of ids) if (x) targets.push({ type: "id", value: String(x) });
        }
        if (Array.isArray(nombres_ci)) {
          for (const x of nombres_ci) if (x) targets.push({ type: "nombre_ci", value: String(x).toLowerCase() });
        }

        // ✅ CAMBIO CLAVE: si no hay targets, no rompemos UI (200, skipped)
        if (!targets.length) {
          return ok(res, {
            ok: true,
            deleted: 0,
            skipped: true,
            details: [{ ok: true, reason: "delete called without targets" }],
          });
        }

        let deleted = 0;
        const details = [];

        for (const t of targets) {
          const filter =
            t.type === "id"
              ? `id=eq.${encodeURIComponent(t.value)}`
              : `nombre_ci=eq.${encodeURIComponent(t.value)}`;

          const patchUrl =
            `${SUPABASE_URL}/rest/v1/geocercas` +
            `?org_id=eq.${encodeURIComponent(org_id)}` +
            `&${filter}` +
            `&select=id,nombre,nombre_ci,org_id,activo,updated_at`;

          const r = await sbFetch({
            url: patchUrl,
            anonKey: SUPABASE_ANON_KEY,
            accessToken,
            method: "PATCH",
            body: {
              activo: false,
              updated_at: new Date().toISOString(),
            },
          });

          if (!r.ok) {
            details.push({ target: t, ok: false, status: r.status, data: r.data });
            continue;
          }

          const arr = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
          deleted += arr.length;
          details.push({ target: t, ok: true, count: arr.length });
        }

        return ok(res, { ok: true, deleted, details });
      }

      return send(res, 400, { ok: false, error: "Unsupported action", action });
    }

    res.setHeader("Allow", "GET,POST,OPTIONS,HEAD");
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
}
