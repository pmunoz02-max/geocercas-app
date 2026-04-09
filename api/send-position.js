export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }


  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");

    let incomingBody;
    try {
      incomingBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_json" });
    }

    // Log received keys
    console.log("[api/send-position] received body keys", Object.keys(incomingBody));

    // Validate org_id only from body
    const orgId = incomingBody.org_id;
    if (!orgId || typeof orgId !== "string" || !orgId.trim()) {
      console.error("[api/send-position] missing or invalid org_id", { orgId });
      return res.status(400).json({ ok: false, error: "missing_org_id" });
    }

    // ==============================
    // FLAGS OPERATIVOS
    // ==============================
    const {
      permissions_ok = null,
      battery_optimized = null,
      background_allowed = null,
      service_running = null,
      source = null,
      battery = null,
      is_mock = null,
      speed = null,
      heading = null,
      device_recorded_at = null,
      recorded_at = null,
    } = incomingBody;

    const normalizedRecordedAt =
      device_recorded_at || recorded_at || new Date().toISOString();

    // ==============================
    // PAYLOAD POSITIONS (histórico)
    // ==============================
    const positionsPayload = {
      battery,
      is_mock,
      source,
      speed,
      heading,
      recorded_at: normalizedRecordedAt,
    };

    // ==============================
    // PAYLOAD TRACKER_LATEST (estado vivo)
    // ==============================
    const trackerLatestPayload = {
      permissions_ok,
      battery_optimized,
      background_allowed,
      service_running,
      source,
      battery,
      is_mock,
      speed,
      heading,
      device_recorded_at: normalizedRecordedAt,
    };

    // ==============================
    // BODY FINAL HACIA SUPABASE
    // ==============================
    const forwardBody = JSON.stringify({
      ...incomingBody,
      positions_payload: positionsPayload,
      tracker_latest_payload: trackerLatestPayload,
    });

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(503).json({
        ok: false,
        error: "missing_env",
      });
    }


    // Forward Authorization header exactly as received (case-insensitive)
    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const upstreamUrl = `${supabaseUrl}/functions/v1/send_position`;

    console.log("[api/send-position] proxy_start", {
      hasAuth: Boolean(authHeader),
      upstreamUrl,
      forwardedAuthorization: authHeader,
    });

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: authHeader,
      },
      body: forwardBody,
    });

    const text = await upstream.text();

    console.log("[api/send-position] proxy_end", {
      status: upstream.status,
      ok: upstream.ok,
    });

    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json"
    );

    return res.send(text);
  } catch (error) {
    console.error("[api/send-position] proxy_error", error);

    return res.status(500).json({
      ok: false,
      error: "proxy_failed",
      message: error?.message || "unknown_error",
    });
  }
}