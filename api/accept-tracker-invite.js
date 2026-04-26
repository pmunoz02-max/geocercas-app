import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
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

  const fallback = limits[String(billingRow?.plan_code || "starter")] ?? 1;
  const override = Number(billingRow?.tracker_limit_override);

  if (Number.isFinite(override) && override > 0) {
    return override;
  }

  return fallback;
}

function sha256Hex(v) {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function extractBearerToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
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

function createRuntimeJwt(payload) {
  return jwt.sign(payload, getTrackerRuntimeJwtSecret(), {
    expiresIn: "7d",
  });
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
      return res.status(404).json({ ok: false });
    }

    const orgId = invite.org_id;

    // 🔥 FIX límite
    let trackerLimit = 1;
    let planStatus = "active";

    try {
      const { data: billingRow } = await supabase
        .from("org_billing")
        .select("plan_code, plan_status, tracker_limit_override")
        .eq("org_id", orgId)
        .maybeSingle();

      if (billingRow?.plan_status) {
        planStatus = String(billingRow.plan_status).toLowerCase();
        trackerLimit = getTrackerLimitFromBillingRow(billingRow);
      } else {
        const { data: orgRow } = await supabase
          .from("organizations")
          .select("plan")
          .eq("id", orgId)
          .maybeSingle();

        trackerLimit = resolveTrackerLimit(orgRow);
      }
    } catch {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("plan")
        .eq("id", orgId)
        .maybeSingle();

      trackerLimit = resolveTrackerLimit(orgRow);
    }

    if (planStatus !== "active") {
      return res.status(403).json({ ok: false });
    }

    const { count: trackerCount } = await supabase
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "tracker")
      .is("revoked_at", null);

    if ((trackerCount ?? 0) >= trackerLimit) {
      return res.status(403).json({
        ok: false,
        error: "tracker_limit_reached",
        message: `La organización alcanzó el límite de ${trackerLimit} trackers para su plan.`,
      });
    }

    // 🔥 CONTINÚA FLUJO (clave)
    const trackerUserId = invite.used_by_user_id || invite.created_by_user_id;

    const runtimeToken = createRuntimeJwt({
      sub: trackerUserId,
      org_id: orgId,
      invite_id: invite.id,
    });

    return res.status(200).json({
      ok: true,
      tracker_runtime_token: runtimeToken,
      tracker_user_id: trackerUserId,
      org_id: orgId,
      invite_id: invite.id,
      frequency_minutes: 1,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: String(e?.message || e),
    });
  }
}