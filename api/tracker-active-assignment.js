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
      // 1. Require personal.user_id linkage for this tracker user in this org
      const personalUrl = `${SUPABASE_URL}/rest/v1/personal?user_id=eq.${encodeURIComponent(trackerUserId)}&org_id=eq.${encodeURIComponent(org_id)}&is_deleted=eq.false&select=id,user_id`;

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
      // Only resolve assignment if personal exists and user_id is linked
      if (!personal || !personal.id || !personal.user_id || personal.user_id !== trackerUserId) {
        console.log("[api/tracker-active-assignment] No linked personal found", { org_id, trackerUserId, personalRows });
        return res.status(200).json({ ok: true, active: false, assignment: null, reason: "no_linked_personal", org_id, trackerUserId });
      }
      const personal_id = personal.id;
    });
    if (!personalResp.ok) {
      console.log("[api/tracker-active-assignment] personal fetch error", personalUrl, personalResp.status);
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando personal' });
    }

    let personalRows = await personalResp.json();
    console.log("[tracker-active-assignment] tracker_user_id:", trackerUserId, "org_id:", org_id);
    let personal = personalRows && personalRows[0];
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

    // 2. Find active tracker_assignments for this tracker_user_id and org_id
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const trackerAssignmentsUrl = `${SUPABASE_URL}/rest/v1/tracker_assignments?org_id=eq.${encodeURIComponent(org_id)}&tracker_user_id=eq.${encodeURIComponent(trackerUserId)}&active=eq.true&select=*`;
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
    // Safe debug log for tracker assignments count
    console.log("[tracker-active-assignment] tracker_assignments found:", Array.isArray(trackerAssignmentsRows) ? trackerAssignmentsRows.length : 0);
    // Find the first assignment that is active for the current date/time
    const now = new Date();
    const nowIso = now.toISOString();
    const today = nowIso.slice(0, 10);
    const activeAssignment = trackerAssignmentsRows && trackerAssignmentsRows.find(row => {
      if (row.active !== true) return false;
      // Validate by period_tstz (Postgres tstzrange)
      if (row.period_tstz && typeof row.period_tstz === 'string') {
        // Expect format: ["2026-03-28T00:00:00+00:00","2026-03-29T00:00:00+00:00")
        const m = row.period_tstz.match(/\["(.+?)","(.+?)"[)\]]/);
        if (m && m[1] && m[2]) {
          return nowIso >= m[1] && nowIso < m[2];
        }
      }
      // Validate by period (date range string)
      if (row.period && typeof row.period === 'string') {
        // Expect format: ["2026-03-28","2026-03-29")
        const m = row.period.match(/\["(.+?)","(.+?)"[)\]]/);
        if (m && m[1] && m[2]) {
          return today >= m[1] && today < m[2];
        }
      }
      // Validate by start_date/end_date (date only)
      if (row.start_date && row.end_date) {
        return row.start_date <= today && row.end_date >= today;
      }
      if (row.start_date && !row.end_date) {
        return row.start_date <= today;
      }
      if (!row.start_date && row.end_date) {
        return row.end_date >= today;
      }
      // If no range fields, treat as not active
      return false;
    });
    if (activeAssignment) {
      console.log("[tracker-active-assignment] active tracker assignment found:", { id: activeAssignment.id, tracker_user_id: activeAssignment.tracker_user_id, org_id: activeAssignment.org_id });
      console.log("[tracker-active-assignment] final reason: assignment_found");
    } else {
      console.log("[tracker-active-assignment] final reason: no_active_assignment");
    }
    if (!activeAssignment) {
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
    return res.status(200).json({
      ok: true,
      active: true,
      assignment: activeAssignment,
      reason: "assignment_found",
      org_id,
      tracker_user_id: trackerUserId,
      personal_id,
      assignment_id: activeAssignment.id
    });
    }

    // 3. Fallback: direct query to asignaciones (in case tracker_assignments is missing or not linked)
    // 3. Fallback: direct query to asignaciones (in case tracker_assignments is missing or not linked)
    // Use asignaciones.start_time and end_time as the active window
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
      return res.status(200).json({
        ok: true,
        active: true,
        assignment: asignacion,
        reason: "direct_asignacion",
        tracker_user_id: trackerUserId,
        org_id,
        tracker_assignment_id: null,
        assignment_id: asignacion.id || null
      });
    } else {
      console.log("[api/tracker-active-assignment] No active asignacion found", {
        org_id,
        trackerUserId,
        personal_id,
        nowIso,
        asignacionesUrl,
        asignacionesRows
      });
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: "no_active_asignacion",
        tracker_user_id: trackerUserId,
        org_id,
        tracker_assignment_id: null,
        assignment_id: null,
        personal_id: personal_id || null
      });
    }
  } catch (e) {
    console.log("[api/tracker-active-assignment] error", e);
    return res.status(500).json({ ok: false, error: 'backend_error', message: e.message });
  }
}
