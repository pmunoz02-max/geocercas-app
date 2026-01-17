// api/reportes.js
import { createClient } from "@supabase/supabase-js";

/**
 * Reportes API (cookie-based)
 * - Auth primary: cookie HttpOnly tg_at
 * - Auth fallback: Authorization: Bearer <token>
 *
 * Actions:
 * - GET /api/reportes?action=filters
 * - GET /api/reportes?action=report&start=YYYY-MM-DD&end=YYYY-MM-DD
 *     &geocerca_ids=uuid,uuid
 *     &geocerca_names=text,text
 *     &personal_ids=uuid,uuid
 *     &emails=text,text
 *     &activity_ids=uuid,uuid
 *     &asignacion_ids=uuid,uuid
 *     &limit=200&offset=0
 */

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function parseCookie(cookieHeader, key) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  if (!m || !m[1]) return null;
  const raw = m[1];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

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

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const SUPABASE_URL = getEnv([
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);

    const SUPABASE_ANON_KEY = getEnv([
      "SUPABASE_ANON_KEY",
      "SUPABASE_ANON_PUBLIC",
      "VITE_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error:
          "Server misconfigured: missing Supabase env vars (SUPABASE_URL / SUPABASE_ANON_KEY)",
        details: { hasUrl: Boolean(SUPABASE_URL), hasAnonKey: Boolean(SUPABASE_ANON_KEY) },
      });
    }

    // ===== auth: cookie-first, bearer fallback =====
    const cookieHeader = req.headers.cookie || "";
    let token = parseCookie(cookieHeader, "tg_at");

    if (!token) {
      const authHeader = req.headers.authorization || "";
      if (authHeader.toLowerCase().startsWith("bearer ")) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res
        .status(401)
        .json({ error: "Missing authentication (cookie tg_at or Authorization Bearer)" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const action = String(req.query.action || "").toLowerCase();

    // ======================
    // action=filters
    // ======================
    if (action === "filters") {
      const [geocercasRes, personasRes, activitiesRes, asignacionesRes] =
        await Promise.all([
          supabase.from("geocercas").select("id, nombre").order("nombre", { ascending: true }),
          supabase
            .from("personal")
            .select("id, nombre, apellido, email, email_norm, activo, vigente, is_deleted")
            .order("nombre", { ascending: true }),
          supabase
            .from("activities")
            .select("id, name, active, hourly_rate, currency_code")
            .order("name", { ascending: true }),
          supabase
            .from("asignaciones")
            .select(
              "id, status, estado, geocerca_id, personal_id, activity_id, start_time, end_time, period, is_deleted"
            )
            .order("created_at", { ascending: false }),
        ]);

      // si alguno falla, devolvemos error claro
      const errors = [];
      if (geocercasRes.error) errors.push({ source: "geocercas", error: geocercasRes.error.message });
      if (personasRes.error) errors.push({ source: "personal", error: personasRes.error.message });
      if (activitiesRes.error) errors.push({ source: "activities", error: activitiesRes.error.message });
      if (asignacionesRes.error)
        errors.push({ source: "asignaciones", error: asignacionesRes.error.message });

      if (errors.length) {
        return res.status(400).json({ error: "Failed to load filters", details: errors });
      }

      const geocercas = geocercasRes.data || [];
      const personas = (personasRes.data || []).filter((p) => !p?.is_deleted);
      const activities = activitiesRes.data || [];
      const asignaciones = (asignacionesRes.data || []).filter((a) => !a?.is_deleted);

      return res.status(200).json({
        data: { geocercas, personas, activities, asignaciones },
      });
    }

    // ======================
    // action=report
    // ======================
    if (action === "report") {
      const start = req.query.start ? String(req.query.start) : "";
      const end = req.query.end ? String(req.query.end) : "";

      if (start && end && start > end) {
        return res.status(400).json({ error: 'La fecha "Desde" no puede ser mayor que "Hasta".' });
      }

      const geocercaIds = parseCsvParam(req.query.geocerca_ids);
      const geocercaNames = parseCsvParam(req.query.geocerca_names);
      const personalIds = parseCsvParam(req.query.personal_ids);
      const emails = parseCsvParam(req.query.emails).map((e) => e.toLowerCase());
      const activityIds = parseCsvParam(req.query.activity_ids);
      const asignacionIds = parseCsvParam(req.query.asignacion_ids);

      const limit = normalizeLimit(req.query.limit, 200, 1000);
      const offset = normalizeOffset(req.query.offset);

      let query = supabase
        .from("v_reportes_diario_con_asignacion")
        .select("*")
        .order("work_day", { ascending: false });

      // work_day es DATE en la vista
      if (start) query = query.gte("work_day", start);
      if (end) query = query.lte("work_day", end);

      // filtros múltiples
      if (geocercaIds.length) query = query.in("geocerca_id", geocercaIds);
      if (geocercaNames.length) query = query.in("geofence_name", geocercaNames);
      if (personalIds.length) query = query.in("personal_id", personalIds);
      if (emails.length) query = query.in("email_norm", emails);
      if (activityIds.length) query = query.in("activity_id", activityIds);
      if (asignacionIds.length) query = query.in("asignacion_id", asignacionIds);

      // paginación
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        return res.status(400).json({
          error: error.message,
          hint:
            "Revisa vistas v_reportes_* (get_current_org_id), y RLS en attendances/personal/activities/asignaciones/geocercas.",
        });
      }

      return res.status(200).json({
        data: data || [],
        meta: { limit, offset, returned: (data || []).length },
      });
    }

    return res.status(400).json({
      error: "Invalid action. Use action=filters or action=report",
    });
  } catch (e) {
    console.error("[api/reportes] fatal:", e);
    return res.status(500).json({
      error: "Unexpected server error",
      details: e?.message || String(e),
    });
  }
}
