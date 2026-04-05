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

    let invitationState = null;

    // Bootstrap tracker assignment for authenticated user in current org.
    // Runs on every request — the RPC must be idempotent (no-op if already bootstrapped).
    console.log('[taa] step: bootstrap start', { auth_user_id: trackerUserId, org_id });
    const { data: bootstrapResult, error: bootstrapErr } = await supabase
      .rpc('bootstrap_tracker_assignment_current_user', {
        p_user_id: trackerUserId,
        p_org_id: org_id,
      });

    if (bootstrapErr) {
      // Non-fatal: log and continue. RPC should handle duplicate calls gracefully.
      console.log('[taa] BOOTSTRAP ERROR (non-fatal, continuing)', {
        code: bootstrapErr.code,
        message: bootstrapErr.message,
        hint: bootstrapErr.hint,
        auth_user_id: trackerUserId,
        org_id,
      });
    } else {
      console.log('[taa] BOOTSTRAP OK', {
        auth_user_id: trackerUserId,
        org_id,
        result: bootstrapResult ?? '(no data returned)',
      });
    }

    // Buscar personal vinculado a este tracker_user_id (auth user id) en la org actual
    console.log('[taa] PERSONAL LOOKUP by user_id', { auth_user_id: trackerUserId, org_id });
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

    let personalRecord = personal;
    if (personalRecord) {
      console.log('[taa] PERSONAL FOUND by user_id', { personal_id: personalRecord.id, user_id: personalRecord.user_id, org_id: personalRecord.org_id });
    } else {
      console.log('[taa] PERSONAL NOT FOUND by user_id — running extended resolution', { auth_user_id: trackerUserId, org_id });
    }
    if (!personalRecord) {
      const jwtEmail = String(payload?.email || "").trim().toLowerCase();

      // Resolution pass 1: personal row with matching email.
      // This supports both pending invitations and already-accepted invites
      // where the auth user exists but personal.user_id has not been resolved yet.
      if (jwtEmail) {
        console.log('[taa] RESOLVE PASS 1: personal by email', { email: jwtEmail, org_id });
        const { data: personalByEmail, error: emailLookupErr } = await supabase
          .from("personal")
          .select("id, user_id, email, org_id")
          .eq("org_id", org_id)
          .eq("is_deleted", false)
          .ilike("email", jwtEmail)
          .maybeSingle();

        if (emailLookupErr) {
          console.log('[taa] RESOLVE PASS 1: email lookup error', emailLookupErr);
        } else if (personalByEmail && !personalByEmail.user_id) {
          invitationState = 'invitation_pending';
          console.log('[taa] RESOLVE PASS 1: found unlinked personal, syncing to auth user', {
            personal_id: personalByEmail.id,
            auth_user_id: trackerUserId,
          });
          const { data: linked, error: linkErr } = await supabase
            .from("personal")
            .update({ user_id: trackerUserId })
            .eq("id", personalByEmail.id)
            .eq("org_id", org_id)
            .is("user_id", null)
            .select("id, user_id, email, org_id")
            .maybeSingle();

          if (linkErr) {
            console.log('[taa] RESOLVE PASS 1: link error (non-fatal)', linkErr);
          } else if (linked) {
            console.log('[taa] RESOLVE PASS 1: linked personal via pending invitation', { personal_id: linked.id, user_id: linked.user_id });
            personalRecord = linked;
          } else {
            // Race: another request already linked it — re-fetch
            console.log('[taa] RESOLVE PASS 1: race condition, re-fetching', { personal_id: personalByEmail.id });
            const { data: refetched } = await supabase
              .from("personal")
              .select("id, user_id, email, org_id")
              .eq("id", personalByEmail.id)
              .maybeSingle();
            personalRecord = refetched || null;
          }
        } else if (personalByEmail && personalByEmail.user_id && personalByEmail.user_id !== trackerUserId) {
          // Accepted by someone else — skip this row, do not overwrite
          console.log('[taa] RESOLVE PASS 1: personal email row already linked to different user (skipping)', {
            personal_id: personalByEmail.id,
            existing_user_id: personalByEmail.user_id,
            auth_user_id: trackerUserId,
          });
        } else if (personalByEmail && personalByEmail.user_id === trackerUserId) {
          invitationState = 'invitation_accepted_not_bootstrapped';
          console.log('[taa] RESOLVE PASS 1: invitation already accepted for this user/org; using existing personal', {
            personal_id: personalByEmail.id,
            auth_user_id: trackerUserId,
          });
          personalRecord = personalByEmail;
        }
      }

      // Resolution pass 2: org membership — accepted invitation or existing org membership
      // can bootstrap a personal row idempotently even without a pending invite.
      if (!personalRecord) {
        console.log('[taa] RESOLVE PASS 2: personal by org membership', { auth_user_id: trackerUserId, org_id });
        const { data: membership, error: membershipErr } = await supabase
          .from("memberships")
          .select("id, org_id, user_id, email, role")
          .eq("org_id", org_id)
          .eq("user_id", trackerUserId)
          .maybeSingle();

        if (membershipErr) {
          console.log('[taa] RESOLVE PASS 2: membership lookup error', membershipErr);
        } else if (membership) {
          if (!invitationState) {
            invitationState = 'invitation_accepted_not_bootstrapped';
          }
          console.log('[taa] RESOLVE PASS 2: membership found, bootstrapping/syncing personal row', {
            membership_id: membership.id,
            auth_user_id: trackerUserId,
          });
          const memberEmail = String(membership.email || jwtEmail || "").trim().toLowerCase();
          const { data: created, error: createErr } = await supabase
            .from("personal")
            .insert([{
              user_id: trackerUserId,
              org_id,
              email: memberEmail,
              is_deleted: false,
            }])
            .select("id, user_id, email, org_id")
            .maybeSingle();

          if (createErr) {
            // Could be duplicate — re-query by user_id in case bootstrap RPC already created it
            console.log('[taa] RESOLVE PASS 2: insert error (may be duplicate), re-querying', createErr);
            const { data: retried } = await supabase
              .from("personal")
              .select("id, user_id, email, org_id")
              .eq("user_id", trackerUserId)
              .eq("org_id", org_id)
              .eq("is_deleted", false)
              .maybeSingle();
            personalRecord = retried || null;
            if (personalRecord) {
              invitationState = 'personal_bootstrapped';
              console.log('[taa] RESOLVE PASS 2: found personal on retry after insert conflict', { personal_id: personalRecord.id });
            }
          } else if (created) {
            invitationState = 'personal_bootstrapped';
            console.log('[taa] RESOLVE PASS 2: personal created from membership', { personal_id: created.id, email: created.email });
            personalRecord = created;
          }
        } else {
          console.log('[taa] RESOLVE PASS 2: no membership found for user in org', { auth_user_id: trackerUserId, org_id });
        }
      }

      if (!personalRecord) {
        invitationState = 'no_invitation_found';
        console.log('[taa] PERSONAL RESOLUTION FAILED — no personal, invitation, or membership found', {
          auth_user_id: trackerUserId,
          org_id,
          jwt_email: jwtEmail || null,
          invitation_state: invitationState,
        });
        return res.status(200).json({
          ok: true,
          active: false,
          assignment: null,
          reason: "no_personal_found",
          invitation_state: invitationState,
          debug: {
            message: "No personal record, pending invitation, or org membership found for this user",
            auth_user_id: trackerUserId,
            org_id,
            jwt_email: jwtEmail || null,
          }
        });
      }
    }

    console.log('[taa] PERSONAL RESOLVED', { personal_id: personalRecord.id, user_id: personalRecord.user_id, org_id: personalRecord.org_id });
    console.log('[taa] INVITATION STATE', {
      invitation_state: invitationState,
      personal_id: personalRecord.id,
      auth_user_id: trackerUserId,
      org_id,
    });
    
    // Ensure personal.user_id is linked to auth user if not already
    if (!personalRecord.user_id) {
      console.log('[taa] step: linking personal.user_id to auth user', { personal_id: personalRecord.id, user_id: trackerUserId });
      const { data: updated, error: linkErr } = await supabase
        .from("personal")
        .update({ user_id: trackerUserId })
        .eq("id", personalRecord.id)
        .eq("org_id", org_id)
        .select("id, user_id, org_id")
        .maybeSingle();

      if (linkErr) {
        console.log('[taa] step: failed to link personal.user_id (continuing)', linkErr);
      } else if (updated) {
        console.log('[taa] step: successfully linked personal.user_id', { personal_id: updated.id, user_id: updated.user_id });
        personalRecord.user_id = updated.user_id;
      }
    }
    
    const personal_id = personalRecord.id;

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
        invitation_state: invitationState,
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
        invitation_state: invitationState,
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
        invitation_state: invitationState,
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
        invitation_state: invitationState,
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
