// api/tracker-active-assignment.js
// Endpoint seguro para obtener la asignación activa del tracker

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Only POST allowed' });
  }

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "missing_bearer_token" });
  }
  const jwt = authHeader.slice("Bearer ".length).trim();

  let org_id;
  try {
    ({ org_id } = req.body || {});
    if (!org_id) throw new Error('Missing org_id');
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'bad_request', message: 'Missing org_id in body' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !serviceKey) {
    return res.status(500).json({ ok: false, error: 'backend_error', message: 'Missing Supabase env vars' });
  }

  // --- CRÍTICO: Resolver tracker_user_id desde JWT (auth user id) ---
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

  // 1. Buscar personal vinculado a este tracker_user_id (auth user id) y org
  const personalUrl = `${SUPABASE_URL}/rest/v1/personal?user_id=eq.${encodeURIComponent(trackerUserId)}&org_id=eq.${encodeURIComponent(org_id)}&is_deleted=eq.false&select=id,user_id,email`;
  const personalResp = await fetch(personalUrl, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!personalResp.ok) {
    console.log("[api/tracker-active-assignment] personal fetch error", personalUrl, personalResp.status);
    return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando personal' });
  }
  let personalRows = await personalResp.json();
  let personal = personalRows && personalRows[0];
  console.log("[tracker-active-assignment] tracker_user_id:", trackerUserId, "org_id:", org_id);
  if (personal) {
    console.log("[tracker-active-assignment] personal resolved:", { id: personal.id, user_id: personal.user_id, email: personal.email });
  }
  if (!personal || !personal.id || personal.user_id !== trackerUserId) {
    console.log("[tracker-active-assignment] No personal found for tracker_user_id", { org_id, trackerUserId });
    console.log("[tracker-active-assignment] final reason: no_personal_found");
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

  // 2. Nuevo flujo: obtener assignment_ids de tracker_assignments y consultar asignaciones como fuente de verdad
  // Paso 1: obtener assignment_ids
  const trackerAssignmentsUrl = `${SUPABASE_URL}/rest/v1/tracker_assignments?org_id=eq.${encodeURIComponent(org_id)}&tracker_user_id=eq.${encodeURIComponent(trackerUserId)}&select=assignment_id`;
  const trackerAssignmentsResp = await fetch(trackerAssignmentsUrl, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!trackerAssignmentsResp.ok) {
    console.log("[api/tracker-active-assignment] tracker_assignments fetch error", trackerAssignmentsUrl, trackerAssignmentsResp.status);
    return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando tracker_assignments' });
  }
  const trackerAssignmentsRows = await trackerAssignmentsResp.json();
  const assignmentIds = (trackerAssignmentsRows || []).map(row => row.assignment_id).filter(Boolean);
  console.log("[tracker-active-assignment] assignmentIds from tracker_assignments:", assignmentIds);
  if (!assignmentIds.length) {
    console.log("[tracker-active-assignment] final reason: no_assignment_linked");
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
    console.log("[api/tracker-active-assignment] asignaciones fetch error", asignacionesUrl, asignacionesResp.status);
    return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando asignaciones' });
  }
  const asignacionesRows = await asignacionesResp.json();
  const activeAsignacion = asignacionesRows && asignacionesRows[0];
  if (activeAsignacion) {
    console.log("[tracker-active-assignment] active assignment found in asignaciones:", { id: activeAsignacion.id, tracker_user_id: trackerUserId, org_id: activeAsignacion.org_id });
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
    console.log("[tracker-active-assignment] final reason: no_active_assignment_in_asignaciones");
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
}
