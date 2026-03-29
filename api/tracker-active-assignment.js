// api/tracker-active-assignment.js
// Endpoint seguro para obtener la asignación activa del tracker

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Only POST allowed' });
    }
    console.log('[taa] step: check method');

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing_bearer_token" });
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
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'Missing org_id in body' });
    }
    console.log('[taa] step: got org_id', org_id);


    console.log('[taa] step: reading env');
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
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
      return res.status(401).json({ ok: false, error: 'invalid_jwt', message: 'No sub in JWT' });
    }
    console.log('[taa] step: resolved tracker_user_id', trackerUserId);

    // Buscar personal vinculado a este tracker_user_id (auth user id) y org
    const personalUrl = `${SUPABASE_URL}/rest/v1/personal?user_id=eq.${encodeURIComponent(trackerUserId)}&org_id=eq.${encodeURIComponent(org_id)}&is_deleted=eq.false&select=id,user_id,email`;
    const personalResp = await fetch(personalUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!personalResp.ok) {
      console.log("[taa] step: personal fetch error", personalUrl, personalResp.status);
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando personal' });
    }
    let personalRows = await personalResp.json();
    let personal = personalRows && personalRows[0];
    console.log('[taa] step: fetched personal', { trackerUserId, org_id, found: !!personal });
    if (!personal || !personal.id || personal.user_id !== trackerUserId) {
      console.log("[taa] step: no personal found for tracker_user_id", { org_id, trackerUserId });
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: "no_personal_found",
        org_id,
        tracker_user_id: trackerUserId
      });
    }
    const personal_id = personal.id;

    // Paso 1: Buscar tracker_assignments activos para este tracker_user_id y org_id
    const trackerAssignmentsUrl = `${SUPABASE_URL}/rest/v1/tracker_assignments?org_id=eq.${encodeURIComponent(org_id)}&tracker_user_id=eq.${encodeURIComponent(trackerUserId)}&active=eq.true&select=id,org_id,tracker_user_id,activity_id,geofence_id,active,start_date,end_date,period,period_tstz,frequency_minutes`;
    console.log('[taa] step: tracker_assignments url', trackerAssignmentsUrl);
    console.log('[taa] step: tracker_assignments fetch start');
    const trackerAssignmentsResp = await fetch(trackerAssignmentsUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    console.log('[taa] step: tracker_assignments fetch status', trackerAssignmentsResp.status);
    if (!trackerAssignmentsResp.ok) {
      console.log("[taa] step: tracker_assignments fetch error", trackerAssignmentsUrl, trackerAssignmentsResp.status);
      const errorText = await trackerAssignmentsResp.text();
      console.log("[taa] step: tracker_assignments error body", errorText);
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando tracker_assignments' });
    }
    const trackerAssignmentsRows = await trackerAssignmentsResp.json();
    console.log('[taa] step: got trackerAssignmentsRows', trackerAssignmentsRows);
    if (!trackerAssignmentsRows.length) {
      console.log("[taa] step: no tracker_assignments linked");
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: "no_assignment_linked",
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
        reason: "no_activity_id_in_assignments",
        org_id,
        tracker_user_id: trackerUserId,
        personal_id
      });
    }

    // Paso 3: Buscar en asignaciones usando org_id, user_id, activity_id y (opcional) geofence_id
    const nowIso = new Date().toISOString();
    let asignacionesUrl = `${SUPABASE_URL}/rest/v1/asignaciones?org_id=eq.${encodeURIComponent(org_id)}&user_id=eq.${encodeURIComponent(trackerUserId)}&activity_id=in.(${activityIds.map(id => encodeURIComponent(id)).join(',')})`;
    if (geofenceIds.length) {
      asignacionesUrl += `&geofence_id=in.(${geofenceIds.map(id => encodeURIComponent(id)).join(',')})`;
    }
    asignacionesUrl += `&select=*`;
    console.log('[taa] step: asignaciones url', asignacionesUrl);
    const asignacionesResp = await fetch(asignacionesUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!asignacionesResp.ok) {
      console.log("[taa] step: asignaciones fetch error", asignacionesUrl, asignacionesResp.status);
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando asignaciones' });
    }
    const asignacionesRows = await asignacionesResp.json();
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
