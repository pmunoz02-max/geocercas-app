export const config = { runtime: "nodejs" };

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function parseBody(req) {
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

export default async function handler(req, res) {
  console.log("[api/send-position] proxy_start", {
    method: req.method,
    hasAuth: !!req.headers.authorization,
  });

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "missing_supabase_env",
      });
    }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "missing_bearer_token",
      });
    }

    // Runtime tracker token is opaque. Do NOT validate it as JWT here.
    // Validation belongs to the Supabase Edge Function / runtime session layer.
    const runtimeToken = authHeader.replace("Bearer ", "").trim();
    if (!runtimeToken) {
      return res.status(401).json({
        ok: false,
        error: "empty_runtime_token",
      });
    }

    const body = parseBody(req);
    const lat = body.lat;
    const lng = body.lng;

    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_coordinates",
      });
    }

    const payload = {
      ...body,
      lat: Number(lat),
      lng: Number(lng),
      source: body.source || "tracker-native-android",
      tracker_runtime_token: body.tracker_runtime_token || runtimeToken,
    };

    console.log("[api/send-position] proxy_payload", {
      has_runtime_token: !!runtimeToken,
      user_id: payload.user_id || null,
      tracker_user_id: payload.tracker_user_id || null,
      org_id: payload.org_id || null,
      lat: payload.lat,
      lng: payload.lng,
      source: payload.source,
    });

    const edgeUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/send_position`;

    const edgeResponse = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-tracker-runtime-token": runtimeToken,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await edgeResponse.text();

    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    console.log("[api/send-position] proxy_end", {
      status: edgeResponse.status,
      ok: edgeResponse.ok,
      body: responseJson,
    });

    return res.status(edgeResponse.status).json(responseJson);
  } catch (error) {
    console.error("[api/send-position] fatal", error);
    return res.status(500).json({
      ok: false,
      error: "send_position_proxy_failed",
      detail: String(error?.message || error),
    });
  }
}
