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
 * - GET /api/reportes?action=costs&start=YYYY-MM-DD&end=YYYY-MM-DD
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

async function resolveCurrentOrgId(supabase) {
  const a = await supabase.rpc("get_current_org_id");
  if (!a.error && a.data) return a.data;

  const b = await supabase.rpc("current_org_id");
  if (!b.error && b.data) return b.data;

  return null;
}


function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
}

async function resolvePersonalIdsFromEmails(supabase, orgId, emails) {
  const normalizedEmails = uniqueStrings(emails.map(normalizeLower));
  if (!normalizedEmails.length) return [];

  const [normRes, rawRes] = await Promise.all([
    supabase
      .from("personal")
      .select("id, email_norm")
      .eq("org_id", orgId)
      .in("email_norm", normalizedEmails),
    supabase
      .from("personal")
      .select("id, email")
      .eq("org_id", orgId)
      .in("email", normalizedEmails),
  ]);

  const errors = [normRes.error, rawRes.error].filter(Boolean);
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join(" | "));
  }

  return uniqueStrings([
    ...(normRes.data || []).map((row) => row?.id),
    ...(rawRes.data || []).map((row) => row?.id),
  ]);
}

async function resolveGeofenceFilterIdsFromNames(supabase, orgId, geocercaNames) {
  const names = uniqueStrings(geocercaNames);
  if (!names.length) return { geofenceIds: [], sourceGeocercaIds: [] };

  const { data, error } = await supabase
    .from("geofences")
    .select("id, source_geocerca_id, name")
    .eq("org_id", orgId)
    .in("name", names);

  if (error) throw error;

  return {
    geofenceIds: uniqueStrings((data || []).map((row) => row?.id)),
    sourceGeocercaIds: uniqueStrings((data || []).map((row) => row?.source_geocerca_id)),
  };
}

function buildGeofenceOrFilter(ids) {
  const cleanIds = uniqueStrings(ids);
  if (!cleanIds.length) return null;
  const packed = cleanIds.join(",");
  return `geofence_id.in.(${packed}),geocerca_id.in.(${packed})`;
}

async function resolveAllowedAssignmentIdsForReportFilters({
  supabase,
  orgId,
  geocercaIds,
  geocercaNames,
  personalIds,
  emails,
  asignacionIds,
}) {
  const hasAssignmentScopedFilter =
    geocercaIds.length > 0 ||
    geocercaNames.length > 0 ||
    personalIds.length > 0 ||
    emails.length > 0 ||
    asignacionIds.length > 0;

  if (!hasAssignmentScopedFilter) return null;

  const emailPersonalIds = await resolvePersonalIdsFromEmails(supabase, orgId, emails);
  const combinedPersonalIds = uniqueStrings([...personalIds, ...emailPersonalIds]);

  if (emails.length > 0 && combinedPersonalIds.length === 0) return new Set();

  const geofenceNameFilters = await resolveGeofenceFilterIdsFromNames(
    supabase,
    orgId,
    geocercaNames
  );

  if (
    geocercaNames.length > 0 &&
    geofenceNameFilters.geofenceIds.length === 0 &&
    geofenceNameFilters.sourceGeocercaIds.length === 0
  ) {
    return new Set();
  }

  let query = supabase
    .from("asignaciones")
    .select("id, geofence_id, geocerca_id, personal_id, is_deleted")
    .eq("org_id", orgId);

  if (asignacionIds.length) query = query.in("id", asignacionIds);
  if (combinedPersonalIds.length) query = query.in("personal_id", combinedPersonalIds);

  const directGeofenceFilter = buildGeofenceOrFilter(geocercaIds);
  if (directGeofenceFilter) query = query.or(directGeofenceFilter);

  const geofenceNameIds = uniqueStrings([
    ...geofenceNameFilters.geofenceIds,
    ...geofenceNameFilters.sourceGeocercaIds,
  ]);
  const nameBasedGeofenceFilter = buildGeofenceOrFilter(geofenceNameIds);
  if (nameBasedGeofenceFilter) query = query.or(nameBasedGeofenceFilter);

  const { data, error } = await query;
  if (error) throw error;

  return new Set(
    (data || [])
      .filter((row) => row?.id && row?.is_deleted !== true)
      .map((row) => String(row.id))
  );
}

