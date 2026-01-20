// api/geocercas.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  // defaults
  if (p.activa === undefined) p.activa = true;
  if (p.visible === undefined) p.visible = true;

  return p;
}

function errorMsg(error) {
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

      if (!orgId) return send(res, 422, { ok: false, error: "orgId is required" });

      let q = supabase.from("geocercas").select("*").eq("org_id", orgId);
      if (id) q = q.eq("id", id);
      if (onlyActive === "true") q = q.eq("activa", true);

      const { data, error } = await q.order("nombre");

      if (error) {
        console.error("[api/geocercas][GET]", error);
        return send(res, 500, { ok: false, error: errorMsg(error), details: error.details || null });
      }

      return send(res, 200, data || []);
    }

    // -------------------------
    // DELETE /api/geocercas?id=...&orgId=...
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
    // - UPSERT normal (SIN nombre_ci porque es GENERATED)
    // - BULK DELETE por nombres_ci
    // -------------------------
    if (req.method === "POST") {
      const body = normalizePayload(req.body);

      // ---- BULK DELETE ----
      if (body.delete === true) {
        if (!body.org_id) return send(res, 422, { ok: false, error: "orgId is required for delete" });
        if (!Array.isArray(body.nombres_ci) || body.nombres_ci.length === 0) {
          return send(res, 422, { ok: false, error: "nombres_ci[] is required for delete" });
        }

        const nombres_ci = body.nombres_ci
          .map((x) => String(x || "").trim().toLowerCase())
          .filter(Boolean);

        const { error } = await supabase
          .from("geocercas")
          .delete()
          .eq("org_id", body.org_id)
          .in("nombre_ci", nombres_ci); // ✅ OK: nombre_ci existe (generated), sirve para filtrar

        if (error) {
          console.error("[api/geocercas][POST delete]", error);
          return send(res, 500, { ok: false, error: errorMsg(error), details: error.details || null });
        }

        return send(res, 200, { ok: true, deleted: nombres_ci.length });
      }

      // ---- UPSERT normal ----
      if (!body.org_id) return send(res, 422, { ok: false, error: "orgId is required" });
      if (!body.nombre) return send(res, 422, { ok: false, error: "nombre is required" });
      if (!body.geojson) return send(res, 422, { ok: false, error: "geojson is required" });

      // ⚠️ CRÍTICO: NO incluir nombre_ci (generated column)
      const row = {
        id: body.id || undefined,
        org_id: body.org_id,
        nombre: body.nombre,
        geojson: body.geojson,
        activa: body.activa,
        visible: body.visible,
        color: body.color || undefined,
        // agrega otros campos reales si existen en tu tabla (created_by, etc.)
      };

      // Si tu unique conflict está basado en org_id + nombre_ci (generated), igual sirve.
      // Postgres calculará nombre_ci automáticamente.
      const { data, error } = await supabase
        .from("geocercas")
        .upsert(row, { onConflict: "org_id,nombre_ci" })
        .select()
        .single();

      if (error) {
        console.error("[api/geocercas][POST upsert]", error);
        return send(res, 500, { ok: false, error: errorMsg(error), details: error.details || null });
      }

      return send(res, 200, data); // ✅ formato simple para el frontend
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return send(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[api/geocercas][FATAL]", err);
    return send(res, 500, { ok: false, error: err?.message || "Internal server error" });
  }
}
