import { createClient } from "@supabase/supabase-js";

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

  return {
    native_deep_link: nativeDeepLink,
    web_fallback_url: webFallbackUrl,
    android_package: "com.fenice.geocercas",
  };
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
    const { org_id, email } = req.body || {};

    if (!org_id || !email) {
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
    // 🔒 VALIDAR PLAN (source of truth)
    // ===============================
    const { data: billing, error: billingError } = await supabase
      .from("org_billing")
      .select("plan_status, plan_code")
      .eq("org_id", org_id)
      .maybeSingle();

    if (billingError) {
      throw billingError;
    }

    const planStatus = billing?.plan_status ?? null;
    const planCode = billing?.plan_code ?? "free";

    if (planStatus !== "active") {
      return res.status(403).json({
        ok: false,
        error: "plan_inactive",
        message: "El plan no está activo",
      });
    }

    // ===============================
    // 🔒 VALIDAR IDENTIDAD TRACKER (personal.email+org_id y user_id)
    // ===============================
    const { data: personalRow, error: personalError } = await supabase
      .from("personal")
      .select("id, user_id")
      .eq("org_id", org_id)
      .eq("email", email)
      .maybeSingle();

    if (personalError) {
      throw personalError;
    }

    if (!personalRow || !personalRow.user_id) {
      return res.status(409).json({
        ok: false,
        error: "tracker_identity_required",
        message: "No se encontró user_id para el email y organización dados.",
      });
    }

    // ===============================
    // 🔒 OBTENER LÍMITES DEL PLAN
    // ===============================
    const { data: planLimits, error: limitsError } = await supabase
      .from("plan_limits")
      .select("max_trackers")
      .eq("plan", planCode)
      .maybeSingle();

    if (limitsError) {
      throw limitsError;
    }

    const maxTrackers = planLimits?.max_trackers ?? 0;

    // ===============================
    // 🔒 CONTAR TRACKERS ACTIVOS
    // ===============================
    const { count: trackerCount, error: countError } = await supabase
      .from("tracker_memberships")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org_id)
      .eq("status", "active");

    if (countError) {
      throw countError;
    }

    if (trackerCount >= maxTrackers) {
      return res.status(403).json({
        ok: false,
        error: "tracker_limit_reached",
        message: `Límite alcanzado (${trackerCount}/${maxTrackers})`,
      });
    }

    // ===============================
    // 🔑 USER JWT
    // ===============================
    const userJwt =
      req.headers["x-user-jwt"] ||
      (req.headers.authorization || "").replace("Bearer ", "");

    // ===============================
    // 🚀 EDGE FUNCTION (crea invitación + envío email)
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
        email,

        // Native-first tracker onboarding.
        // La Edge Function debe usar estos valores para armar el email:
        // Abrir app: geocercas://tracker?token=...&org_id=...&userId=...
        // Respaldo web: https://.../tracker-accept?inviteToken=...&org_id=...
        native_scheme: "geocercas",
        native_host: "tracker",
        android_package: "com.fenice.geocercas",
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

    // Asegurar que userId sea personal.user_id del invitado si existe
    let trackerUserId = null;
    if (upstreamJson?.personal && upstreamJson.personal.user_id) {
      trackerUserId = upstreamJson.personal.user_id;
    } else if (upstreamJson?.tracker_user_id) {
      trackerUserId = upstreamJson.tracker_user_id;
    } else {
      trackerUserId = null;
    }

    // Si no existe user_id válido, omitir userId en el deep link y respuesta
    if (!trackerUserId) {
      // Opcional: devolver error controlado si es obligatorio
      // return res.status(409).json({ ok: false, error: "tracker_identity_missing" });
    }

    const trackerLinks = buildTrackerLinks({
      req,
      org_id,
      inviteToken,
      runtimeToken,
      trackerUserId,
    });

    // Construir respuesta sin userId si no existe
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
