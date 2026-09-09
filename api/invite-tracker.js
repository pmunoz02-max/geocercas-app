import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_PAIRING_EXPIRES_HOURS = 72;
const MAX_PAIRING_EXPIRES_HOURS = 24 * 14;

function normalizeUuid(value) {
  const clean = String(value || "").trim();
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRe.test(clean) ? clean : "";
}

function normalizePositiveInt(value, fallback, maxValue) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, maxValue);
}

function normalizePlanStatus(raw) {
  const value = String(raw || "").trim().toLowerCase();

  if (["active", "trialing", "trial", "paid", "current", "approved"].includes(value)) {
    return "active";
  }

  if (["canceled", "cancelled", "expired", "past_due", "inactive"].includes(value)) {
    return "inactive";
  }

  if (["free", ""].includes(value)) {
    return "free";
  }

  return "unknown";
}

function createPairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(12);
  let out = "";

  for (let i = 0; i < 12; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }

  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

function normalizePairingCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function extractBearerToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  const bearer = String(auth || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const xUserJwt = req.headers?.["x-user-jwt"] || req.headers?.["X-User-Jwt"] || "";
  return bearer || String(xUserJwt || "").trim();
}

function getOrigin(req) {
  const proto =
    req.headers["x-forwarded-proto"] ||
    (process.env.VERCEL_ENV === "production" ? "https" : "https");

  const host =
    req.headers["x-forwarded-host"] ||
    req.headers.host ||
    process.env.NEXT_PUBLIC_APP_HOST ||
    process.env.VITE_PUBLIC_APP_HOST ||
    "preview.tugeocercas.com";

  return `${proto}://${host}`.replace(/\/+$/, "");
}

function buildTrackerLinks({ req, org_id, inviteToken, runtimeToken, trackerUserId }) {
  const origin = getOrigin(req);

  const token = runtimeToken || inviteToken || "";
  const params = new URLSearchParams();

  if (token) params.set("token", token);
  if (org_id) params.set("org_id", org_id);
  if (trackerUserId) params.set("userId", trackerUserId);

  const nativeDeepLink = `geocercas://tracker?${params.toString()}`;

  const webParams = new URLSearchParams();
  if (inviteToken) webParams.set("inviteToken", inviteToken);
  if (org_id) webParams.set("org_id", org_id);

  const webFallbackUrl = `${origin}/tracker-accept?${webParams.toString()}`;

  const androidPackage = (process.env.VITE_ANDROID_PACKAGE_NAME || "com.fenice.geofieldgps").trim();

  return {
    native_deep_link: nativeDeepLink,
    web_fallback_url: webFallbackUrl,
    android_package: androidPackage,
  };
}