function sortReportRowsDesc(rows = []) {
  return [...rows].sort((a, b) =>
    String(b?.work_date || b?.date || "").localeCompare(String(a?.work_date || a?.date || ""))
  );
}

function formatPersonalDisplayName(row) {
  if (!row) return "—";
  const fullName = [row.nombre, row.apellido]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  return fullName || String(row.email || "").trim() || "—";
}

async function enrichReportRowsWithNames({ supabase, orgId, rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return [];

  const trackerUserIds = uniqueStrings(safeRows.map((row) => row?.tracker_user_id));
  const assignmentIds = uniqueStrings(safeRows.map((row) => row?.assignment_id));
  const activityIds = uniqueStrings(safeRows.map((row) => row?.activity_id));

  const [personasByUserRes, asignacionesRes, activitiesRes] = await Promise.all([
    trackerUserIds.length
      ? supabase
          .from("personal")
          .select("id, user_id, nombre, apellido, email")
          .eq("org_id", orgId)
          .in("user_id", trackerUserIds)
      : Promise.resolve({ data: [], error: null }),
    assignmentIds.length
      ? supabase
          .from("asignaciones")
          .select("id, geofence_id, geocerca_id, personal_id, activity_id")
          .eq("org_id", orgId)
          .in("id", assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    activityIds.length
      ? supabase
          .from("activities")
          .select("id, name")
          .eq("org_id", orgId)
          .in("id", activityIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstPassErrors = [
    personasByUserRes.error && { source: "personal_by_user", error: personasByUserRes.error.message },
    asignacionesRes.error && { source: "asignaciones", error: asignacionesRes.error.message },
    activitiesRes.error && { source: "activities", error: activitiesRes.error.message },
  ].filter(Boolean);

  if (firstPassErrors.length) {
    throw new Error(
      `No se pudieron resolver nombres del reporte: ${firstPassErrors
        .map((item) => `${item.source}: ${item.error}`)
        .join(" | ")}`
    );
  }

  const asignaciones = asignacionesRes.data || [];
  const assignmentPersonalIds = uniqueStrings(asignaciones.map((row) => row?.personal_id));
  const geofenceIds = uniqueStrings(asignaciones.map((row) => row?.geofence_id));
  const geocercaIds = uniqueStrings(asignaciones.map((row) => row?.geocerca_id));

  const [personasByIdRes, geofencesRes, geocercasRes] = await Promise.all([
    assignmentPersonalIds.length
      ? supabase
          .from("personal")
          .select("id, user_id, nombre, apellido, email")
          .eq("org_id", orgId)
          .in("id", assignmentPersonalIds)
      : Promise.resolve({ data: [], error: null }),
    geofenceIds.length
      ? supabase
          .from("geofences")
          .select("id, name, source_geocerca_id")
          .eq("org_id", orgId)
          .in("id", geofenceIds)
      : Promise.resolve({ data: [], error: null }),
    geocercaIds.length
      ? supabase
          .from("geocercas")
          .select("id, nombre, name")
          .eq("org_id", orgId)
          .in("id", geocercaIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const secondPassErrors = [
    personasByIdRes.error && { source: "personal_by_id", error: personasByIdRes.error.message },
    geofencesRes.error && { source: "geofences", error: geofencesRes.error.message },
    geocercasRes.error && { source: "geocercas", error: geocercasRes.error.message },
  ].filter(Boolean);

  if (secondPassErrors.length) {
    throw new Error(
      `No se pudieron resolver dimensiones del reporte: ${secondPassErrors
        .map((item) => `${item.source}: ${item.error}`)
        .join(" | ")}`
    );
  }

  const personalRowsById = new Map();
  for (const row of [...(personasByUserRes.data || []), ...(personasByIdRes.data || [])]) {
    if (row?.id) personalRowsById.set(String(row.id), row);
  }
  const personas = Array.from(personalRowsById.values());

  const personaByUserId = new Map(
    personas
      .filter((row) => row?.user_id)
      .map((row) => [String(row.user_id), row])
  );
  const personaById = new Map(
    personas
      .filter((row) => row?.id)
      .map((row) => [String(row.id), row])
  );
  const assignmentById = new Map(
    asignaciones
      .filter((row) => row?.id)
      .map((row) => [String(row.id), row])
  );
  const activityById = new Map(
    (activitiesRes.data || [])
      .filter((row) => row?.id)
      .map((row) => [String(row.id), row])
  );
  const geofenceById = new Map(
    (geofencesRes.data || [])
      .filter((row) => row?.id)
      .map((row) => [String(row.id), row])
  );
  const geocercaById = new Map(
    (geocercasRes.data || [])
      .filter((row) => row?.id)
      .map((row) => [String(row.id), row])
  );

  return safeRows.map((row) => {
    const assignment = assignmentById.get(String(row?.assignment_id || ""));
    const tracker =
      personaByUserId.get(String(row?.tracker_user_id || "")) ||
      personaById.get(String(assignment?.personal_id || ""));
    const activity = activityById.get(String(row?.activity_id || assignment?.activity_id || ""));
    const geofence = assignment?.geofence_id
      ? geofenceById.get(String(assignment.geofence_id))
      : null;
    const geocercaByAssignment = assignment?.geocerca_id
      ? geocercaById.get(String(assignment.geocerca_id))
      : null;
    const geocercaBySource = geofence?.source_geocerca_id
      ? geocercaById.get(String(geofence.source_geocerca_id))
      : null;
    const geocerca = geocercaByAssignment || geocercaBySource || null;

    const trackerNombre =
      String(row?.tracker_nombre || row?.personal_nombre || "").trim() ||
      formatPersonalDisplayName(tracker);
    const geocercaNombre =
      String(
        row?.geofence_nombre ||
          row?.geocerca_nombre ||
          geofence?.name ||
          geocerca?.nombre ||
          geocerca?.name ||
          ""
      ).trim() || "—";
    const actividadNombre =
      String(row?.activity_nombre || row?.actividad_nombre || activity?.name || "").trim() || "—";

    return {
      ...row,
      personal_id: assignment?.personal_id || tracker?.id || row?.personal_id || null,
      personal_nombre: trackerNombre,
      tracker_nombre: trackerNombre,
      actividad_id: row?.actividad_id || row?.activity_id || assignment?.activity_id || null,
      actividad_nombre: actividadNombre,
      activity_nombre: actividadNombre,
      geofence_id: assignment?.geofence_id || row?.geofence_id || null,
      geocerca_id:
        assignment?.geocerca_id ||
        geofence?.source_geocerca_id ||
        row?.geocerca_id ||
        null,
      geocerca_nombre: geocercaNombre,
      geofence_nombre: geocercaNombre,
    };
  });
}


export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const action = String(req.query.action || "").toLowerCase();

    const SUPABASE_URL = getEnv([
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SB_URL",
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
      return res.status(401).json({
        ok: false,
        error: "Missing authentication (cookie tg_at or Authorization Bearer)",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    // ======================
    // action=filters
    // ======================
    if (action === "filters") {
      const orgId = await resolveCurrentOrgId(supabase);
      if (!orgId) {
        return res.status(401).json({
          error: "No hay org activa. Selecciona una organización e inténtalo de nuevo.",
          hint: "La org activa se obtiene con get_current_org_id() (persistente).",
        });
      }

      const [geocercasRes, personasRes, activitiesRes, asignacionesRes] =
        await Promise.all([
          supabase
            .from("geocercas")
            .select("id, nombre")
            .eq("org_id", orgId)
            .order("nombre", { ascending: true }),

          supabase
            .from("personal")
            .select("id, nombre, apellido, email, email_norm, activo, vigente, is_deleted")
            .eq("org_id", orgId)
            .order("nombre", { ascending: true }),

          supabase
            .from("activities")
            .select("id, name, active, hourly_rate, currency_code")
            .eq("org_id", orgId)
            .order("name", { ascending: true }),

          supabase
            .from("asignaciones")
            .select(
              "id, status, estado, geocerca_id, personal_id, activity_id, start_time, end_time, period, is_deleted"
            )
            .eq("org_id", orgId)
            .order("created_at", { ascending: false }),
        ]);

      const errors = [];
      if (geocercasRes.error) errors.push({ source: "geocercas", error: geocercasRes.error.message });
      if (personasRes.error) errors.push({ source: "personal", error: personasRes.error.message });
      if (activitiesRes.error) errors.push({ source: "activities", error: activitiesRes.error.message });
      if (asignacionesRes.error) {
        errors.push({ source: "asignaciones", error: asignacionesRes.error.message });
      }

      if (errors.length) {
        return res.status(400).json({ error: "Failed to load filters", details: errors });
      }

      const geocercas = geocercasRes.data || [];
      const personas = (personasRes.data || []).filter((p) => !p?.is_deleted);
      const activities = activitiesRes.data || [];
      const asignaciones = (asignacionesRes.data || []).filter((a) => !a?.is_deleted);

      return res.status(200).json({
        data: { geocercas, personas, activities, asignaciones },
        meta: { org_id: orgId },
      });
    }

    // ======================
    // action=report
    // ======================
    if (action === "report") {
      const start = req.query.start ? String(req.query.start) : "";
      const end = req.query.end ? String(req.query.end) : "";

      if (!start || !end) {
        return res.status(400).json({
          ok: false,
          error: "Missing required parameters: start, end",
        });
      }

      if (start > end) {
        return res.status(400).json({
          ok: false,
          error: 'La fecha "Desde" no puede ser mayor que "Hasta".',
        });
      }

      const orgId = await resolveCurrentOrgId(supabase);
      if (!orgId) {
        return res.status(401).json({
          ok: false,
          error: "No active org for report.",
        });
      }

      const geocercaIds = parseCsvParam(req.query.geocerca_ids);
      const geocercaNames = parseCsvParam(req.query.geocerca_names);
      const personalIds = parseCsvParam(req.query.personal_ids);
      const emails = parseCsvParam(req.query.emails).map((e) => e.toLowerCase());
      const activityIds = parseCsvParam(req.query.activity_ids);
      const asignacionIds = parseCsvParam(req.query.asignacion_ids);

      const limit = normalizeLimit(req.query.limit, 200, 1000);
      const offset = normalizeOffset(req.query.offset);

      const { data: rpcRows, error: rpcError } = await supabase.rpc(
        "calculate_tracker_costs_preview",
        {
          p_org_id: orgId,
          p_date_from: start,
          p_date_to: end,
        }
      );

      if (rpcError) {
        return res.status(500).json({
          ok: false,
          error: rpcError.message || "RPC error",
        });
      }

      let rows = Array.isArray(rpcRows) ? rpcRows : [];

      const allowedAssignmentIds = await resolveAllowedAssignmentIdsForReportFilters({
        supabase,
        orgId,
        geocercaIds,
        geocercaNames,
        personalIds,
        emails,
        asignacionIds,
      });

      if (allowedAssignmentIds) {
        rows = rows.filter((row) => allowedAssignmentIds.has(String(row?.assignment_id || "")));
      }

      if (activityIds.length) {
        const allowedActivityIds = new Set(activityIds.map(String));
        rows = rows.filter((row) => allowedActivityIds.has(String(row?.activity_id || "")));
      }

      rows = sortReportRowsDesc(rows).map((row) => ({
        ...row,
        date: row?.work_date || null,
        // Campo legacy que Reports.jsx sabe mostrar como "—" cuando no viene desde la RPC.
        minutos_sin_cobertura: row?.minutos_sin_cobertura ?? null,
      }));

      rows = await enrichReportRowsWithNames({ supabase, orgId, rows });

      const totalFiltered = rows.length;
      const pagedRows = rows.slice(offset, offset + limit);

      return res.status(200).json({
        ok: true,
        data: pagedRows,
        meta: {
          source: "calculate_tracker_costs_preview",
          limit,
          offset,
          returned: pagedRows.length,
          total_filtered: totalFiltered,
          org_id: orgId,
        },
      });
    }

    // ======================
    // action=costs
    // ======================
    if (action === "costs") {
      const start = req.query.start ? String(req.query.start) : "";
      const end = req.query.end ? String(req.query.end) : "";

      if (!start || !end) {
        return res.status(400).json({
          ok: false,
          error: "Missing required parameters: start, end",
        });
      }

      if (start > end) {
        return res.status(400).json({
          ok: false,
          error: 'La fecha "Desde" no puede ser mayor que "Hasta".',
        });
      }

      const orgId = await resolveCurrentOrgId(supabase);
      if (!orgId) {
        return res.status(401).json({
          ok: false,
          error: "No active org for cost report.",
        });
      }

      const geocercaIds = parseCsvParam(req.query.geocerca_ids);
      const geocercaNames = parseCsvParam(req.query.geocerca_names);
      const personalIds = parseCsvParam(req.query.personal_ids);
      const emails = parseCsvParam(req.query.emails).map((e) => e.toLowerCase());
      const activityIds = parseCsvParam(req.query.activity_ids);
      const asignacionIds = parseCsvParam(req.query.asignacion_ids);

      const { data: rpcRows, error: rpcError } = await supabase.rpc(
        "calculate_tracker_costs_preview",
        {
          p_org_id: orgId,
          p_date_from: start,
          p_date_to: end,
        }
      );

      if (rpcError) {
        return res.status(500).json({
          ok: false,
          error: rpcError.message || "RPC error",
        });
      }

      let rows = Array.isArray(rpcRows) ? rpcRows : [];

      const allowedAssignmentIds = await resolveAllowedAssignmentIdsForReportFilters({
        supabase,
        orgId,
        geocercaIds,
        geocercaNames,
        personalIds,
        emails,
        asignacionIds,
      });

      if (allowedAssignmentIds) {
        rows = rows.filter((row) => allowedAssignmentIds.has(String(row?.assignment_id || "")));
      }

      if (activityIds.length) {
        const allowedActivityIds = new Set(activityIds.map(String));
        rows = rows.filter((row) => allowedActivityIds.has(String(row?.activity_id || "")));
      }

      rows = rows.map((row) => ({
        ...row,
        horas: row?.horas ?? row?.horas_observadas ?? 0,
        costo_base: row?.costo_base ?? row?.costo_total ?? 0,
        costo_final: row?.costo_final ?? row?.costo_total ?? 0,
      }));

      rows = await enrichReportRowsWithNames({ supabase, orgId, rows });

      return res.status(200).json({
        ok: true,
        data: rows,
        meta: {
          source: "calculate_tracker_costs_preview",
          returned: rows.length,
          org_id: orgId,
        },
      });
    }

    return res.status(400).json({
      error: "Invalid action. Use action=filters, action=report or action=costs",
    });
  } catch (e) {
    console.error("[api/reportes] fatal:", e);
    return res.status(500).json({
      error: "Unexpected server error",
      details: e?.message || String(e),
    });
  }
}