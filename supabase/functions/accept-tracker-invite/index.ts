import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

const BUILD = "accept-vNEXT-admin-lookup";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, x-api-key, content-type",
  "Access-Control-Max-Age": "86400",
  "x-build": BUILD,
};

function jsonResponse(body: Json, status = 200, extraHeaders: HeadersInit = {}) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, String(v));
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, String(v));
  return new Response(JSON.stringify(body), { status, headers });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7) : "";
}

function decodeJwtPayload(token: string): any | null {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function resolveOrgFromUserCurrentOrg(admin: any, userId: string) {
  const { data, error } = await admin
    .from("user_current_org")
    .select("org_id, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { orgId: null as string | null, error: `user_current_org lookup failed: ${error.message}` };
  }
  const orgId = data?.org_id ? String(data.org_id) : null;
  return { orgId, error: null as string | null };
}

async function listUserOrgsFromMemberships(admin: any, userId: string) {
  // memberships (canonical for app)
  const { data: mems, error: memErr } = await admin
    .from("memberships")
    .select("org_id, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (memErr) {
    return { orgs: [] as string[], error: `memberships lookup failed: ${memErr.message}` };
  }

  const uniqueOrgs = Array.from(new Set((mems ?? []).map((m: any) => m?.org_id).filter(Boolean).map(String)));
  return { orgs: uniqueOrgs, error: null as string | null };
}

async function setUserCurrentOrg(admin: any, userId: string, orgId: string) {
  const { error } = await admin
    .from("user_current_org")
    .upsert(
      { user_id: userId, org_id: orgId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) return `user_current_org upsert failed: ${error.message}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, error: "Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
      500,
    );
  }

  const jwt = getBearer(req);
  if (!jwt) return jsonResponse({ ok: false, error: "Missing bearer token" }, 401);

  const payload = decodeJwtPayload(jwt);
  const userId = payload?.sub ? String(payload.sub) : "";
  if (!userId) return jsonResponse({ ok: false, error: "Invalid JWT: missing sub" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validate JWT -> user
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) {
    return jsonResponse(
      { ok: false, error: "Invalid JWT (auth admin lookup failed)", detail: authErr?.message ?? null },
      401,
    );
  }

  const email = authUser.user.email || (payload?.email ? String(payload.email) : "") || "";
  if (!email) return jsonResponse({ ok: false, error: "User has no email" }, 400);
  const emailNorm = normalizeEmail(email);

  // ✅ UNIVERSAL PATH 1: If user_current_org exists -> return that, regardless of invites.
  const uco = await resolveOrgFromUserCurrentOrg(admin, userId);
  if (uco.error) {
    return jsonResponse({ ok: false, error: uco.error }, 500);
  }
  if (uco.orgId) {
    // Optional: ensure membership exists in that org (non-blocking)
    const { data: m, error: mErr } = await admin
      .from("memberships")
      .select("org_id, revoked_at")
      .eq("user_id", userId)
      .eq("org_id", uco.orgId)
      .maybeSingle();

    const membershipOk = !!(m && !m.revoked_at);
    return jsonResponse(
      {
        ok: true,
        org_id: uco.orgId,
        note: "resolved_via_user_current_org",
        membership: membershipOk ? "ok" : "missing",
        hint: membershipOk ? null : "User current org set but membership row missing/revoked",
      },
      200,
      { "x-build": BUILD },
    );
  }

  // ✅ UNIVERSAL PATH 2: No user_current_org -> try a valid invite first.
  const { data: invite, error: invErr } = await admin
    .from("tracker_invites")
    .select("id, org_id, email_norm, expires_at, is_active, used_at, accepted_at, role, created_at")
    .eq("email_norm", emailNorm)
    .eq("is_active", true)
    .is("used_at", null)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invErr) return jsonResponse({ ok: false, error: "Invite lookup failed", detail: invErr.message }, 500);

  if (invite?.org_id) {
    const inviteId = String(invite.id);
    const orgId = String(invite.org_id);
    const roleToUse = (invite.role as string | null) ?? "tracker";

    const { error: upErr } = await admin
      .from("memberships")
      .upsert(
        { org_id: orgId, user_id: userId, role: roleToUse, is_default: false, revoked_at: null },
        { onConflict: "org_id,user_id" },
      );

    if (upErr) return jsonResponse({ ok: false, error: "Membership upsert failed", detail: upErr.message }, 500);

    // mark invite used (best-effort)
    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("tracker_invites")
      .update({ accepted_at: nowIso, used_at: nowIso, used_by_user_id: userId, is_active: false })
      .eq("id", inviteId)
      .eq("is_active", true)
      .is("used_at", null)
      .is("accepted_at", null);

    // ✅ set org active to invite org (canonical)
    const setErr = await setUserCurrentOrg(admin, userId, orgId);

    return jsonResponse(
      {
        ok: true,
        org_id: orgId,
        note: "invite_accepted",
        warn: updErr ? "invite_update_failed" : null,
        invite_detail: updErr ? updErr.message : null,
        warn2: setErr ? "user_current_org_set_failed" : null,
        uco_detail: setErr,
      },
      200,
      { "x-build": BUILD },
    );
  }

  // ✅ UNIVERSAL PATH 3: no invite and no user_current_org -> resolve memberships
  const ms = await listUserOrgsFromMemberships(admin, userId);
  if (ms.error) return jsonResponse({ ok: false, error: ms.error }, 500);

  if (ms.orgs.length === 0) {
    return jsonResponse(
      {
        ok: false,
        error: "No pending invite found for this email",
        hint: "User has no active membership yet; invite is required",
      },
      404,
      { "x-build": BUILD },
    );
  }

  if (ms.orgs.length === 1) {
    const orgId = ms.orgs[0];
    const setErr = await setUserCurrentOrg(admin, userId, orgId);
    return jsonResponse(
      {
        ok: true,
        org_id: orgId,
        note: "no_invite_single_membership_set_current_org",
        warn: setErr ? "user_current_org_set_failed" : null,
        detail: setErr,
      },
      200,
      { "x-build": BUILD },
    );
  }

  // ✅ Multi-org but no explicit org selected -> must be explicit.
  // DO NOT choose org automatically, DO NOT persist anything.
  return jsonResponse(
    {
      ok: false,
      error: "Org selection required",
      hint:
        "User belongs to multiple orgs. Set an explicit active org (user_current_org) before onboarding tracker.",
      orgs: ms.orgs,
    },
    409,
    { "x-build": BUILD },
  );
});
