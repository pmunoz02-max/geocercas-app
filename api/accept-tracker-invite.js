export const config = {
  runtime: "nodejs",
};

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const RUNTIME_SESSION_HOURS = 24 * 7;

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

async function rotateRuntimeSession(supabase, { orgId, trackerUserId }) {
  const plainToken = randomToken();
  const tokenHash = sha256Hex(plainToken);

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(
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

  return { ok: true, token: plainToken };
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

    // 🔥 FIX CLAVE
    if (!invite.is_active && !alreadyAccepted) {
      return res.status(409).json({
        ok: false,
        message: "Invite inactive",
      });
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

    const runtime = await rotateRuntimeSession(supabase, {
      orgId: invite.org_id,
      trackerUserId,
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
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: String(e?.message || e),
    });
  }
}