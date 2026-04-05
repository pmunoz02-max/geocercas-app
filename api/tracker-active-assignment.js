// api/tracker-active-assignment.js
// Endpoint seguro para obtener la asignación activa del tracker

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Only POST allowed' });
    }
    console.log('[taa] step: check method');

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      console.log('[taa] step: missing bearer token');
      return res.status(401).json({ 
        ok: true,
        active: false,
        assignment: null,
        reason: "no_session",
        debug: { message: "Missing or invalid Bearer token" }
      });
    }
    const jwt = authHeader.slice("Bearer ".length).trim();
    console.log('[taa] step: got jwt');

    let org_id;
    // No romper si req.body ya es objeto
    if (typeof req.body === 'object' && req.body !== null) {
      org_id = req.body.org_id;
    } else {
      try {
        const parsed = JSON.parse(req.body || '{}');
        org_id = parsed.org_id;
      } catch {
        org_id = undefined;
      }
    }
    if (!org_id) {
      console.log('[taa] step: missing org_id');
      return res.status(200).json({ 
        ok: true,
        active: false,
        assignment: null,
        reason: "missing_org",
        debug: { message: "org_id not provided in request body" }
      });
    }
    console.log('[taa] step: got org_id', org_id);


    console.log('[taa] step: reading env');
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
    console.log('[taa] step: env loaded', {
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceKey: !!serviceKey,
    });
    if (!SUPABASE_URL || !serviceKey) {
      console.log('[taa] step: missing env');
      return res.status(500).json({
        ok: false,
        error: 'backend_error',
        message: 'Missing Supabase env vars',
      });
    }

    const supabase = createClient(SUPABASE_URL, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    console.log('[taa] step: building tracker_assignments query');

    // Resolver tracker_user_id desde JWT (auth user id)
    function decodeJwtPayload(token) {
      try {
        const part = String(token || "").split(".")[1];
        if (!part) return null;
        const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        return JSON.parse(json);
      } catch {
        return null;
      }
    }
    const payload = decodeJwtPayload(jwt);
    const trackerUserId = payload?.sub;
    if (!trackerUserId) {
      console.log('[taa] step: invalid jwt - no sub claim');
      return res.status(200).json({ 
        ok: true,
        active: false,
        assignment: null,
        reason: "no_session",
        debug: { message: "Invalid JWT - no sub claim found" },
        org_id
      });
    }
    console.log('[taa] step: resolved tracker_user_id', trackerUserId);

    // Buscar personal vinculado a este tracker_user_id (auth user id) en la org actual
    console.log('[taa] step: resolving personal record', { auth_user_id: trackerUserId, org_id });
    const { data: personal, error: personalErr } = await supabase
      .from("personal")
      .select("id, user_id, email, org_id")
      .eq("user_id", trackerUserId)
      .eq("org_id", org_id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (personalErr) {
      console.log("[taa] step: personal query error", personalErr);
      return res.status(500).json({ 
        ok: false, 
        error: 'personal_query_failed', 
        message: 'Error querying personal table',
        debug: personalErr
      });
    }

    // Only return no_personal_found if no matching personal record exists in this org for this auth user
    if (!personal) {
      console.log("[taa] step: no personal record found", { auth_user_id: trackerUserId, org_id });
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: "no_personal_found",
        debug: {
          message: "No personal record exists for this user in this org",
          auth_user_id: trackerUserId,
          org_id
        }
      });
    }

    console.log('[taa] step: resolved personal record', { personal_id: personal.id, user_id: personal.user_id, org_id: personal.org_id });
    const personal_id = personal.id;

    // Paso 1: Buscar tracker_assignments activos para este tracker_user_id y org_id
    console.log('[taa] step: tracker_assignments query start');
    const {
      data: trackerAssignmentsRows,
      error: trackerAssignmentsErr,
    } = await supabase
      .from("tracker_assignments")
      .select("id,org_id,tracker_user_id,activity_id,geofence_id,active,start_date,end_date,period,period_tstz,frequency_minutes")
      .eq("org_id", org_id)
      .eq("tracker_user_id", trackerUserId)
      .eq("active", true);

    if (trackerAssignmentsErr) {
      console.log("[taa] step: tracker_assignments query error", trackerAssignmentsErr);
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando tracker_assignments' });
    }

    console.log('[taa] step: got trackerAssignmentsRows', trackerAssignmentsRows);
    if (!trackerAssignmentsRows?.length) {
      console.log("[taa] step: no tracker_assignments linked");
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: "no_active_assignment",
        org_id,
        tracker_user_id: trackerUserId,
        personal_id
      });
    }

    // Paso 2: Tomar activity_id y geofence_id
    const activityIds = trackerAssignmentsRows.map(row => row.activity_id).filter(Boolean);
    const geofenceIds = trackerAssignmentsRows.map(row => row.geofence_id).filter(Boolean);
    console.log('[taa] step: got activityIds', activityIds, 'geofenceIds', geofenceIds);
    if (!activityIds.length) {
      console.log('[taa] step: no activity_id in tracker_assignments');
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: "no_active_assignment",
        org_id,
        tracker_user_id: trackerUserId,
        personal_id
      });
    }

    // Paso 3: Buscar en asignaciones usando org_id, user_id, activity_id y (opcional) geofence_id
    let asignacionesQuery = supabase
      .from("asignaciones")
      .select("*")
      .eq("org_id", org_id)
      .eq("user_id", trackerUserId)
      .in("activity_id", activityIds);

    if (geofenceIds.length) {
      asignacionesQuery = asignacionesQuery.in("geofence_id", geofenceIds);
    }

    const { data: asignacionesRows, error: asignacionesErr } = await asignacionesQuery;
    if (asignacionesErr) {
      console.log("[taa] step: asignaciones query error", asignacionesErr);
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando asignaciones' });
    }

    // Paso 4: Validar ventana activa y status en asignaciones
    const now = new Date();
    const activeAsignacion = (asignacionesRows || []).find(row => {
      // status = 'active' o estado = 'activa'/'active'
      const statusOk = (row.status && row.status.toLowerCase() === 'active') || (row.estado && ['activa','active'].includes(row.estado.toLowerCase()));
      // NOW() entre start_time y end_time
      const start = row.start_time ? new Date(row.start_time) : null;
      const end = row.end_time ? new Date(row.end_time) : null;
      const windowOk = start && end && now >= start && now <= end;
      return statusOk && windowOk;
    });
    if (activeAsignacion) {
      // Buscar el tracker_assignment correspondiente
      const matchingTrackerAssignment = trackerAssignmentsRows.find(row => row.activity_id === activeAsignacion.activity_id && (!activeAsignacion.geofence_id || row.geofence_id === activeAsignacion.geofence_id));
      return res.status(200).json({
        ok: true,
        active: true,
        assignment: activeAsignacion,
        tracker_assignment: matchingTrackerAssignment || null,
        reason: "assignment_found",
        org_id,
        tracker_user_id: trackerUserId,
        personal_id
      });
    } else {
      console.log("[taa] step: no active assignment in asignaciones");
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: "no_active_assignment",
        org_id,
        tracker_user_id: trackerUserId,
        personal_id
      });
    }
  } catch (err) {
    console.log('[taa] catch message', err?.message || String(err));
    console.log('[taa] catch stack', err?.stack || null);
    return res.status(500).json({
      ok: false,
      error: "backend_error_500",
      message: err?.message || "Unhandled server error"
    });
  }
}
