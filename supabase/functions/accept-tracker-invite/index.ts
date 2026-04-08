import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUILD_TAG = "accept-tracker-invite-v1_preview_20260408";

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


    // Leer inviteToken y org_id del body (no requiere JWT ni Authorization)
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const inviteToken = String(body?.inviteToken ?? body?.t ?? "").trim();
    const orgId = String(body?.org_id ?? "").trim();

    console.log("[accept-tracker-invite] request", {
      build_tag: BUILD_TAG,
      has_invite_token: !!inviteToken,
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

    const claimTrackerUserId = String(
      claimData?.tracker_user_id ??
        claimData?.user_id ??
        claimData?.resolved_user_id ??
        "",
    ).trim();

    if (isUuid(claimTrackerUserId)) {
      trackerUserId = claimTrackerUserId;
    }

    if (!trackerUserId) {
      const { data: ensureData, error: ensureErr } = await sbAdmin.rpc("ensure_tracker_membership", {
        p_email: inviteEmail,
        p_org_id: orgId,
        p_role: "tracker",
      });

      if (ensureErr) {
        console.error("[accept-tracker-invite] ensure_tracker_membership error", {
          build_tag: BUILD_TAG,
          invite_id: inviteRow.id,
          email: inviteEmail,
          message: ensureErr.message,
          code: (ensureErr as any)?.code ?? null,
        });

        return jsonResponse(500, {
          ok: false,
          error: "ensure_tracker_membership_failed",
          detail: ensureErr.message,
          build_tag: BUILD_TAG,
        });
      }

      const ensuredUserId = String(ensureData ?? "").trim();
      if (isUuid(ensuredUserId)) {
        trackerUserId = ensuredUserId;
      }
    }

    if (!trackerUserId) {
      const { data: resolvedUserId, error: resolveErr } = await sbAdmin.rpc("resolve_tracker_user_id", {
        p_org_id: orgId,
      });

      if (resolveErr) {
        console.error("[accept-tracker-invite] resolve_tracker_user_id error", {
          build_tag: BUILD_TAG,
          invite_id: inviteRow.id,
          message: resolveErr.message,
          code: (resolveErr as any)?.code ?? null,
        });

        return jsonResponse(500, {
          ok: false,
          error: "resolve_tracker_user_id_failed",
          detail: resolveErr.message,
          build_tag: BUILD_TAG,
        });
      }

      const resolved = String(resolvedUserId ?? "").trim();
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
        ensureData: typeof ensureData === "undefined" ? null : ensureData,
        resolvedUserId: typeof resolvedUserId === "undefined" ? null : resolvedUserId,
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

    console.log("[accept-tracker-invite] success", {
      build_tag: BUILD_TAG,
      invite_id: inviteRow.id,
      org_id: orgId,
      tracker_user_id: trackerUserId,
      email: inviteEmail,
    });

    return jsonResponse(200, {
      ok: true,
      tracker_user_id: trackerUserId,
      org_id: orgId,
      email: inviteEmail,
    });
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