export const config = {
  runtime: "nodejs",
};

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const RUNTIME_SESSION_HOURS = 24 * 7; // 7 días

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getSupabase() {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server envs");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extractBearerToken(req) {
  const authHeader =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function resolveTrackerUserId(supabase, invite) {
  const orgId = String(invite?.org_id || "").trim();
  const emailNorm = String(invite?.email_norm || "").trim().toLowerCase();
  const rawEmail = String(invite?.email || "").trim();

  if (!orgId) {
    return {
      trackerUserId: null,
      error: "Invite missing org_id",
    };
  }

  let personalQuery = supabase
    .from("personal")
    .select("id,user_id,email,email_norm,org_id,activo,activo_bool,vigente,is_deleted")
    .eq("org_id", orgId)
    .limit(1);

  if (emailNorm) {
    personalQuery = personalQuery.eq("email_norm", emailNorm);
  } else if (rawEmail) {
    personalQuery = personalQuery.eq("email", rawEmail);
  } else {
    return {
      trackerUserId: null,
      error: "Invite missing email/email_norm",
    };
  }

  const { data, error } = await personalQuery.maybeSingle();

  if (error) {
    return {
      trackerUserId: null,
      error: error.message,
    };
  }

  if (!data?.id) {
    return {
      trackerUserId: null,
      error: "Tracker person not found for invite",
    };
  }

  if (!data?.user_id) {
    return {
      trackerUserId: null,
      error: "personal.user_id missing for tracker",
    };
  }

  return {
    trackerUserId: String(data.user_id).trim(),
    error: null,
  };
}

async function rotateRuntimeSession(supabase, { orgId, trackerUserId }) {
  const plainToken = randomToken();
  const tokenHash = sha256Hex(plainToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RUNTIME_SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const { error: deactivateError } = await supabase
    .from("tracker_runtime_sessions")
    .update({ active: false })
    .eq("org_id", orgId)
    .eq("tracker_user_id", trackerUserId)
    .eq("active", true);

  if (deactivateError) {
    return {
      ok: false,
      error: deactivateError.message,
      token: null,
    };
  }

  const insertPayload = {
    org_id: orgId,
    tracker_user_id: trackerUserId,
    access_token_hash: tokenHash,
    active: true,
    expires_at: expiresAt,
    last_seen_at: nowIso,
  };

  const { data: sessionRow, error: insertError } = await supabase
    .from("tracker_runtime_sessions")
    .insert([insertPayload])
    .select("id, org_id, tracker_user_id, active, expires_at")
    .single();

  if (insertError || !sessionRow) {
    return {
      ok: false,
      error: insertError?.message || "Failed to create tracker runtime session",
      token: null,
    };
  }

  return {
    ok: true,
    error: null,
    token: plainToken,
    session: sessionRow,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        code: 405,
        message: "Method not allowed",
      });
    }

    const inviteToken = extractBearerToken(req);
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const orgIdFromBody = String(body.org_id || body.orgId || "").trim();

    if (!inviteToken) {
      return res.status(401).json({
        ok: false,
        code: 401,
        message: "Missing authorization header",
      });
    }

    const inviteTokenHash = sha256Hex(inviteToken);
    const supabase = getSupabase();

    const { data: invite, error: inviteError } = await supabase
      .from("tracker_invites")
      .select("*")
      .eq("invite_token_hash", inviteTokenHash)
      .maybeSingle();

    if (inviteError) {
      return res.status(500).json({
        ok: false,
        code: 500,
        message: inviteError.message,
      });
    }

    if (!invite) {
      return res.status(404).json({
        ok: false,
        code: 404,
        message: "Invite not found",
      });
    }

    if (orgIdFromBody && String(invite.org_id || "") !== orgIdFromBody) {
      return res.status(409).json({
        ok: false,
        code: 409,
        message: "Invite org mismatch",
      });
    }

    if (!invite.is_active) {
      return res.status(409).json({
        ok: false,
        code: 409,
        message: "Invite inactive",
      });
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(410).json({
        ok: false,
        code: 410,
        message: "Invite expired",
      });
    }

    const trackerResolution = await resolveTrackerUserId(supabase, invite);

    if (trackerResolution.error || !trackerResolution.trackerUserId) {
      return res.status(409).json({
        ok: false,
        code: 409,
        message: trackerResolution.error || "Tracker user could not be resolved",
      });
    }

    const trackerUserId = trackerResolution.trackerUserId;
    const nowIso = new Date().toISOString();
    const alreadyAccepted = !!invite.accepted_at;

    if (!alreadyAccepted) {
      const { error: updateError } = await supabase
        .from("tracker_invites")
        .update({
          accepted_at: nowIso,
          used_at: nowIso,
        })
        .eq("id", invite.id)
        .is("accepted_at", null);

      if (updateError) {
        return res.status(500).json({
          ok: false,
          code: 500,
          message: updateError.message,
        });
      }
    }

    const { data: acceptedInvite, error: rereadError } = await supabase
      .from("tracker_invites")
      .select("*")
      .eq("id", invite.id)
      .maybeSingle();

    if (rereadError || !acceptedInvite) {
      return res.status(500).json({
        ok: false,
        code: 500,
        message: rereadError?.message || "Failed to re-read accepted invite",
      });
    }

    const runtimeResult = await rotateRuntimeSession(supabase, {
      orgId: acceptedInvite.org_id,
      trackerUserId,
    });

    if (!runtimeResult.ok || !runtimeResult.token) {
      return res.status(500).json({
        ok: false,
        code: 500,
        message: runtimeResult.error || "Failed to create tracker runtime session",
      });
    }

    return res.status(200).json({
      ok: true,
      idempotent: alreadyAccepted,
      tracker_runtime_token: runtimeResult.token,
      tracker_user_id: trackerUserId,
      org_id: acceptedInvite.org_id,
      invite_id: acceptedInvite.id,
      redirectTo: `/tracker-gps?org_id=${encodeURIComponent(acceptedInvite.org_id)}`,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      code: 500,
      message: String(error?.message || error),
    });
  }
}