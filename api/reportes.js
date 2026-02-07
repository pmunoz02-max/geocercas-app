// api/reportes.js
import { resolveOrgAndMembership } from "../src/server/lib/resolveOrg.js";

export const config = { runtime: "nodejs" };

const VERSION = "reportes-api-v23-resolveOrg-memberships";

/* -----------------------------
 Helpers
----------------------------- */
function parseCsvParam(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeLimit(v, def = 200, max = 1000) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function normalizeOffset(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Api-Version", VERSION);
  res.end(JSON.stringify({ ...payload, version: VERSION }));
}

/* -----------------------------
 Handler
----------------------------- */
export default async function handler(req, res) {
  try {
    // CORS (igual que otros endpoints)
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

    if (req.method === "OPTIONS") return json(res, 200, { ok: true });
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

    // ✅ Canonical auth + org resolver (server-side)
    const ctx = await resolveOrgAndMembership(req, res);
    if (!ctx?.ok && ctx?.status) {
      return json(res, ctx.status, { error: ctx.error || "Unauthorized", details: ctx.details });
    }

    const org_id = String(ctx.org_id || "");
    const supabase = ctx.supabase;
    const role = String(ctx.role || "").toLowerCase();

    if (!org_id || !supabase) {
      return json(res, 500, {
        error: "Contexto incompleto",
        details: "resolveOrgAndMembership no devolvió org_id/supabase",
      });
    }

    const action = String(req.query.action || "").toLowerCase();

    /* ======================
       FILTERS
    ====================== */
    if (action === "filters") {
      const [geocercasRes, personasRes, activitiesRes, asignacionesRes] = await Promise.all([
        supabase
          .from("geocercas")
          .select("id, nombre, org_id")
          .eq("org_id", org_id)
          .eq("is_deleted", false)
          .order("nombre"),

        supabase
          .from("personal")
          .select("id, nombre, apellido, email, org_id")
          .eq("org_id", org_id)
          .eq("is_deleted", false)
          .order("nombre"),

        supabase
          .from("activities")
          .select("id, name, hourly_rate, currency_code, org_id")
          .eq("org_id", org_id)
          .eq("active", true)
          .order("name"),

        supabase
          .from("asignaciones")
          .select("id, status, personal_id, geocerca_id, activity_id, org_id")
          .eq("org_id", org_id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false }),
      ]);

      const errors = [];
      if (geocercasRes.error) errors.push(geocercasRes.error.message);
      if (personasRes.error) errors.push(personasRes.error.message);
      if (activitiesRes.error) errors.push(activitiesRes.error.message);
      if (asignacionesRes.error) errors.push(asignacionesRes.error.message);

      if (errors.length) {
        return json(res, 400, { error: "Failed loading filters", details: errors });
      }

      return json(res, 200, {
        data: {
          geocercas: geocercasRes.data || [],
          personas: personasRes.data || [],
          activities: activitiesRes.data || [],
          asignaciones: asignacionesRes.data || [],
        },
        meta: { org_id, role },
      });
    }

    /* ======================
       REPORT
    ====================== */
    if (action === "report") {
      const start = req.query.start ? String(req.query.start) : "";
      const end = req.query.end ? String(req.query.end) : "";
      if (start && end && start > end) return json(res, 400, { error: "Invalid date range" });

      const geocercaIds = parseCsvParam(req.query.geocerca_ids);
      const personalIds = parseCsvParam(req.query.personal_ids);
      const activityIds = parseCsvParam(req.query.activity_ids);
      const asignacionIds = parseCsvParam(req.query.asignacion_ids);

      const limit = normalizeLimit(req.query.limit);
      const offset = normalizeOffset(req.query.offset);

      let query = supabase
        .from("v_reportes_diario_con_asignacion")
        .select("*")
        .eq("org_id", org_id)
        .order("work_day", { ascending: false });

      if (start) query = query.gte("work_day", start);
      if (end) query = query.lte("work_day", end);
      if (geocercaIds.length) query = query.in("geocerca_id", geocercaIds);
      if (personalIds.length) query = query.in("personal_id", personalIds);
      if (activityIds.length) query = query.in("activity_id", activityIds);
      if (asignacionIds.length) query = query.in("asignacion_id", asignacionIds);

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) return json(res, 400, { error: error.message });

      return json(res, 200, {
        data: data || [],
        meta: { limit, offset, returned: (data || []).length, org_id, role },
      });
    }

    return json(res, 400, { error: "Invalid action" });
  } catch (e) {
    console.error("[api/reportes]", e);
    return json(res, 500, { error: "Server error", details: e?.message || String(e) });
  }
}
