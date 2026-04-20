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

    // 🔒 BACKEND GUARD (correcto)
    const { plan_status, max_trackers } = await getOrgEntitlements(
      supabase,
      org_id
    );

    if (plan_status !== "active") {
      return res.status(403).json({
        ok: false,
        error: "plan_inactive",
        message:
          "El plan de la organización no está activo. No se pueden invitar trackers.",
      });
    }

    const trackerCount = await countActiveTrackers(supabase, org_id);

    if (trackerCount >= max_trackers) {
      return res.status(403).json({
        ok: false,
        error: "tracker_limit_reached",
        message: `Límite alcanzado (${trackerCount}/${max_trackers})`,
      });
    }

    // 1. Extract user JWT
    const userJwt =
      req.headers["x-user-jwt"] ||
      (req.headers.authorization || "").replace("Bearer ", "");

    const edgeUrl = `${process.env.SUPABASE_URL}/functions/v1/send-tracker-invite-brevo`;

    // 2. Forward to Edge Function
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
    } catch (_) {
      upstreamJson = null;
    }

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