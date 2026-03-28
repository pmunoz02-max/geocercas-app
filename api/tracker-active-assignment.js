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
    console.log("[api/tracker-active-assignment] personal rows", personalRows);
    let personal = personalRows && personalRows[0];
    let personal_id = null;
    if (personal && personal.id && personal.user_id === trackerUserId) {
      personal_id = personal.id;
    }

    // MIGRATION: fallback to email only for migration period
    if (!personal_id && payload?.email) {
      const personalByEmailUrl = `${SUPABASE_URL}/rest/v1/personal?email=eq.${encodeURIComponent(payload.email)}&org_id=eq.${encodeURIComponent(org_id)}&is_deleted=eq.false&select=id,user_id,email`;
      const personalByEmailResp = await fetch(personalByEmailUrl, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
      if (personalByEmailResp.ok) {
        const personalByEmailRows = await personalByEmailResp.json();
        console.log("[api/tracker-active-assignment] personal by email rows (MIGRATION ONLY)", personalByEmailRows);
        const fallbackPersonal = personalByEmailRows && personalByEmailRows[0];
        if (fallbackPersonal && fallbackPersonal.id) {
          personal_id = fallbackPersonal.id;
        }
      }
    }

    if (!personal_id) {
      console.log("[api/tracker-active-assignment] No linked personal found", { org_id, trackerUserId, personalRows });
      return res.status(200).json({ ok: true, active: false, assignment: null, reason: "no_linked_personal", org_id, trackerUserId });
    }

    // 2. Join tracker_assignments with asignaciones, but use asignaciones as source of truth
    // Only consider tracker_assignments that are active and reference an active asignacion
    const joinUrl = `${SUPABASE_URL}/rest/v1/tracker_assignments?org_id=eq.${encodeURIComponent(org_id)}&tracker_user_id=eq.${encodeURIComponent(trackerUserId)}&active=eq.true&select=*,asignacion:asignacion_id(*)`;
    const joinResp = await fetch(joinUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!joinResp.ok) {
      console.log("[api/tracker-active-assignment] join fetch error", joinUrl, joinResp.status);
      return res.status(500).json({ ok: false, error: 'backend_error', message: 'Error consultando join tracker_assignments/asignaciones' });
    }
    const joinRows = await joinResp.json();
    console.log("[api/tracker-active-assignment] join rows", joinRows);
    // Find the first tracker_assignment whose asignacion is valid and active (using asignaciones.start_time/end_time)
    const valid = joinRows.find(row => row.asignacion &&
      row.asignacion.personal_id === personal_id &&
      !row.asignacion.is_deleted &&
      ["activa", "activa"].includes(row.asignacion.status || row.asignacion.estado) &&
      row.asignacion.start_time <= nowIso &&
      row.asignacion.end_time >= nowIso
    );
    if (valid) {
      // Use asignacion as the source of truth
      return res.status(200).json({
        ok: true,
        active: true,
        assignment: valid.asignacion,
        reason: "tracker_assignment_joined",
        tracker_user_id: trackerUserId,
        org_id,
        tracker_assignment_id: valid.id || null,
        assignment_id: valid.asignacion.id || null
      });
    }
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
