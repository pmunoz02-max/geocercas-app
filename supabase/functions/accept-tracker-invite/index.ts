import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";

  const allowlist = [
    "https://app.tugeocercas.com",
    "https://preview.tugeocercas.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  const isVercelPreview =
    origin.endsWith(".vercel.app") || origin.includes("vercel.app");

  const isAllowed = allowlist.includes(origin) || isVercelPreview;

  const allowOrigin = origin && isAllowed ? origin : (origin ? "" : "*");

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-proxy-ts, x-proxy-signature",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;

  return headers;
}

function json(req: Request, status: number, obj: unknown) {
  const cors = getCorsHeaders(req);
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function hmacHex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type MembershipRole = "owner" | "admin" | "tracker";

const ROLE_PRIORITY: Record<MembershipRole, number> = {
  owner: 3,
  admin: 2,
  tracker: 1,
};

function normRole(role: unknown): MembershipRole {
  const raw = String(role ?? "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "tracker") return raw;
  return "tracker";
}

async function safeUpsertMembership(
  admin: SupabaseClient,
  params: { org_id: string; user_id: string; new_role: unknown },
) {
  const newRole = normRole(params.new_role);

  // First, try to find an active (non-revoked) membership
  const { data: existing, error: existingErr } = await admin
    .from("memberships")
    .select("org_id, user_id, role, revoked_at")
    .eq("org_id", params.org_id)
    .eq("user_id", params.user_id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    return {
      ok: false as const,
      action: "select_failed" as const,
      error: existingErr,
    };
  }

  if (!existing) {
    // No active membership found. Check if a revoked membership exists
    const { data: revoked, error: revokedErr } = await admin
      .from("memberships")
      .select("org_id, user_id, role, revoked_at")
      .eq("org_id", params.org_id)
      .eq("user_id", params.user_id)
      .not("revoked_at", "is", null)
      .limit(1)
      .maybeSingle();

    if (revokedErr) {
      return {
        ok: false as const,
        action: "select_failed" as const,
        error: revokedErr,
      };
    }

    if (revoked) {
      // A revoked membership exists. Reactivate and upgrade if needed.
      const revokedRole = normRole(revoked.role);
      const shouldUpgrade = ROLE_PRIORITY[newRole] > ROLE_PRIORITY[revokedRole];

      const roleToApply = shouldUpgrade ? newRole : revokedRole;

      const { error: updateErr } = await admin
        .from("memberships")
        .update({
          role: roleToApply,
          is_default: true,
          revoked_at: null,
        })
        .eq("org_id", params.org_id)
        .eq("user_id", params.user_id)
        .not("revoked_at", "is", null);

      if (updateErr) {
        return {
          ok: false as const,
          action: "reactivate_failed" as const,
          error: updateErr,
        };
      }

      return {
        ok: true as const,
        action: shouldUpgrade ? "upgraded" : "kept",
        role_applied: roleToApply,
        role_existing: revokedRole,
      };
    }

    // No membership at all - insert a new one
    const { error: insertErr } = await admin
      .from("memberships")
      .insert({
        org_id: params.org_id,
        user_id: params.user_id,
        role: newRole,
        is_default: true,
        revoked_at: null,
      });

    if (insertErr) {
      return {
        ok: false as const,
        action: "insert_failed" as const,
        error: insertErr,
      };
    }

    return {
      ok: true as const,
      action: "inserted" as const,
      role_applied: newRole,
      role_existing: null,
    };
  }

  // Active membership exists - check upgrade logic
  const currentRole = normRole(existing.role);
  const shouldUpgrade = ROLE_PRIORITY[newRole] > ROLE_PRIORITY[currentRole];

  if (!shouldUpgrade) {
    return {
      ok: true as const,
      action: "kept" as const,
      role_applied: currentRole,
      role_existing: currentRole,
    };
  }

  const { error: updateErr } = await admin
    .from("memberships")
    .update({
      role: newRole,
      is_default: true,
      revoked_at: null,
    })
    .eq("org_id", params.org_id)
    .eq("user_id", params.user_id)
    .is("revoked_at", null);

  if (updateErr) {
    return {
      ok: false as const,
      action: "update_failed" as const,
      error: updateErr,
    };
  }

  return {
    ok: true as const,
    action: "upgraded" as const,
    role_applied: newRole,
    role_existing: currentRole,
  };
}

serve(async (req) => {
  const build_tag = "accept-tracker-invite-v11_role_integrity_20260318";

  try {
    if (req.method === "OPTIONS") {
      return json(req, 200, { ok: true, build_tag });
    }

    if (req.method !== "POST") {
      return json(req, 405, {
        ok: false,
        build_tag,
        error: "METHOD_NOT_ALLOWED",
      });
    }

    const SB_URL = Deno.env.get("SB_URL");
    const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE");
    const TRACKER_PROXY_SECRET = Deno.env.get("TRACKER_PROXY_SECRET");

    if (!SB_URL || !SB_SERVICE_ROLE || !TRACKER_PROXY_SECRET) {
      return json(req, 500, {
        ok: false,
        build_tag,
        error: "Missing env",
        diag: {
          hasSbUrl: !!SB_URL,
          hasSbServiceRole: !!SB_SERVICE_ROLE,
          hasTrackerProxySecret: !!TRACKER_PROXY_SECRET,
        },
      });
    }

    const ts = req.headers.get("X-Proxy-Ts") || "";
    const signature = req.headers.get("X-Proxy-Signature") || "";

    const rawBody = await req.text();
    const fn = "accept-tracker-invite";
    const expected = await hmacHex(
      TRACKER_PROXY_SECRET,
      `${fn}.${ts}.${rawBody}`,
    );

    if (!ts || !signature || expected !== signature) {
      return json(req, 401, {
        ok: false,
        build_tag,
        error: "Invalid proxy signature",
      });
    }

    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }

    const org_id = body?.org_id;
    const user_id = body?.user_id;
    const email = body?.email;
  const invite_id = body?.invite_id;
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!org_id) {
      return json(req, 400, {
        ok: false,
        build_tag,
        error: "Missing org_id",
      });
    }

    const supabaseAdmin = createClient(SB_URL, SB_SERVICE_ROLE);

    let resolvedUserId = user_id ?? null;

    // Fallback por email si no vino user_id
    if (!resolvedUserId && email) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        return json(req, 500, {
          ok: false,
          build_tag,
          error: "Resolve user by email failed",
          detail: error.message,
        });
      }

      resolvedUserId = data?.id ?? null;
    }

    if (!resolvedUserId) {
      return json(req, 400, {
        ok: false,
        build_tag,
        error: "Missing user_id (or email not found)",
      });
    }

    const acceptedUserId = resolvedUserId;

    // 1) CANÓNICO: memberships (sin degradar rol dentro del mismo org)
    const membershipWrite = await safeUpsertMembership(supabaseAdmin, {
      org_id,
      user_id: acceptedUserId,
      new_role: "tracker",
    });

    if (!membershipWrite.ok) {
      return json(req, 500, {
        ok: false,
        build_tag,
        error: "Write memberships failed",
        detail: membershipWrite.error?.message,
        membership_action: membershipWrite.action,
      });
    }

    // Success actions from safeUpsertMembership are constrained to:
    // inserted | upgraded | kept.
    const membership_action = membershipWrite.action;

    // 1.1) TRACKER ORG LINK (canónico para trackers)
    let trackerOrgUserOk = false;
    let trackerOrgUserError: string | null = null;

    try {
      const nowIso = new Date().toISOString();

      const { error } = await supabaseAdmin
        .from("tracker_org_users")
        .upsert(
          {
            org_id,
            tracker_user_id: acceptedUserId,
            created_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "org_id,tracker_user_id" },
        );

      if (error) {
        trackerOrgUserError = error.message;
      } else {
        trackerOrgUserOk = true;
      }
    } catch (e: any) {
      trackerOrgUserError = e?.message ?? String(e);
    }

    if (!trackerOrgUserOk) {
      return json(req, 500, {
        ok: false,
        build_tag,
        error: "Upsert tracker_org_users failed",
        detail: trackerOrgUserError,
      });
    }

    // 1.2) PREVIEW: enlazar personal.user_id por org_id + email (fatal)
    let personalLinkOk = false;
    let personalLinkCount = 0;
    let personalLinkSkipped = false;
    let personalLinkError: string | null = null;

    if (!normalizedEmail) {
      personalLinkSkipped = true;
      personalLinkOk = true;
    } else {
      try {
        const { data: personalRows, error: personalSelectErr } = await supabaseAdmin
          .from("personal")
          .select("id,user_id,is_deleted,email")
          .eq("org_id", org_id)
          .ilike("email", normalizedEmail);

        if (personalSelectErr) {
          personalLinkError = personalSelectErr.message;
          return json(req, 500, {
            ok: false,
            build_tag,
            error: "Select personal failed",
            detail: personalSelectErr.message,
            tracker_org_user_ok: trackerOrgUserOk,
            tracker_org_user_error: trackerOrgUserError,
            personal_link_ok: personalLinkOk,
            personal_link_count: personalLinkCount,
            personal_link_skipped: personalLinkSkipped,
            personal_link_error: personalLinkError,
          });
        }

        const updatablePersonalIds = (personalRows ?? [])
          .filter((row: any) => {
            const isDeleted = row?.is_deleted ?? false;
            const currentUserId = row?.user_id ?? null;
            return !isDeleted && (currentUserId === null || currentUserId === resolvedUserId);
          })
          .map((row: any) => row?.id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

        if (updatablePersonalIds.length > 0) {
          const personalUpdateTs = new Date().toISOString();
          const { error: personalUpdateErr } = await supabaseAdmin
            .from("personal")
            .update({
              user_id: acceptedUserId,
              updated_at: personalUpdateTs,
            })
            .in("id", updatablePersonalIds);

          if (personalUpdateErr) {
            personalLinkError = personalUpdateErr.message;
            return json(req, 500, {
              ok: false,
              build_tag,
              error: "Update personal failed",
              detail: personalUpdateErr.message,
              tracker_org_user_ok: trackerOrgUserOk,
              tracker_org_user_error: trackerOrgUserError,
              personal_link_ok: personalLinkOk,
              personal_link_count: personalLinkCount,
              personal_link_skipped: personalLinkSkipped,
              personal_link_error: personalLinkError,
            });
          }

          personalLinkCount = updatablePersonalIds.length;
        }

        personalLinkOk = true;
      } catch (e: any) {
        personalLinkError = e?.message ?? String(e);
        return json(req, 500, {
          ok: false,
          build_tag,
          error: "Personal link failed",
          detail: personalLinkError,
          tracker_org_user_ok: trackerOrgUserOk,
          tracker_org_user_error: trackerOrgUserError,
          personal_link_ok: personalLinkOk,
          personal_link_count: personalLinkCount,
          personal_link_skipped: personalLinkSkipped,
          personal_link_error: personalLinkError,
        });
      }
    }

    // 2) ORG ACTIVA persistente (best-effort, no fatal)
    let setOrgOk = false;
    let setOrgError: string | null = null;

    try {
      const { error } = await supabaseAdmin.rpc("set_current_org", { p_org_id: org_id });
      if (error) {
        setOrgError = error.message;
      } else {
        setOrgOk = true;
      }
    } catch (e: any) {
      setOrgError = e?.message ?? String(e);
    }

    // 3) LEGACY COMPAT: user_organizations (best-effort, no fatal)
    // Conflict path MUST never downgrade role: keep existing row as-is.
    let legacyOk = false;
    let legacyError: string | null = null;

    try {
      const { error } = await supabaseAdmin
        .from("user_organizations")
        .upsert(
          {
            user_id: acceptedUserId,
            org_id,
            role: "tracker",
          },
          { onConflict: "org_id,user_id", ignoreDuplicates: true },
        );

      if (error) {
        legacyError = error.message;
      } else {
        legacyOk = true;
      }
    } catch (e: any) {
      legacyError = e?.message ?? String(e);
    }

    try {
      await supabaseAdmin.from('org_metrics_events').insert({
        org_id,
        user_id: acceptedUserId,
        event_type: 'invite_accepted',
        meta: {
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          ...(invite_id ? { invite_id } : {}),
        },
      });
    } catch (_) {
      // ignore metrics errors
    }

    return json(req, 200, {
      ok: true,
      build_tag,
      user_id: acceptedUserId,
      org_id,
      canonical_membership: true,
      membership_action,
      membership_role_applied: membershipWrite.role_applied,
      membership_role_existing: membershipWrite.role_existing,
      tracker_org_user_ok: trackerOrgUserOk,
      tracker_org_user_error: trackerOrgUserError,
      personal_link_ok: personalLinkOk,
      personal_link_count: personalLinkCount,
      personal_link_skipped: personalLinkSkipped,
      personal_link_error: personalLinkError,
      current_org_persisted: setOrgOk,
      current_org_error: setOrgError,
      legacy_user_organizations_ok: legacyOk,
      legacy_user_organizations_error: legacyError,
    });
  } catch (e: any) {
    return json(req, 500, {
      ok: false,
      build_tag,
      error: e?.message ?? String(e),
    });
  }
});