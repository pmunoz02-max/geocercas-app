// api/reportes.js
import { createClient } from "@supabase/supabase-js";

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
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
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const SUPABASE_URL = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
    const SUPABASE_ANON_KEY = getEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
    const SUPABASE_SERVICE_ROLE_KEY = getEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: "Missing Supabase env vars" });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: "Missing Supabase service role env var (SUPABASE_SERVICE_ROLE_KEY)",
      });
    }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({ error: "Missing authentication" });
    }
    const token = authHeader.slice(7).trim();

    const orgId = req.headers["x-org-id"];
    if (!orgId) return res.status(400).json({ error: "Missing x-org-id header" });

    // Admin client (bypass RLS) - universal, estable para endpoints server
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Validar usuario desde el token
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return res.status(401).json({ error: "Invalid user" });

    // Validar membresía contra org_users (canónico)
    const { data: membership, error: memberErr } = await admin
      .from("org_users")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .single();

    if (memberErr || !membership) {
      return res.status(403).json({ error: "User not member of organization" });
    }

    const action = String(req.query.action || "").toLowerCase();

    // FILTERS
    if (action === "filters") {
      const [geocercasRes, personasRes, activitiesRes, asignacionesRes] = await Promise.all([
        admin.from("geocercas").select("id, nombre, org_id").eq("org_id", orgId).eq("is_deleted", false).order("nombre"),
        admin.from("personal").select("id, nombre, apellido, email, org_id").eq("org_id", orgId).eq("is_deleted", false).order("nombre"),
        admin.from("activities").select("id, name, hourly_rate, currency_code, org_id").eq("org_id", orgId).eq("active", true).order("name"),
        admin.from("asignaciones").select("id, status, personal_id, geocerca_id, activity_id, org_id").eq("org_id", orgId).eq("is_deleted", false).order("created_at", { ascending: false }),
      ]);

      const errors = [];
      if (geocercasRes.error) errors.push(geocercasRes.error.message);
      if (personasRes.error) errors.push(personasRes.error.message);
      if (activitiesRes.error) errors.push(activitiesRes.error.message);
      if (asignacionesRes.error) errors.push(asignacionesRes.error.message);

      if (errors.length) return res.status(400).json({ error: "Failed loading filters", details: errors });

      return res.status(200).json({
        data: {
          geocercas: geocercasRes.data || [],
          personas: personasRes.data || [],
          activities: activitiesRes.data || [],
          asignaciones: asignacionesRes.data || [],
        },
      });
    }

    // REPORT
    if (action === "report") {
      const start = req.query.start ? String(req.query.start) : "";
      const end = req.query.end ? String(req.query.end) : "";
      if (start && end && start > end) return res.status(400).json({ error: "Invalid date range" });

      const geocercaIds = parseCsvParam(req.query.geocerca_ids);
      const personalIds = parseCsvParam(req.query.personal_ids);
      const activityIds = parseCsvParam(req.query.activity_ids);
      const asignacionIds = parseCsvParam(req.query.asignacion_ids);

      const limit = normalizeLimit(req.query.limit);
      const offset = normalizeOffset(req.query.offset);

      let query = admin
        .from("v_reportes_diario_con_asignacion")
        .select("*")
        .eq("org_id", orgId)
        .order("work_day", { ascending: false });

      if (start) query = query.gte("work_day", start);
      if (end) query = query.lte("work_day", end);
      if (geocercaIds.length) query = query.in("geocerca_id", geocercaIds);
      if (personalIds.length) query = query.in("personal_id", personalIds);
      if (activityIds.length) query = query.in("activity_id", activityIds);
      if (asignacionIds.length) query = query.in("asignacion_id", asignacionIds);

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({ data: data || [], meta: { limit, offset, returned: (data || []).length } });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (e) {
    console.error("[api/reportes]", e);
    return res.status(500).json({ error: "Server error", details: e.message });
  }
}