async function handleCreatePairingCode(req, res) {
  const body = req.body || {};

  const org_id = normalizeUuid(body.org_id || body.orgId);
  const personal_id = normalizeUuid(body.personal_id || body.personalId);
  const expiresHours = normalizePositiveInt(
    body.expires_hours || body.expiresHours,
    DEFAULT_PAIRING_EXPIRES_HOURS,
    MAX_PAIRING_EXPIRES_HOURS
  );

  if (!org_id) {
    return res.status(400).json({ ok: false, error: "org_id_required" });
  }

  if (!personal_id) {
    return res.status(400).json({ ok: false, error: "personal_id_required" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return res.status(500).json({ ok: false, error: "missing_supabase_env" });
  }

  const accessToken = extractBearerToken(req);

  if (!accessToken) {
    return res.status(401).json({ ok: false, error: "missing_auth" });
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await supabaseUser.auth.getUser(accessToken);
  const actorUserId = userData?.user?.id || null;

  if (userError || !actorUserId) {
    return res.status(401).json({ ok: false, error: "invalid_auth" });
  }

  const pairingCode = createPairingCode();
  const normalizedCode = normalizePairingCode(pairingCode);
  const codeHash = sha256Hex(normalizedCode);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("rpc_create_tracker_pairing_code", {
    p_org_id: org_id,
    p_personal_id: personal_id,
    p_code_hash: codeHash,
    p_created_by_user_id: actorUserId,
    p_expires_hours: expiresHours,
    p_email: String(body.email || "").trim() || null,
    p_max_uses: 1,
    p_revoke_existing: body.revoke_existing !== false,
  });

  if (error) {
    console.error("[api/invite-tracker] create_pairing_code rpc error", {
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
      error: result.error || "pairing_code_create_failed",
      details: result.details || null,
    });
  }

  return res.status(200).json({
    ok: true,
    pairing_code: pairingCode,
    pairing_code_normalized: normalizedCode,
    pairing_code_id: result.pairing_code_id || null,
    org_id: result.org_id || org_id,
    personal_id: result.personal_id || personal_id,
    expires_at: result.expires_at || null,
    max_uses: result.max_uses || 1,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
    });
  }

  try {
    const action = String(req.body?.action || "").trim().toLowerCase();

    if (action === "create_pairing_code") {
      return await handleCreatePairingCode(req, res);
    }

    const { org_id, email } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!org_id || !normalizedEmail) {
      return res.status(400).json({
        ok: false,
        error: "missing_org_id_or_email",
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        ok: false,
        error: "missing_supabase_env",
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ===============================
    // VALIDAR PLAN (source of truth)
    // ===============================
    const { data: billing, error: billingError } = await supabase
      .from("org_billing")
      .select("org_id, plan_status, plan_code")
      .eq("org_id", org_id)
      .maybeSingle();

    const billingRow =
      !billingError && billing && String(billing.org_id || "") === String(org_id) ? billing : null;

    if (billingError || !billingRow) {
      return res.status(403).json({
        ok: false,
        error: "plan_unavailable",
        message: "No se pudo validar el plan de la organización.",
      });
    }

    const planStatus = normalizePlanStatus(billingRow.plan_status);
    const planCode = String(billingRow.plan_code || "free").trim().toLowerCase();
    const isPlanAllowed =
      planCode === "free"
        ? planStatus === "free" || planStatus === "active"
        : planStatus === "active";

    if (!isPlanAllowed) {
      return res.status(403).json({
        ok: false,
        error: "plan_inactive",
        message: "El plan no está activo",
      });
    }

    // ===============================
    // VALIDAR IDENTIDAD TRACKER
    // personal.email + org_id + user_id
    // La persona debe existir en la organización invitante.
    // La identidad Auth y la membresía se validan al aceptar.
    // ===============================
    const { data: personalRow, error: personalError } = await supabase
      .from("personal")
      .select("id, user_id")
      .eq("org_id", org_id)
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (personalError) {
      throw personalError;
    }

    // Sending an invitation does not grant membership or require linked Auth yet.
    const resolvedPersonalRow = personalRow;
    if (!personalRow) {
      return res.status(409).json({
        ok: false,
        error: "tracker_person_required",
        message: "No se encontró la persona para el email y organización dados.",
      });
    }
    // ===============================
    // OBTENER LÍMITE DEL PLAN DESDE ORG_ENTITLEMENTS
    // ===============================
    const { data: entitlementRow, error: entitlementError } = await supabase
      .from("org_entitlements")
      .select("org_id, max_trackers")
      .eq("org_id", org_id)
      .maybeSingle();

    if (entitlementError) {
      throw entitlementError;
    }

    const validEntitlementRow =
      entitlementRow && String(entitlementRow.org_id || "") === String(org_id) ? entitlementRow : null;

    if (!validEntitlementRow) {
      return res.status(403).json({
        ok: false,
        error: "plan_unavailable",
        message: "No se pudo validar el plan de la organización.",
      });
    }

    const maxTrackers = validEntitlementRow.max_trackers;
    if (!Number.isInteger(maxTrackers) || maxTrackers < 0) {
      return res.status(403).json({
        ok: false,
        error: "plan_unavailable",
        message: "No se pudo validar el plan de la organización.",
      });
    }

    // ===============================
    // CONTAR TRACKERS ACTIVOS EN LA ORG
    // ===============================
    const { count: trackerCount, error: countError } = await supabase
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org_id)
      .eq("role", "tracker")
      .is("revoked_at", null);

    if (countError) {
      throw countError;
    }

    if (trackerCount === null || !Number.isInteger(trackerCount) || trackerCount < 0) {
      throw new Error("El conteo de trackers no es un entero no negativo.");
    }

    if (trackerCount >= maxTrackers) {
      return res.status(403).json({
        ok: false,
        error: "tracker_limit_reached",
        message: `Límite alcanzado (${trackerCount}/${maxTrackers})`,
      });
    }

    // ===============================
    // USER JWT
    // ===============================
    const userJwt =
      req.headers["x-user-jwt"] ||
      (req.headers.authorization || "").replace("Bearer ", "");

    // ===============================
    // EDGE FUNCTION (crea invitación + envío email)
    // ===============================
    const edgeUrl = `${supabaseUrl}/functions/v1/send-tracker-invite-brevo`;

    const origin = getOrigin(req);

    const upstreamRes = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-user-jwt": userJwt,
      },
      body: JSON.stringify({
        org_id,
        email: normalizedEmail,

        // Native-first tracker onboarding.
        // La Edge Function debe usar estos valores para armar el email:
        // Abrir app: geocercas://tracker?token=...&org_id=...&userId=...
        // Respaldo web: https://.../tracker-accept?inviteToken=...&org_id=...
        native_scheme: "geocercas",
        native_host: "tracker",
        android_package: (process.env.VITE_ANDROID_PACKAGE_NAME || "com.fenice.geofieldgps").trim(),
        web_origin: origin,
        web_fallback_path: "/tracker-accept",
      }),
    });

    const upstreamText = await upstreamRes.text();

    let upstreamJson = null;
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : null;
    } catch (_) {}

    if (!upstreamRes.ok) {
      console.error("[api/invite-tracker] upstream failed", {
        status: upstreamRes.status,
        body: upstreamText,
      });

      return res.status(upstreamRes.status).json({
        ok: false,
        error: upstreamJson?.error || "invite_upstream_failed",
        upstream_status: upstreamRes.status,
        upstream_body: upstreamJson || upstreamText || null,
      });
    }

    const inviteToken =
      upstreamJson?.inviteToken ||
      upstreamJson?.invite_token ||
      upstreamJson?.token ||
      null;

    const runtimeToken =
      upstreamJson?.tracker_runtime_token ||
      upstreamJson?.runtimeToken ||
      upstreamJson?.runtime_token ||
      null;

    // Asegurar que userId sea personal.user_id del invitado si existe.
    // Si la Edge Function no lo devuelve, usamos el user_id ya vinculado a personal, si existe.
    let trackerUserId = null;
    if (upstreamJson?.personal && upstreamJson.personal.user_id) {
      trackerUserId = upstreamJson.personal.user_id;
    } else if (upstreamJson?.tracker_user_id) {
      trackerUserId = upstreamJson.tracker_user_id;
    } else if (resolvedPersonalRow?.user_id) {
      trackerUserId = resolvedPersonalRow.user_id;
    }

    const trackerLinks = buildTrackerLinks({
      req,
      org_id,
      inviteToken,
      runtimeToken,
      trackerUserId,
    });

    const response = {
      ok: true,
      ...(upstreamJson || {}),
      tracker_links: trackerLinks,
    };

    if (trackerUserId) {
      response.tracker_user_id = trackerUserId;
      response.user_id = trackerUserId;
      response.userId = trackerUserId;
    } else {
      delete response.tracker_user_id;
      delete response.user_id;
      delete response.userId;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("[api/invite-tracker] fatal", err);

    return res.status(500).json({
      ok: false,
      error: "invite_internal_error",
      message: err?.message || String(err),
    });
  }
}