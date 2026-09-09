import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

const BUILD_TAG = "accept-tracker-invite-v4_preview_20260909";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, x-api-key, content-type, x-user-jwt, x-app-lang",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isUuid(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createTrackerAccessToken(params: {
  jwtSecret: string;
  trackerUserId: string;
  inviteEmail: string;
  orgId: string;
}) {
  const secret = new TextEncoder().encode(params.jwtSecret);

  return await new SignJWT({
    email: params.inviteEmail,
    role: "authenticated",
    aud: "authenticated",
    org_id: params.orgId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(params.trackerUserId)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function handleAcceptTrackerInvite(req: Request) {
  console.log("[ACCEPT] function entered", { build_tag: BUILD_TAG });

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse(405, {
        ok: false,
        error: "method_not_allowed",
        build_tag: BUILD_TAG,
      });
    }

    const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();
    const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        ok: false,
        error: "missing_supabase_env",
        build_tag: BUILD_TAG,
      });
    }

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const inviteToken = String(body?.inviteToken ?? body?.t ?? "").trim();
    const orgId = String(body?.org_id ?? "").trim();

    console.log("[accept-tracker-invite] request", {
      build_tag: BUILD_TAG,
      has_invite_token: !!inviteToken,
      invite_token_length: inviteToken.length,
      org_id: orgId || null,
    });

    if (!inviteToken) {
      return jsonResponse(400, {
        ok: false,
        error: "missing_invite_token",
        build_tag: BUILD_TAG,
      });
    }

    if (!isUuid(orgId)) {
      return jsonResponse(400, {
        ok: false,
        error: "invalid_org_id",
        build_tag: BUILD_TAG,
      });
    }

    const JWT_SECRET = (Deno.env.get("JWT_SECRET") || "").trim();
    if (!JWT_SECRET) {
      return jsonResponse(500, { ok: false, error: "missing_jwt_secret", build_tag: BUILD_TAG });
    }

    // The database owns identity, plan, quota, membership and invite consumption.
    // Do not pass a user id supplied by the browser as a trusted identity.
    const { data: acceptance, error: acceptanceError } = await sbAdmin.rpc(
      "accept_tracker_invite_transactional",
      { p_org_id: orgId, p_invite_token: inviteToken, p_expected_user_id: null },
    );
    if (acceptanceError) {
      const businessStatuses: Record<string, number> = {
        invalid_invite_input: 400,
        invite_not_found: 404,
        invite_expired: 410,
        invite_inactive: 409,
        invite_ambiguous: 409,
        invite_role_mismatch: 409,
        invite_identity_unavailable: 409,
        invite_identity_mismatch: 409,
        invite_identity_ambiguous: 409,
        tracker_user_id_not_resolved: 409,
        inviting_org_owner_protected: 409,
        plan_unavailable: 503,
        plan_inactive: 403,
        tracker_limit_reached: 403,
        invite_already_used_or_inconsistent: 409,
        accepted_membership_not_active_tracker: 403,
      };
      const code = String(acceptanceError.code || "");
      const message = String(acceptanceError.message || "");
      if (code === "P0001" && Object.hasOwn(businessStatuses, message)) {
        return jsonResponse(businessStatuses[message], { ok: false, error: message, build_tag: BUILD_TAG });
      }
      const retryable = ["40P01", "40001", "55P03"].includes(code);
      return jsonResponse(retryable || code === "25001" ? 503 : 500, {
        ok: false,
        error: retryable ? "acceptance_retry_required" : "acceptance_failed",
        retryable,
        build_tag: BUILD_TAG,
      });
    }
    if (!acceptance || Array.isArray(acceptance) || acceptance.ok !== true ||
        acceptance.org_id !== orgId || !isUuid(acceptance.tracker_user_id) ||
        !isUuid(acceptance.invite_id) || typeof acceptance.already_accepted !== "boolean" ||
        typeof acceptance.accepted_at !== "string" || !Number.isFinite(Date.parse(acceptance.accepted_at))) {
      return jsonResponse(500, { ok: false, error: "invalid_acceptance_result", build_tag: BUILD_TAG });
    }
    const trackerUserId = acceptance.tracker_user_id;
    // Get email for the session from Auth, not from stale invite/profile snapshots.
    const { data: authData, error: authError } = await sbAdmin.auth.admin.getUserById(trackerUserId);
    const inviteEmail = String(authData?.user?.email || "").trim().toLowerCase();
    if (authError || authData?.user?.id !== trackerUserId || !inviteEmail.includes("@")) {
      return jsonResponse(503, { ok: false, error: "accepted_identity_unavailable", build_tag: BUILD_TAG });
    }
    // Never reactivate a membership revoked after the acceptance committed.
    const { data: membership, error: membershipError } = await sbAdmin.from("memberships")
      .select("org_id,user_id,role,revoked_at").eq("org_id", orgId).eq("user_id", trackerUserId).maybeSingle();
    if (membershipError) {
      return jsonResponse(503, { ok: false, error: "accepted_membership_unavailable", build_tag: BUILD_TAG });
    }
    if (!membership || membership.org_id !== orgId || membership.user_id !== trackerUserId ||
        membership.role !== "tracker" || membership.revoked_at !== null) {
      return jsonResponse(403, { ok: false, error: "accepted_membership_not_active_tracker", build_tag: BUILD_TAG });
    }

    try {
      const access_token = await createTrackerAccessToken({
        jwtSecret: JWT_SECRET,
        trackerUserId,
        inviteEmail,
        orgId,
      });

      if (!access_token) {
        console.error("[accept-tracker-invite] runtime_access_token missing");
        throw new Error("runtime_token_missing");
      }

      const accessTokenHash = await sha256Hex(access_token);
      const nowIso = new Date().toISOString();
      const expiresAtIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      console.log("[accept-tracker-invite] runtime session persist start", {
        org_id: orgId,
        tracker_user_id: trackerUserId,
        hasToken: true,
        access_token_hash_prefix: accessTokenHash.slice(0, 12),
      });

      const { error: revokeError } = await sbAdmin
        .from("tracker_runtime_sessions")
        .update({
          active: false,
          revoked_at: nowIso,
        })
        .eq("org_id", orgId)
        .eq("tracker_user_id", trackerUserId)
        .eq("active", true);

      if (revokeError) {
        console.error("[accept-tracker-invite] runtime session revoke error", revokeError);
        return jsonResponse(500, {
          ok: false,
          error: "runtime_session_revoke_failed",
          build_tag: BUILD_TAG,
        });
      }

      const { data: runtimeInsert, error: runtimeInsertError } = await sbAdmin
        .from("tracker_runtime_sessions")
        .insert([
          {
            org_id: orgId,
            tracker_user_id: trackerUserId,
            access_token_hash: accessTokenHash,
            token_version: 1,
            active: true,
            issued_at: nowIso,
            expires_at: expiresAtIso,
            source: "accept_tracker_invite",
          },
        ])
        .select("id, org_id, tracker_user_id, token_version, active, expires_at")
        .single();

      if (runtimeInsertError || !runtimeInsert) {
        console.error(
          "[accept-tracker-invite] runtime session insert error",
          runtimeInsertError,
        );
        throw new Error("runtime_session_insert_failed");
      }

      console.log("[accept-tracker-invite] runtime session persist ok", {
        runtime_session_id: runtimeInsert.id,
        org_id: orgId,
        tracker_user_id: trackerUserId,
        token_version: runtimeInsert.token_version,
      });

      const { data: checkRows, error: checkError } = await sbAdmin
        .from("tracker_runtime_sessions")
        .select("id")
        .eq("org_id", orgId)
        .eq("tracker_user_id", trackerUserId)
        .eq("active", true);

      if (checkError) {
        console.error("[accept-tracker-invite] runtime session verify error", checkError);
        throw new Error("runtime_session_verify_failed");
      }

      if (!checkRows || checkRows.length === 0) {
        console.error("[accept-tracker-invite] runtime session NOT created");
        throw new Error("runtime_session_missing_after_accept");
      }

      console.log("[ACCEPT] success before return", {
        org_id: orgId,
        tracker_user_id: trackerUserId,
      });

      return jsonResponse(200, {
        ok: true,
        tracker_user_id: trackerUserId,
        org_id: orgId,
        email: inviteEmail,
        already_accepted: acceptance.already_accepted,
        session: {
          access_token,
          refresh_token: null,
          token_type: "bearer",
        },
        build_tag: BUILD_TAG,
      });
    } catch (err: any) {
      console.error("[accept-tracker-invite] jwt_create_failed", {
        build_tag: BUILD_TAG,
        message: String(err?.message || err),
        stack: String(err?.stack || ""),
        tracker_user_id: trackerUserId,
        email: inviteEmail,
        org_id: orgId,
      });

      return jsonResponse(500, {
        ok: false,
        error: "jwt_create_failed",
        build_tag: BUILD_TAG,
      });
    }
  } catch (err: any) {
    console.error("[accept-tracker-invite] unhandled", {
      build_tag: BUILD_TAG,
      message: String(err?.message || err),
      stack: String(err?.stack || ""),
    });

    return jsonResponse(500, {
      ok: false,
      error: "unhandled_exception",
      build_tag: BUILD_TAG,
    });
  }
}

serve(handleAcceptTrackerInvite);
