import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "nodejs",
};

// --- Normalizadores ---
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildIdentityKeyFromEmail(email) {
  const normalized = normalizeEmail(email);
  return normalized ? `e:${normalized}` : "";
}

// 🔥 FIX CENTRAL
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

function normalizePlanCode(value) {
  return String(value || "starter").toLowerCase().trim();
}

function getTrackerLimitFromBillingRow(billingRow) {
  const planCode = normalizePlanCode(billingRow?.plan_code);
  const limits = {
    starter: 1,
    pro: 10,
    business: 50,
    enterprise: 9999,
  };
  const fallback = limits[planCode] ?? 1;
  const override = Number(billingRow?.tracker_limit_override);
  // Only use override if > 0
  if (Number.isFinite(override) && override > 0) {
    return override;
  }
  return fallback;
}

const RUNTIME_SESSION_HOURS = 24 * 7;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

    let { data: invite } = await supabase
      .from("tracker_invites")
      .select("*")
      .eq("invite_token_hash", tokenHash)
      .maybeSingle();

    if (!invite) {
      return res.status(404).json({ ok: false });
    }

    const orgId = invite.org_id;

    // 🔥 LÓGICA LIMPIA (SIN DUPLICADOS)
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
    } catch (e) {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("plan")
        .eq("id", orgId)
        .maybeSingle();

      trackerLimit = resolveTrackerLimit(orgRow);
    }

    if (planStatus !== "active") {
      return res.status(403).json({
        ok: false,
        error: "plan_inactive",
      });
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

    // resto del flujo intacto...

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: String(e?.message || e),
    });
  }
}