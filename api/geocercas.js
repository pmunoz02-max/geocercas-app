// api/geocercas.js
// =====================================================
// Endpoint API-FIRST para geocercas
// FIX DEFINITIVO: normaliza orgId / name antes de validar
// =====================================================

import { createClient } from "@supabase/supabase-js";

// ---------- Supabase ----------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ---------- Helpers ----------
function send(res, status, payload) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Vary", "Cookie");
  res.status(status).json(payload);
}

function normalizePayload(body) {
  const payload = typeof body === "string" ? JSON.parse(body) : { ...body };

  // orgId → org_id
  if (!payload.org_id && payload.orgId) {
    payload.org_id = payload.orgId;
  }

  // name → nombre
  if (!payload.nombre && payload.name) {
    payload.nombre = payload.name;
  }

  // nombre_ci automático
  if (!payload.nombre_ci && payload.nombre) {
    payload.nombre_ci = String(payload.nombre).trim().toLowerCase();
  }

  // geometry aliases
  if (!payload.geojson && payload.geometry) payload.geojson = payload.geometry;
  if (!payload.geojson && payload.geom) payload.geojson = payload.geom;

  return payload;
}

// =====================================================
// HANDLER
// =====================================================
export default async function handler(req, res) {
  try {
    // -------------------------------------------------
    // GET /api/geocercas
    // -------------------------------------------------
    if (req.method === "GET") {
      const { orgId, id, onlyActive } = req.query;
      if (!orgId) return send(res, 422, { ok: false, error: "orgId is required" });

      let q = supabase.from("geocercas").select("*").eq("org_id", orgId);

      if (id) q = q.eq("id", id);
      if (onlyActive === "true") q = q.eq("activa", true);

      const { data, error } = await q.order("nombre");

      if (error) {
        console.error("[api/geocercas][GET]", error);
        return send(res, 500, { ok: false, error: error.message });
      }

      return send(res, 200, data);
    }

    // -------------------------------------------------
    // POST /api/geocercas  (UPSERT)
    // -------------------------------------------------
    if (req.method === "POST") {
      const row = normalizePayload(req.body);

      // ---- Validaciones reales (422, no 400) ----
      if (!row.org_id) {
        return send(res, 422, { ok: false, error: "org_id is required" });
      }

      if (!row.nombre || !row.nombre_ci) {
        return send(res, 422, {
          ok: false,
          error: "nombre (or name) is required",
        });
      }

      if (!row.geojson) {
        return send(res, 422, {
          ok: false,
          error: "geojson / geometry is required",
        });
      }

      // Defaults seguros
      row.activa = row.activa ?? true;
      row.visible = row.visible ?? true;

      // ---- UPSERT REAL ----
      const { data, error } = await supabase
        .from("geocercas")
        .upsert(row, {
          onConflict: "org_id,nombre_ci",
        })
        .select()
        .single();

      if (error) {
        console.error("[api/geocercas][POST][SUPABASE]", error);
        return send(res, 500, {
          ok: false,
          error: error.message,
          details: error.details || null,
        });
      }

      // ✅ ÉXITO REAL → 200
      return send(res, 200, {
        ok: true,
        row: data,
      });
    }

    // -------------------------------------------------
    // DELETE /api/geocercas
    // -------------------------------------------------
    if (req.method === "DELETE") {
      const { orgId, id } = req.query;
      if (!orgId || !id) {
        return send(res, 422, {
          ok: false,
          error: "orgId and id are required",
        });
      }

      const { error } = await supabase
        .from("geocercas")
        .delete()
        .eq("org_id", orgId)
        .eq("id", id);

      if (error) {
        console.error("[api/geocercas][DELETE]", error);
        return send(res, 500, { ok: false, error: error.message });
      }

      return send(res, 200, { ok: true });
    }

    // -------------------------------------------------
    // Method not allowed
    // -------------------------------------------------
    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[api/geocercas][FATAL]", err);
    return send(res, 500, {
      ok: false,
      error: err.message || "Internal server error",
    });
  }
}
