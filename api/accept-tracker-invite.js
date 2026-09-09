import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const DEFAULT_RUNTIME_EXPIRES_HOURS = 720;
const MAX_RUNTIME_EXPIRES_HOURS = 24 * 90;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function createOpaqueRuntimeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizePositiveInt(value, fallback, maxValue) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, maxValue);
}

function normalizePairingCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing_supabase_env");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function getSupabaseAnonWithToken(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("missing_supabase_anon_env");
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()] || req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(req) {
  if (!req.body) return {};

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

function getQueryValue(req, key) {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0];
  if (value) return value;

  try {
    const url = new URL(req.url || "", "https://local.invalid");
    return url.searchParams.get(key) || "";
  } catch {
    return "";
  }
}

function extractBearerToken(req) {
  const authHeader = getHeader(req, "authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

function extractInviteToken(req, body) {
  return String(
    extractBearerToken(req) ||
      body?.token ||
      body?.inviteToken ||
      body?.invite_token ||
      getHeader(req, "x-invite-token") ||
      getQueryValue(req, "token") ||
      getQueryValue(req, "inviteToken") ||
      getQueryValue(req, "invite_token") ||
      ""
  ).trim();
}

function resolveTrackerLimit(org) {
  const limits = {
    starter: 1,
    pro: 10,
    business: 50,
    enterprise: 9999,
  };

  const plan = String(org?.plan || "starter").toLowerCase();
  return limits[plan] ?? 1;
}

function getTrackerLimitFromBillingRow(billingRow) {
  const limits = {
    starter: 1,
    pro: 10,
    business: 50,
    enterprise: 9999,
  };

  const planCode = String(billingRow?.plan_code || "starter").toLowerCase();
  const fallback = limits[planCode] ?? 1;
  const override = Number(billingRow?.tracker_limit_override);

  return Number.isFinite(override) && override > 0 ? override : fallback;
}

function isExpired(value) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

async function resolvePlanAndLimit(supabase, orgId) {
  let trackerLimit = 1;
  let planStatus = "active";

  try {
    const { data: billingRow } = await supabase
      .from("org_billing")
      .select("plan_code, plan_status, tracker_limit_override")
      .eq("org_id", orgId)
      .maybeSingle();

    if (billingRow) {
      planStatus = String(billingRow.plan_status || "active").toLowerCase();
      trackerLimit = getTrackerLimitFromBillingRow(billingRow);
      return { planStatus, trackerLimit };
    }
  } catch (error) {
    console.warn("[api/accept-tracker-invite] org_billing lookup skipped", {
      error: String(error?.message || error),
    });
  }

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();

  trackerLimit = resolveTrackerLimit(orgRow);
  return { planStatus, trackerLimit };
}

function resolveTrackerUserId({ invite, body, personalRow }) {
  // Si existe personalRow, solo aceptar si tiene user_id
  if (personalRow) {
    if (personalRow.user_id) return personalRow.user_id;
    return null; // No usar personal.id como tracker_user_id
  }
  // Si no hay personal, usar los campos explícitos del body o invite
  return (
    body?.tracker_user_id ||
    body?.trackerUserId ||
    invite?.tracker_user_id ||
    invite?.used_by_user_id ||
    invite?.created_for_user_id ||
    invite?.created_by_user_id ||
    null
  );
}

async function findOrCreatePersonalRow(supabase, invite, orgId) {
  const inviteEmail = normalizeEmail(invite?.email);
  if (!inviteEmail || !orgId) return null;

  const { data: foundPersonal, error: findError } = await supabase
    .from("personal")
    .select("id,user_id,email,org_id")
    .eq("email", inviteEmail)
    .eq("org_id", orgId)
    .maybeSingle();

  if (findError) {
    console.warn("[api/accept-tracker-invite] personal lookup error", {
      error: findError.message,
    });
  }

  if (foundPersonal) return foundPersonal;

  const { data: insertedPersonal, error: insertError } = await supabase
    .from("personal")
    .insert({ email: inviteEmail, org_id: orgId })
    .select("id,user_id,email,org_id")
    .maybeSingle();

  if (insertError) {
    console.warn("[api/accept-tracker-invite] personal insert skipped", {
      error: insertError.message,
    });
    return null;
  }

  return insertedPersonal || null;
}

async function ensureTrackerMembership(supabase, orgId, trackerUserId, trackerLimit) {
  if (!orgId || !trackerUserId) {
    return { ok: false, error: "missing_tracker_identity" };
  }

  const { data: existingMembership, error: membershipLookupError } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", trackerUserId)
    .eq("role", "tracker")
    .is("revoked_at", null)
    .maybeSingle();

  if (membershipLookupError) {
    console.warn("[api/accept-tracker-invite] membership lookup error", {
      error: membershipLookupError.message,
    });
  }

  if (existingMembership?.id) {
    return { ok: true, alreadyExisted: true };
  }

  const { count: trackerCount, error: countError } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "tracker")
    .is("revoked_at", null);

  if (countError) {
    console.warn("[api/accept-tracker-invite] membership count error", {
      error: countError.message,
    });
  }

  if ((trackerCount ?? 0) >= trackerLimit) {
    return {
      ok: false,
      error: "tracker_limit_reached",
      message: `La organización alcanzó el límite de ${trackerLimit} trackers para su plan.`,
    };
  }

  const { error: insertMembershipError } = await supabase.from("memberships").insert({
    org_id: orgId,
    user_id: trackerUserId,
    role: "tracker",
  });

  if (insertMembershipError) {
    console.warn("[api/accept-tracker-invite] membership insert skipped", {
      error: insertMembershipError.message,
    });
  }

  return { ok: true, alreadyExisted: false };
}

async function persistRuntimeSession(supabase, { orgId, trackerUserId, inviteId }) {
  const runtimeToken = createOpaqueRuntimeToken();
  const accessTokenHash = sha256Hex(runtimeToken);
  const now = new Date();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await supabase
      .from("tracker_runtime_sessions")
      .update({
        active: false,
        revoked_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("org_id", orgId)
      .eq("tracker_user_id", trackerUserId)
      .eq("active", true);
  } catch (error) {
    console.warn("[api/accept-tracker-invite] old session revoke skipped", {
      error: String(error?.message || error),
    });
  }

  const { data: insertedSession, error: insertSessionError } = await supabase
    .from("tracker_runtime_sessions")
    .insert({
      org_id: orgId,
      tracker_user_id: trackerUserId,
      access_token_hash: accessTokenHash,
      token_version: 1,
      source: "tracker-native-android",
      active: true,
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id,org_id,tracker_user_id,active,issued_at,expires_at")
    .maybeSingle();

  if (insertSessionError) {
    throw new Error(`runtime_session_insert_failed: ${insertSessionError.message}`);
  }

  console.log("[api/accept-tracker-invite] runtime session created", {
    session_id: insertedSession?.id || null,
    invite_id: inviteId,
    org_id: orgId,
    tracker_user_id: trackerUserId,
    access_token_hash_prefix: accessTokenHash.slice(0, 12),
  });

  return {
    runtimeToken,
    expiresAt,
    insertedSession,
  };
}

async function markInviteUsed(supabase, inviteId, trackerUserId) {
  if (!inviteId) return;

  try {
    await supabase
      .from("tracker_invites")
      .update({
        used_at: new Date().toISOString(),
        used_by_user_id: trackerUserId,
      })
      .eq("id", inviteId);
  } catch (error) {
    console.warn("[api/accept-tracker-invite] invite update skipped", {
      error: String(error?.message || error),
    });
  }
}

async function handleClaimPairingCode(req, res, body) {
  const accessToken = extractBearerToken(req);

  if (!accessToken) {
    return res.status(401).json({ ok: false, error: "missing_auth" });
  }

  const rawCode = body?.pairing_code || body?.pairingCode || body?.code || "";
  const normalizedCode = normalizePairingCode(rawCode);

  if (normalizedCode.length < 8) {
    return res.status(400).json({ ok: false, error: "pairing_code_required" });
  }

  let trackerUser = null;

  try {
    const supabaseUser = getSupabaseAnonWithToken(accessToken);
    const { data: userData, error: userError } = await supabaseUser.auth.getUser(accessToken);

    if (userError || !userData?.user?.id) {
      return res.status(401).json({ ok: false, error: "invalid_auth" });
    }

    trackerUser = userData.user;
  } catch (error) {
    console.error("[api/accept-tracker-invite] claim auth failed", {
      error: String(error?.message || error),
    });

    return res.status(500).json({ ok: false, error: "claim_auth_failed" });
  }

  const runtimeExpiresHours = normalizePositiveInt(
    body?.runtime_expires_hours || body?.runtimeExpiresHours,
    DEFAULT_RUNTIME_EXPIRES_HOURS,
    MAX_RUNTIME_EXPIRES_HOURS
  );

  const codeHash = sha256Hex(normalizedCode);
  const trackerEmail = normalizeEmail(trackerUser.email);

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("rpc_claim_tracker_pairing_code", {
    p_code_hash: codeHash,
    p_tracker_user_id: trackerUser.id,
    p_tracker_email: trackerEmail || null,
    p_runtime_expires_hours: runtimeExpiresHours,
  });

  if (error) {
    console.error("[api/accept-tracker-invite] claim_pairing_code rpc error", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    return res.status(500).json({ ok: false, error: "rpc_error" });
  }

  const result = data && typeof data === "object" ? data : {};

  if (!result.ok) {
    return res.status(400).json({
      ok: false,
      error: result.error || "pairing_code_claim_failed",
      details: result.details || null,
      existing_personal_id: result.existing_personal_id || null,
    });
  }

  const runtimeToken =
    result.tracker_runtime_token ||
    result.tracker_access_token ||
    null;

  if (!runtimeToken) {
    return res.status(500).json({ ok: false, error: "runtime_token_missing" });
  }

  return res.status(200).json({
    ok: true,
    org_id: result.org_id || null,
    orgId: result.org_id || null,
    personal_id: result.personal_id || null,
    personalId: result.personal_id || null,
    tracker_user_id: result.tracker_user_id || trackerUser.id,
    user_id: result.tracker_user_id || trackerUser.id,
    userId: result.tracker_user_id || trackerUser.id,
    tracker_runtime_token: runtimeToken,
    runtimeToken,
    tracker_access_token: runtimeToken,
    access_token: runtimeToken,
    runtime_expires_at: result.runtime_expires_at || null,
    expires_at: result.runtime_expires_at || null,
    frequency_minutes: 1,
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    const body = await readBody(req);
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "claim_pairing_code") {
      return await handleClaimPairingCode(req, res, body);
    }

    const inviteToken = extractInviteToken(req, body);

    console.log("[api/accept-tracker-invite] request", {
      hasInviteToken: !!inviteToken,

      bodyHasToken: Boolean(body?.token || body?.inviteToken || body?.invite_token),
      bodyHasOrgId: Boolean(body?.org_id || body?.orgId),
      bodyHasUserId: Boolean(
        body?.tracker_user_id || body?.trackerUserId || body?.user_id || body?.userId
      ),
    });

    if (!inviteToken) {
      return res.status(401).json({ ok: false, error: "missing_invite_token" });
    }

    const supabase = getSupabase();
    const tokenHash = sha256Hex(inviteToken);

    const { data: invite, error: inviteLookupError } = await supabase
      .from("tracker_invites")
      .select("*")
      .eq("invite_token_hash", tokenHash)
      .maybeSingle();

    if (inviteLookupError) {
      console.error("[api/accept-tracker-invite] invite lookup error", {
        error: inviteLookupError.message,
      });
      return res.status(500).json({ ok: false, error: "invite_lookup_failed" });
    }

    if (!invite) {
      return res.status(404).json({ ok: false, error: "invite_not_found" });
    }

    if (isExpired(invite.expires_at)) {
      return res.status(410).json({ ok: false, error: "invite_expired" });
    }

    if (invite.is_active === false || invite.active === false || invite.revoked_at) {
      return res.status(410).json({ ok: false, error: "invite_inactive" });
    }

    const orgId = invite.org_id || body?.org_id || body?.orgId || null;

    if (!orgId) {
      return res.status(400).json({ ok: false, error: "missing_org_id" });
    }

    const requestedOrgId = body?.org_id || body?.orgId;
    if (requestedOrgId && String(requestedOrgId) !== String(invite.org_id)) {
      return res.status(409).json({ ok: false, error: "invite_org_mismatch" });
    }

    // Delegate identity, plan, quota and atomic membership acceptance to the
    // deployed Edge Function. Pairing-code handling above remains independent.
    const upstream = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/accept-tracker-invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ org_id: invite.org_id, inviteToken }),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        ok: false,
        error: typeof data?.error === "string" ? data.error : "accept_upstream_failed",
        ...(data?.retryable === true ? { retryable: true } : {}),
      });
    }
    const runtimeToken = data?.session?.access_token;
    if (data?.ok !== true || data?.org_id !== invite.org_id ||
        typeof runtimeToken !== "string" || !runtimeToken ||
        typeof data?.tracker_user_id !== "string" || !data.tracker_user_id) {
      return res.status(502).json({ ok: false, error: "invalid_acceptance_response" });
    }
    return res.status(200).json({
      ok: true,
      already_accepted: data.already_accepted,
      tracker_runtime_token: runtimeToken,
      runtimeToken,
      tracker_access_token: runtimeToken,
      access_token: runtimeToken,
      tracker_user_id: data.tracker_user_id,
      user_id: data.tracker_user_id,
      userId: data.tracker_user_id,
      org_id: data.org_id,
      orgId: data.org_id,
      invite_id: invite.id,
      frequency_minutes: 1,
    });
  } catch (error) {
    console.error("[api/accept-tracker-invite] unhandled", {
      error: String(error?.message || error),
    });

    return res.status(500).json({
      ok: false,
      error: "accept_tracker_invite_failed",
      message: String(error?.message || error),
    });
  }
}