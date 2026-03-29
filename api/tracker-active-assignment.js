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

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !serviceKey) {
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Missing Supabase env vars' });
    }
    console.log('[taa] step: checked env vars');

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

    // Paso 1: obtener assignment_ids de tracker_assignments
    const trackerAssignmentsUrl = `${SUPABASE_URL}/rest/v1/tracker_assignments?org_id=eq.${encodeURIComponent(org_id)}&tracker_user_id=eq.${encodeURIComponent(trackerUserId)}&select=assignment_id`;
    const trackerAssignmentsResp = await fetch(trackerAssignmentsUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!trackerAssignmentsResp.ok) {
      console.log("[taa] step: tracker_assignments fetch error", trackerAssignmentsUrl, trackerAssignmentsResp.status);
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando tracker_assignments' });
    }
    const trackerAssignmentsRows = await trackerAssignmentsResp.json();
    const assignmentIds = (trackerAssignmentsRows || []).map(row => row.assignment_id).filter(Boolean);
    console.log('[taa] step: got assignmentIds', assignmentIds);
    if (!assignmentIds.length) {
      console.log("[taa] step: no assignment linked");
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

    // Paso 2: consultar asignaciones como fuente de verdad
    const nowIso = new Date().toISOString();
    const asignacionesUrl = `${SUPABASE_URL}/rest/v1/asignaciones?id=in.(${assignmentIds.map(id => encodeURIComponent(id)).join(',')})&org_id=eq.${encodeURIComponent(org_id)}&active=eq.true&start_time=lte.${encodeURIComponent(nowIso)}&end_time=gte.${encodeURIComponent(nowIso)}&select=*`;
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
    const activeAsignacion = asignacionesRows && asignacionesRows[0];
    console.log('[taa] step: checked asignaciones, found:', !!activeAsignacion);
    if (activeAsignacion) {
      return res.status(200).json({
        ok: true,
        active: true,
        assignment: activeAsignacion,
        reason: "assignment_found",
        org_id,
        tracker_user_id: trackerUserId,
        personal_id,
        assignment_id: activeAsignacion.id
      });
    } else {
      console.log("[taa] step: no active assignment in asignaciones");
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: "no_active_assignment_in_asignaciones",
        org_id,
        tracker_user_id: trackerUserId,
        personal_id
      });
    }
  } catch (err) {
    console.log('[taa] step: error', err);
    return res.status(500).json({
      ok: false,
      error: "backend_error_500",
      message: err?.message || "Unhandled server error"
    });
  }
}
