export const config = {
  runtime: "nodejs",
};

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const RUNTIME_SESSION_HOURS = 24 * 7;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getTrackerRuntimeJwtSecret() {
  const secret =
    process.env.TRACKER_RUNTIME_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "";

  if (!secret) {
    throw new Error("Missing tracker runtime JWT secret");
  }

  return secret;
}

function createRuntimeJwt({ trackerUserId, orgId, inviteId, frequencyMinutes }) {
  const secret = getTrackerRuntimeJwtSecret();
  const expiresInSeconds = RUNTIME_SESSION_HOURS * 60 * 60;

  const token = jwt.sign(
    {
      sub: String(trackerUserId),
      org_id: String(orgId),
      invite_id: inviteId ? String(inviteId) : null,
      type: "tracker_runtime",
      frequency_minutes: frequencyMinutes,
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: expiresInSeconds,
    }
  );

  const decoded = jwt.decode(token);

  return {
    token,
    exp:
      decoded && typeof decoded === "object" && decoded.exp
        ? Number(decoded.exp)
        : null,
  };
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

  let query = supabase
    .from("personal")
    .select("user_id")
    .eq("org_id", orgId)
    .limit(1);

  if (emailNorm) {
    query = query.eq("email_norm", emailNorm);
  } else {
    query = query.eq("email", rawEmail);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data?.user_id) {
    return { trackerUserId: null, error: "tracker_user_not_found" };
  }

  return { trackerUserId: data.user_id, error: null };
}

async function rotateRuntimeSession(supabase, { orgId, trackerUserId, inviteId, frequencyMinutes }) {
  const runtimeJwt = createRuntimeJwt({
    trackerUserId,
    orgId,
    inviteId,
    frequencyMinutes,
  });

  const plainToken = runtimeJwt.token;
  const tokenHash = sha256Hex(plainToken);

  const now = new Date();
  const nowIso = now.toISOString();

  const expiresAt = runtimeJwt.exp
    ? new Date(runtimeJwt.exp * 1000).toISOString()
    : new Date(
        now.getTime() + RUNTIME_SESSION_HOURS * 3600 * 1000
      ).toISOString();

  await supabase
    .from("tracker_runtime_sessions")
    .update({ active: false })
    .eq("org_id", orgId)
    .eq("tracker_user_id", trackerUserId)
    .eq("active", true);

  const { data, error } = await supabase
    .from("tracker_runtime_sessions")
    .insert([
      {
        org_id: orgId,
        tracker_user_id: trackerUserId,
        access_token_hash: tokenHash,
        active: true,
        expires_at: expiresAt,
        last_seen_at: nowIso,
      },
    ])
    .select()
    .single();

  if (error || !data) {
    return { ok: false };
  }

  return {
    ok: true,
    token: plainToken,
    expires_at: expiresAt,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false });
    }

    const inviteToken = extractBearerToken(req);
    if (!inviteToken) {
      return res.status(401).json({ ok: false });
    }

    const supabase = getSupabase();
    const tokenHash = sha256Hex(inviteToken);

    const { data: invite } = await supabase
      .from("tracker_invites")
      .select("*")
      .eq("invite_token_hash", tokenHash)
      .maybeSingle();

    if (!invite) {
      return res.status(404).json({ ok: false, message: "Invite not found" });
    }

    const alreadyAccepted = !!invite.accepted_at;

    if (!invite.is_active && !alreadyAccepted) {
      console.log("[invite] inactive, trying fallback");

      const { data: latest } = await supabase
        .from("tracker_invites")
        .select("*")
        .eq("email_norm", invite.email_norm)
        .eq("org_id", invite.org_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        console.log("[invite] fallback success", latest.id);
        invite = latest;
      } else {
        console.log("[invite] fallback failed");
        return res.status(409).json({
          ok: false,
          message: "Invite inactive",
        });
      }
    }

    if (
      invite.expires_at &&
      new Date(invite.expires_at) < new Date() &&
      !alreadyAccepted
    ) {
      return res.status(410).json({
        ok: false,
        message: "Invite expired",
      });
    }

    const { trackerUserId, error } = await resolveTrackerUserId(
      supabase,
      invite
    );

    if (!trackerUserId) {
      return res.status(409).json({
        ok: false,
        message: error,
      });
    }

    const nowIso = new Date().toISOString();

    if (!alreadyAccepted) {
      await supabase
        .from("tracker_invites")
        .update({
          accepted_at: nowIso,
          used_at: nowIso,
        })
        .eq("id", invite.id);
    }

    const { data: assignments } = await supabase
      .from("tracker_assignments")
      .select("frequency_minutes, start_date, end_date, created_at")
      .eq("org_id", invite.org_id)
      .eq("tracker_user_id", trackerUserId)
      .eq("active", true)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    const assignment = (assignments || []).find((a) => {
      const startOk =
        !a.start_date || new Date(a.start_date) <= new Date(nowIso);

      const endOk =
        !a.end_date || new Date(a.end_date) >= new Date(nowIso);

      return startOk && endOk;
    });

    const rawFrequencyMinutes = Number(assignment?.frequency_minutes);
    const frequencyMinutes =
      Number.isFinite(rawFrequencyMinutes) && rawFrequencyMinutes >= 1
        ? Math.floor(rawFrequencyMinutes)
        : 1;

    const runtime = await rotateRuntimeSession(supabase, {
      orgId: invite.org_id,
      trackerUserId,
      inviteId: invite.id,
      frequencyMinutes,
    });

    if (!runtime.ok) {
      return res.status(500).json({ ok: false });
    }

    return res.status(200).json({
      ok: true,
      idempotent: alreadyAccepted,
      tracker_runtime_token: runtime.token,
      tracker_user_id: trackerUserId,
      org_id: invite.org_id,
      invite_id: invite.id,
      frequency_minutes: frequencyMinutes,
      expires_at: runtime.expires_at,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: String(e?.message || e),
    });
  }
}