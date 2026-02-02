// api/geocercas.js
// ============================================================
// TENANT-SAFE Geocercas API (CANONICAL)
// - NO orgId / tenantId desde el cliente (DB resuelve contexto)
// - Contexto resuelto vía bootstrap_session_context()
// - Auth universal: Bearer token (preferido) o cookie tg_at (legacy)
// ============================================================

import { createClient } from "@supabase/supabase-js";

function send(res, status, payload) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  // Si antes dependías de Cookie, mantenemos Vary amplio:
  res.setHeader("Vary", "Cookie, Authorization");
  return res.status(status).json(payload);
}

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

function getBearerToken(req) {
  const h = String(req.headers?.authorization || "").trim();
  if (!h) return "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

function supabaseForToken(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE env vars");

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
}

async function getContextOr401(req) {
  // Preferido: Authorization Bearer
  const bearer = getBearerToken(req);
  if (bearer) {
    const supabase = supabaseForToken(bearer);
    const { error } = await supabase.rpc("bootstrap_session_context");
    if (error) return { ok: false, status: 401, error: error.message || "ctx error (bearer)" };
    return { ok: true, supabase };
  }

  // Legacy: cookie tg_at
  const cookies = parseCookies(req);
  const token = cookies.tg_at || "";
  if (!token) return { ok: false, status: 401, error: "missing auth (no Bearer, no tg_at cookie)" };

  const supabase = supabaseForToken(token);
  const { error } = await supabase.rpc("bootstrap_session_context");
  if (error) return { ok: false, status: 401, error: error.message || "ctx error (cookie)" };

  return { ok: true, supabase };
}

export default async function handler(req, res) {
  try {
    const ctx = await getContextOr401(req);
    if (!ctx.ok) return send(res, ctx.status, { ok: false, error: ctx.error });

    const { supabase } = ctx;

    // -------------------------
    // GET → list geocercas
    // -------------------------
    if (req.method === "GET") {
      // opcional: id para obtener una geocerca puntual
      const id = req.query?.id ? String(req.query.id) : "";
      if (id) {
        const { data, error } = await supabase.rpc("geocercas_get", { p_id: id }).catch(() => ({
          data: null,
          error: null,
        }));

        // Si no tienes geocercas_get, caemos a list y filtramos (compat)
        if (error) {
          console.error("[api/geocercas][GET geocercas_get]", error);
          return send(res, 500, { ok: false, error: error.message });
        }
        if (data) return send(res, 200, data);
      }

      const { data, error } = await supabase.rpc("geocercas_list");
      if (error) {
        console.error("[api/geocercas][GET]", error);
        return send(res, 500, { ok: false, error: error.message });
      }
      return send(res, 200, data || []);
    }

    // -------------------------
    // POST → upsert geocerca
    // -------------------------
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      const { data, error } = await supabase.rpc("geocercas_upsert", {
        p_id: body.id || null,
        p_nombre: body.nombre || body.name || null,
        p_geojson: body.geojson || body.geometry || body.geom || null,
        p_visible: body.visible ?? true,
        p_activa: body.activa ?? true,
        p_color: body.color || null,
      });

      if (error) {
        console.error("[api/geocercas][POST]", error);
        return send(res, 500, { ok: false, error: error.message });
      }

      return send(res, 200, data);
    }

    // -------------------------
    // DELETE → delete geocerca
    // -------------------------
    if (req.method === "DELETE") {
      const id = req.query?.id ? String(req.query.id) : "";
      if (!id) return send(res, 422, { ok: false, error: "id is required" });

      const { error } = await supabase.rpc("geocercas_delete", { p_id: id });
      if (error) {
        console.error("[api/geocercas][DELETE]", error);
        return send(res, 500, { ok: false, error: error.message });
      }

      return send(res, 200, { ok: true });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[api/geocercas][FATAL]", err);
    return send(res, 500, { ok: false, error: err?.message || "fatal" });
  }
}
