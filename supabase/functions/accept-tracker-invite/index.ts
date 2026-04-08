import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

const BUILD_TAG = "accept-tracker-invite-v2_preview_20260408";

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

serve(async (req) => {
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

    const inviteTokenHash = await sha256Hex(inviteToken);

    const { data: inviteRow, error: inviteErr } = await sbAdmin
      .from("tracker_invites")
      .select(`
        id,
        org_id,
        email,
        email_norm,
        created_at,
        expires_at,
        used_at,
        accepted_at,
        is_active,
        invite_token_hash
      `)
      .eq("org_id", orgId)
      .eq("invite_token_hash", inviteTokenHash)
      .eq("is_active", true)
      .maybeSingle();

    if (inviteErr) {
      console.error("[accept-tracker-invite] invite lookup error", {
        build_tag: BUILD_TAG,
        message: inviteErr.message,
        code: (inviteErr as any)?.code ?? null,
        details: (inviteErr as any)?.details ?? null,
      });

      return jsonResponse(500, {
        ok: false,
        error: "invite_lookup_failed",
        detail: inviteErr.message,
        build_tag: BUILD_TAG,
      });
    }

    if (!inviteRow) {
      return jsonResponse(404, {
        ok: false,
        error: "invite_not_found",
        build_tag: BUILD_TAG,
      });
    }

    const nowMs = Date.now();
    const expiresMs = Date.parse(String(inviteRow.expires_at ?? ""));

    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
      return jsonResponse(410, {
        ok: false,
        error: "invite_expired",
        build_tag: BUILD_TAG,
        invite_id: inviteRow.id,
      });
    }

    if (!inviteRow.is_active) {
      return jsonResponse(409, {
        ok: false,
        error: "invite_inactive",
        build_tag: BUILD_TAG,
        invite_id: inviteRow.id,
      });
    }

    const inviteEmail = String(inviteRow.email || inviteRow.email_norm || "").trim().toLowerCase();

    if (!inviteEmail || !inviteEmail.includes("@")) {
      return jsonResponse(500, {
        ok: false,
        error: "invite_missing_email",
        build_tag: BUILD_TAG,
        invite_id: inviteRow.id,
      });
    }

    const { data: claimData, error: claimErr } = await sbAdmin.rpc("get_tracker_invite_claim", {
      p_invite_id: inviteRow.id,
    });

    if (claimErr) {
      console.error("[accept-tracker-invite] get_tracker_invite_claim error", {
        build_tag: BUILD_TAG,
        invite_id: inviteRow.id,
        message: claimErr.message,
        code: (claimErr as any)?.code ?? null,
      });

      return jsonResponse(500, {
        ok: false,
        error: "get_tracker_invite_claim_failed",
        detail: claimErr.message,
        build_tag: BUILD_TAG,
      });
    }

    let trackerUserId: string | null = null;
    let ensureData: unknown = null;
    let resolvedUserId: unknown = null;

    const claimTrackerUserId = String(
      (claimData as Record<string, unknown> | null)?.tracker_user_id ??
        (claimData as Record<string, unknown> | null)?.user_id ??
        (claimData as Record<string, unknown> | null)?.resolved_user_id ??
        "",
    ).trim();

    if (isUuid(claimTrackerUserId)) {
      trackerUserId = claimTrackerUserId;
    }

    if (!trackerUserId) {
      const ensureResp = await sbAdmin.rpc("ensure_tracker_membership", {
        p_email: inviteEmail,
        p_org_id: orgId,
        p_role: "tracker",
      });

      ensureData = ensureResp.data;

      if (ensureResp.error) {
        console.error("[accept-tracker-invite] ensure_tracker_membership error", {
          build_tag: BUILD_TAG,
          invite_id: inviteRow.id,
          email: inviteEmail,
          message: ensureResp.error.message,
          code: (ensureResp.error as any)?.code ?? null,
        });

        return jsonResponse(500, {
          ok: false,
          error: "ensure_tracker_membership_failed",
          detail: ensureResp.error.message,
          build_tag: BUILD_TAG,
        });
      }

      const ensuredUserId = String(ensureResp.data ?? "").trim();
      if (isUuid(ensuredUserId)) {
        trackerUserId = ensuredUserId;
      }
    }

    if (!trackerUserId) {
      const resolveResp = await sbAdmin.rpc("resolve_tracker_user_id", {
        p_org_id: orgId,
      });

      resolvedUserId = resolveResp.data;

      if (resolveResp.error) {
        console.error("[accept-tracker-invite] resolve_tracker_user_id error", {
          build_tag: BUILD_TAG,
          invite_id: inviteRow.id,
          message: resolveResp.error.message,
          code: (resolveResp.error as any)?.code ?? null,
        });

        return jsonResponse(500, {
          ok: false,
          error: "resolve_tracker_user_id_failed",
          detail: resolveResp.error.message,
          build_tag: BUILD_TAG,
        });
      }

      const resolved = String(resolveResp.data ?? "").trim();
      if (isUuid(resolved)) {
        trackerUserId = resolved;
      }
    }

    if (!trackerUserId) {
      console.log("[accept-tracker-invite] resolution_debug", {
        build_tag: BUILD_TAG,
        invite_id: inviteRow.id,
        invite_email: inviteEmail,
        claimData,
        claimTrackerUserId,
        ensureData,
        resolvedUserId,
      });

      return jsonResponse(500, {
        ok: false,
        error: "tracker_user_id_not_resolved",
        build_tag: BUILD_TAG,
        invite_id: inviteRow.id,
      });
    }

    const patch: Record<string, unknown> = {
      accepted_at: inviteRow.accepted_at ?? new Date().toISOString(),
      used_at: new Date().toISOString(),
      used_by_user_id: trackerUserId,
      is_active: true,
    };

    const { error: updateErr } = await sbAdmin
      .from("tracker_invites")
      .update(patch)
      .eq("id", inviteRow.id);

    if (updateErr) {
      console.error("[accept-tracker-invite] invite update error", {
        build_tag: BUILD_TAG,
        invite_id: inviteRow.id,
        message: updateErr.message,
        code: (updateErr as any)?.code ?? null,
      });

      return jsonResponse(500, {
        ok: false,
        error: "invite_update_failed",
        detail: updateErr.message,
        build_tag: BUILD_TAG,
      });
    }

    const JWT_SECRET = (Deno.env.get("JWT_SECRET") || "").trim();

    if (!JWT_SECRET) {
      return jsonResponse(500, {
        ok: false,
        error: "missing_jwt_secret",
        build_tag: BUILD_TAG,
      });
    }

    console.log("[accept-tracker-invite] jwt_debug", {
      build_tag: BUILD_TAG,
      tracker_user_id: trackerUserId,
      email: inviteEmail,
      org_id: orgId,
      jwt_secret_length: JWT_SECRET.length,
    });

    try {
      const access_token = await createTrackerAccessToken({
        jwtSecret: JWT_SECRET,
        trackerUserId,
        inviteEmail,
        orgId,
      });

      return jsonResponse(200, {
        ok: true,
        tracker_user_id: trackerUserId,
        org_id: orgId,
        email: inviteEmail,
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
        detail: String(err?.message || err),
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
      message: String(err?.message || err),
      build_tag: BUILD_TAG,
    });
  }
});