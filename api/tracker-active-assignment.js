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
        org_access: "none",
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
        org_access: "none",
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
        org_access: "none",
        debug: { message: "Invalid JWT - no sub claim found" },
        org_id
      });
    }
    console.log('[taa] step: resolved tracker_user_id', trackerUserId);

    const jwtEmail = String(payload?.email || '').trim().toLowerCase() || null;
    let invitationState = null;
    let orgAccess = 'none';
    let orgAccessMeta = {
      role: null,
      email: null,
      membership_id: null,
    };
    let invitedPersonalByUserId = null;
    let invitedPersonalByEmail = null;

    console.log('[taa] ORG ACCESS: resolving access before personal lookup', {
      auth_user_id: trackerUserId,
      org_id,
    });

    const { data: membership, error: membershipErr } = await supabase
      .from("memberships")
      .select("id, org_id, user_id, email, role, revoked_at")
      .eq("org_id", org_id)
      .eq("user_id", trackerUserId)
      .is("revoked_at", null)
      .maybeSingle();

    if (membershipErr) {
      console.log('[taa] ORG ACCESS: membership lookup error', membershipErr);
    } else if (membership?.org_id) {
      orgAccess = 'member';
      orgAccessMeta = {
        role: String(membership.role || 'member'),
        email: String(membership.email || '').trim().toLowerCase() || null,
        membership_id: membership.id || null,
      };
      console.log('[taa] ORG ACCESS: membership ok', {
        auth_user_id: trackerUserId,
        org_id,
        role: orgAccessMeta.role,
        membership_id: orgAccessMeta.membership_id,
      });
    }

    if (orgAccess === 'none') {
      const { data: ownerOrg, error: ownerOrgErr } = await supabase
        .from("organizations")
        .select("id, owner_id")
        .eq("id", org_id)
        .eq("owner_id", trackerUserId)
        .maybeSingle();

      if (ownerOrgErr) {
        console.log('[taa] ORG ACCESS: owner lookup error', ownerOrgErr);
      } else if (ownerOrg?.id) {
        orgAccess = 'owner';
        invitationState = 'not_applicable';
        orgAccessMeta = {
          role: 'owner',
          email: jwtEmail,
          membership_id: null,
        };
        console.log('[taa] ORG ACCESS: owner ok', {
          auth_user_id: trackerUserId,
          org_id,
          role: orgAccessMeta.role,
        });
      }
    }

    if (orgAccess === 'none') {
      const { data: invitedByUserId, error: invitedByUserIdErr } = await supabase
        .from("personal")
        .select("id, user_id, email, org_id")
        .eq("org_id", org_id)
        .eq("user_id", trackerUserId)
        .eq("is_deleted", false)
        .maybeSingle();

      if (invitedByUserIdErr) {
        console.log('[taa] ORG ACCESS: invited-by-user_id lookup error', invitedByUserIdErr);
      } else if (invitedByUserId?.id) {
        orgAccess = 'invited';
        orgAccessMeta = {
          role: 'invited',
          email: String(invitedByUserId.email || '').trim().toLowerCase() || jwtEmail,
          membership_id: null,
        };
        invitedPersonalByUserId = invitedByUserId;
        console.log('[taa] ORG ACCESS: invited via personal.user_id', {
          auth_user_id: trackerUserId,
          org_id,
          personal_id: invitedByUserId.id,
        });
      }
    }

    if (orgAccess === 'none' && jwtEmail) {
      const { data: invitedByEmail, error: invitedByEmailErr } = await supabase
        .from("personal")
        .select("id, user_id, email, org_id")
        .eq("org_id", org_id)
        .eq("is_deleted", false)
        .ilike("email", jwtEmail)
        .maybeSingle();

      if (invitedByEmailErr) {
        console.log('[taa] ORG ACCESS: invited-by-email lookup error', invitedByEmailErr);
      } else if (invitedByEmail?.id) {
        orgAccess = 'invited';
        orgAccessMeta = {
          role: 'invited',
          email: String(invitedByEmail.email || '').trim().toLowerCase() || jwtEmail,
          membership_id: null,
        };
        invitedPersonalByEmail = invitedByEmail;
        console.log('[taa] ORG ACCESS: invited via personal.email', {
          auth_user_id: trackerUserId,
          org_id,
          personal_id: invitedByEmail.id,
        });
      }
    }

    if (orgAccess === 'none') {
      console.log('[taa] ORG ACCESS: denied', {
        auth_user_id: trackerUserId,
        org_id,
      });
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        reason: 'missing_org',
        org_access: orgAccess,
        debug: {
          message: 'Authenticated user has no access to the requested org',
          auth_user_id: trackerUserId,
          org_id,
        },
      });
    }

    const hasExistingOrgAccess = orgAccess === 'owner' || orgAccess === 'member';

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
    let personal = invitedPersonalByUserId;
    let personalErr = null;
    if (!personal) {
      const personalResult = await supabase
        .from("personal")
        .select("id, user_id, email, org_id")
        .eq("user_id", trackerUserId)
        .eq("org_id", org_id)
        .eq("is_deleted", false)
        .maybeSingle();
      personal = personalResult.data;
      personalErr = personalResult.error;
    }

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
      // Resolution pass 1: invitation bootstrap by email.
      // Only applies when the user does not already have org access as owner/member.
      if (!hasExistingOrgAccess && jwtEmail) {
        console.log('[taa] RESOLVE PASS 1: invitation bootstrap by email', { email: jwtEmail, org_id, org_access: orgAccess });
        let personalByEmail = invitedPersonalByEmail;
        let emailLookupErr = null;
        if (!personalByEmail) {
          const emailLookupResult = await supabase
            .from("personal")
            .select("id, user_id, email, org_id")
            .eq("org_id", org_id)
            .eq("is_deleted", false)
            .ilike("email", jwtEmail)
            .maybeSingle();
          personalByEmail = emailLookupResult.data;
          emailLookupErr = emailLookupResult.error;
        }

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
            console.log('[taa] RESOLVE PASS 1: race condition, re-fetching', { personal_id: personalByEmail.id });
            const { data: refetched } = await supabase
              .from("personal")
              .select("id, user_id, email, org_id")
              .eq("id", personalByEmail.id)
              .maybeSingle();
            personalRecord = refetched || null;
          }
        } else if (personalByEmail && personalByEmail.user_id && personalByEmail.user_id !== trackerUserId) {
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
      } else if (hasExistingOrgAccess) {
        console.log('[taa] RESOLVE PASS 1: skipped invitation bootstrap because user already has org access', {
          auth_user_id: trackerUserId,
          org_id,
          org_access: orgAccess,
        });
      }

      // Resolution pass 2: resolved org access — accepted invitation, org membership,
      // or org ownership can bootstrap a personal row idempotently even without a pending invite.
      if (!personalRecord) {
        console.log('[taa] RESOLVE PASS 2: personal by resolved org access', {
          auth_user_id: trackerUserId,
          org_id,
          access_kind: orgAccess,
          access_role: orgAccessMeta.role,
        });
        if (orgAccess !== 'none') {
          if (!invitationState && orgAccess !== 'owner') {
            invitationState = 'invitation_accepted_not_bootstrapped';
          }
          console.log('[taa] RESOLVE PASS 2: org access resolved, bootstrapping/syncing personal row', {
            access_kind: orgAccess,
            membership_id: orgAccessMeta.membership_id,
            auth_user_id: trackerUserId,
          });
          const memberEmail = String(orgAccessMeta.email || jwtEmail || "").trim().toLowerCase();
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
            console.log('[taa] RESOLVE PASS 2: personal created from org access', { personal_id: created.id, email: created.email, org_access: orgAccess });
            personalRecord = created;
          }
        } else {
          console.log('[taa] RESOLVE PASS 2: no org access available for bootstrap', { auth_user_id: trackerUserId, org_id });
        }
      }

      if (!personalRecord) {
        console.log('[taa] PERSONAL RESOLUTION FAILED — org access exists but no personal profile was resolved', {
          auth_user_id: trackerUserId,
          org_id,
          org_access: orgAccess,
          jwt_email: jwtEmail || null,
          invitation_state: invitationState,
        });
        return res.status(200).json({
          ok: true,
          active: false,
          assignment: null,
          reason: "no_personal_profile",
          org_access: orgAccess,
          invitation_state: invitationState,
          debug: {
            message: "User has org access but no personal profile could be resolved for this org",
            auth_user_id: trackerUserId,
            org_id,
            org_access: orgAccess,
            jwt_email: jwtEmail || null,
          }
        });
      }
    }

    console.log('[taa] PERSONAL RESOLVED', { personal_id: personalRecord.id, user_id: personalRecord.user_id, org_id: personalRecord.org_id });
    console.log('[taa] INVITATION STATE', {
      invitation_state: invitationState,
      org_access: orgAccess,
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

    // Resolver asignación activa SOLO desde tracker_assignments:
    // org_id = request org, tracker_user_id = auth.user.id,
    // active = true, y fecha actual dentro de [start_date, end_date].
    const currentDate = new Date().toISOString().slice(0, 10);
    console.log('[taa] step: tracker_assignments active-window query start', {
      org_id,
      tracker_user_id: trackerUserId,
      current_date: currentDate,
    });

    const {
      data: trackerAssignment,
      error: trackerAssignmentErr,
    } = await supabase
      .from("tracker_assignments")
      .select("*")
      .eq("org_id", org_id)
      .eq("tracker_user_id", trackerUserId)
      .eq("active", true)
      .lte("start_date", currentDate)
      .gte("end_date", currentDate)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (trackerAssignmentErr) {
      console.log("[taa] step: tracker_assignments active-window query error", trackerAssignmentErr);
      return res.status(500).json({
        ok: false,
        error: 'backend_error',
        message: 'Error consultando tracker_assignments',
      });
    }

    if (!trackerAssignment) {
      console.log("[taa] step: no active tracker_assignment for current date");
      return res.status(200).json({
        ok: true,
        active: false,
        assignment: null,
        tracker_assignment: null,
        reason: "no_active_assignment",
        org_access: orgAccess,
        invitation_state: invitationState,
        org_id,
        tracker_user_id: trackerUserId,
        personal_id,
      });
    }

    return res.status(200).json({
      ok: true,
      active: true,
      assignment: trackerAssignment,
      tracker_assignment: trackerAssignment,
      reason: "assignment_found",
      org_access: orgAccess,
      invitation_state: invitationState,
      org_id,
      tracker_user_id: trackerUserId,
      personal_id,
    });
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
