// api/geocercas.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service role en backend: OK para funciones serverless
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function send(res, status, payload) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Vary", "Cookie");
  return res.status(status).json(payload);
}

function normalizePayload(body) {
  const p = typeof body === "string" ? JSON.parse(body) : (body || {});

  // orgId -> org_id
  if (!p.org_id && p.orgId) p.org_id = p.orgId;

  // name -> nombre
  if (!p.nombre && p.name) p.nombre = p.name;

  // geojson aliases
  if (!p.geojson && p.geometry) p.geojson = p.geometry;
  if (!p.geojson && p.geom) p.geojson = p.geom;

  // nombre_ci
  if (!p.nombre_ci && p.nombre) p.nombre_ci = String(p.nombre).trim().toLowerCase();

  // defaults
  if (p.activa === undefined) p.activa = true;
  if (p.visible === undefined) p.visible = true;

  return p;
}

function errorMsg(error) {
  // supabase-js: error.message + error.details
  if (!error) return "Unknown error";
  return error.message || String(error);
}

export default async function handler(req, res) {
  try {
    // -------------------------
    // GET /api/geocercas
    // -------------------------
    if (req.method === "GET") {
      const orgId = req.query.orgId || req.query.org_id;
      const id = req.query.id || null;
      const onlyActive = req.query.onlyActive;

      if (!orgId) {
        return send(res, 422, { ok: false, error: "orgId is required" });
      }

      let q = supabase.from("geocercas").select("*").eq("org_id", orgId);

      if (id) q = q.eq("id", id);
      if (onlyActive === "true") q = q.eq("activa", true);

      const { data, error } = await q.order("nombre");

      if (error) {
        console.error("[api/geocercas][GET]", error);
        return send(res, 500, { ok: false, error: errorMsg(error), details: error.details || null });
      }

      // ✅ Respuesta simple: array (tu frontend lo soporta)
      return send(res, 200, data || []);
    }

    // -------------------------
    // DELETE /api/geocercas?id=...&orgId=...
    // (delete por ID)
    // -------------------------
    if (req.method === "DELETE") {
      const orgId = req.query.orgId || req.query.org_id;
      const id = req.query.id;

      if (!orgId || !id) {
        return send(res, 422, { ok: false, error: "orgId and id are required" });
      }

      const { error } = await supabase
        .from("geocercas")
        .delete()
        .eq("org_id", orgId)
        .eq("id", id);

      if (error) {
        console.error("[api/geocercas][DELETE]", error);
        return send(res, 500, { ok: false, error: errorMsg(error), details: error.details || null });
      }

      return send(res, 200, { ok: true });
    }

    // -------------------------
    // POST /api/geocercas
    // (upsert normal)
    // y (bulk delete por nombres_ci)
    // -------------------------
    if (req.method === "POST") {
      const body = normalizePayload(req.body);

      // ✅ Modo BULK DELETE (esto es lo que usa tu boton eliminar)
      // payload: { orgId/org_id, delete: true, nombres_ci: ["a","b"] }
      if (body.delete === true) {
        if (!body.org_id) {
          return send(res, 422, { ok: false, error: "orgId is required for delete" });
        }
        if (!Array.isArray(body.nombres_ci) || body.nombres_ci.length === 0) {
          return send(res, 422, { ok: false, error: "nombres_ci[] is required for delete" });
        }

        const nombres_ci = body.nombres_ci.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);

        const { error } = await supabase
          .from("geocercas")
          .delete()
          .eq("org_id", body.org_id)
          .in("nombre_ci", nombres_ci);

        if (error) {
          console.error("[api/geocercas][POST delete]", error);
          return send(res, 500, { ok: false, error: errorMsg(error), details: error.details || null });
        }

        return send(res, 200, { ok: true, deleted: nombres_ci.length });
      }

      // ✅ UPSERT normal
      if (!body.org_id) return send(res, 422, { ok: false, error: "orgId is required" });
      if (!body.nombre) return send(res, 422, { ok: false, error: "nombre is required" });
      if (!body.nombre_ci) return send(res, 422, { ok: false, error: "nombre_ci is required" });
      if (!body.geojson) return send(res, 422, { ok: false, error: "geojson is required" });

      // Solo columnas esperadas (evita basura que rompa el upsert)
      const row = {
        id: body.id || undefined,
        org_id: body.org_id,
        nombre: body.nombre,
        nombre_ci: body.nombre_ci,
        geojson: body.geojson, // JSONB
        activa: body.activa,
        visible: body.visible,
        color: body.color || undefined,
        // agrega aquí otros campos si tu tabla los tiene (created_by, personal_ids, etc.)
      };

      const { data, error } = await supabase
        .from("geocercas")
        .upsert(row, { onConflict: "org_id,nombre_ci" })
        .select()
        .single();

      if (error) {
        console.error("[api/geocercas][POST upsert]", error);
        return send(res, 500, { ok: false, error: errorMsg(error), details: error.details || null });
      }

      // ✅ CRÍTICO: responder 200 y devolver row directa (mucho más compatible)
      return send(res, 200, data);
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[api/geocercas][FATAL]", err);
    return send(res, 500, { ok: false, error: err?.message || "Internal server error" });
  }
}
