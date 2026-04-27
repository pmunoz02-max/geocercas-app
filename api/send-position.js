import jwt from "jsonwebtoken";

export const config = { runtime: "nodejs" };

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getTrackerRuntimeJwtSecret() {
  const secret =
    process.env.TRACKER_RUNTIME_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "";

  if (!secret) throw new Error("Missing tracker runtime JWT secret");
  return secret;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
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

    const token = authHeader.replace("Bearer ", "").trim();

    let decoded;
    try {
      decoded = jwt.verify(token, getTrackerRuntimeJwtSecret());
    } catch (err) {
      console.error("[api/send-position] invalid runtime token", err);
      return res.status(401).json({
        ok: false,
        error: "invalid_runtime_token",
        detail: String(err?.message || err),
      });
    }

    const trackerUserId =
      decoded.tracker_user_id ||
      decoded.user_id ||
      decoded.sub;

    const orgId = decoded.org_id;

    if (!trackerUserId || !orgId) {
      return res.status(401).json({
        ok: false,
        error: "missing_runtime_claims",
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

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
      user_id: trackerUserId,
      tracker_user_id: trackerUserId,
      org_id: orgId,
      lat: Number(lat),
      lng: Number(lng),
      source: body.source || "tracker-native-android",
    };

    console.log("[api/send-position] proxy_payload", {
      user_id: payload.user_id,
      org_id: payload.org_id,
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