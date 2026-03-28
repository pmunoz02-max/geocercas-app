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
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ ok: false, error: 'missing_env', message: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' });
  }

  // Decodificar sub del JWT
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
    return res.status(401).json({ ok: false, error: "invalid_tracker_jwt" });
  }

  console.log("[api/tracker-active-assignment] start", { hasAuth: !!authHeader, org_id });
  console.log("[api/tracker-active-assignment] tracker_user_id", trackerUserId);

  // Nueva lógica: tracker_assignments primero, luego fallback a personal/asignaciones
  try {
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      SUPABASE_ANON_KEY;

    // 1. Buscar asignación activa en tracker_assignments
    const nowIso = new Date().toISOString();
    const trackerAssignmentsUrl = `${SUPABASE_URL}/rest/v1/tracker_assignments?org_id=eq.${encodeURIComponent(org_id)}&tracker_user_id=eq.${encodeURIComponent(trackerUserId)}&active=eq.true&start_date=lte.${nowIso.slice(0,10)}&or=(end_date.gte.${nowIso.slice(0,10)},end_date.is.null)&select=*`;
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
    console.log("[api/tracker-active-assignment] tracker_assignments rows", trackerAssignmentsRows);
    const trackerAssignment = trackerAssignmentsRows && trackerAssignmentsRows[0];
    if (trackerAssignment) {
      return res.status(200).json({ ok: true, active: true, assignment: trackerAssignment });
    } else {
      console.log("[api/tracker-active-assignment] No tracker_assignment found", {
        org_id,
        trackerUserId,
        nowIso,
        trackerAssignmentsUrl,
        trackerAssignmentsRows
      });
    }

    // 2. Fallback: Buscar en tabla personal
    const personalUrl = `${SUPABASE_URL}/rest/v1/personal?user_id=eq.${encodeURIComponent(trackerUserId)}&org_id=eq.${encodeURIComponent(org_id)}&is_deleted=eq.false&select=id`;
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
    const personalRows = await personalResp.json();
    console.log("[api/tracker-active-assignment] personal rows", personalRows);
    const personal = personalRows && personalRows[0];
    if (!personal || !personal.id) {
      console.log("[api/tracker-active-assignment] No personal found", { org_id, trackerUserId, personalRows });
      return res.status(200).json({ ok: true, active: false, assignment: null, reason: "no_personal_found", org_id, trackerUserId });
    }
    const personal_id = personal.id;

    // 3. Buscar asignación activa en asignaciones
    const asignacionesUrl = `${SUPABASE_URL}/rest/v1/asignaciones?org_id=eq.${encodeURIComponent(org_id)}&personal_id=eq.${encodeURIComponent(personal_id)}&is_deleted=eq.false&or=(status.eq.activa,estado.eq.activa)&start_time=lte.${encodeURIComponent(nowIso)}&end_time=gte.${encodeURIComponent(nowIso)}&select=*`;
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
    console.log("[api/tracker-active-assignment] asignaciones rows", asignacionesRows);
    const asignacion = asignacionesRows && asignacionesRows[0];
    if (asignacion) {
      return res.status(200).json({ ok: true, active: true, assignment: asignacion });
    } else {
      console.log("[api/tracker-active-assignment] No active asignacion found", {
        org_id,
        trackerUserId,
        personal_id,
        nowIso,
        asignacionesUrl,
        asignacionesRows
      });
      return res.status(200).json({ ok: true, active: false, assignment: null, reason: "no_active_asignacion", org_id, trackerUserId, personal_id });
    }
  } catch (e) {
    console.log("[api/tracker-active-assignment] error", e);
    return res.status(500).json({ ok: false, error: 'backend_error', message: e.message });
  }
}
