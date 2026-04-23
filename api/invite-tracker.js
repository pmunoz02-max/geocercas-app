import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const { org_id, email } = req.body || {};

    if (!org_id || !email) {
      return res.status(400).json({
        ok: false,
        error: "missing_org_id_or_email",
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

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
    // 🚀 EDGE FUNCTION (envío email)
    // ===============================
    const edgeUrl = `${process.env.SUPABASE_URL}/functions/v1/send-tracker-invite-brevo`;

    const upstreamRes = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "x-user-jwt": userJwt,
      },
      body: JSON.stringify({ org_id, email }),
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

    return res.status(200).json({
      ok: true,
      ...(upstreamJson || {}),
    });
  } catch (err) {
    console.error("[api/invite-tracker] fatal", err);

    return res.status(500).json({
      ok: false,
      error: "invite_internal_error",
      message: err?.message || String(err),
    });
  }
}