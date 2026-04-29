export const config = { runtime: "nodejs" };

import crypto from "node:crypto";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function getHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()] || req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(req) {
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

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function resolveRuntimeSession(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  const baseUrl = SUPABASE_URL.replace(/\/$/, "");
  const accessTokenHash = sha256Hex(token);
  const url = `${baseUrl}/rest/v1/tracker_runtime_sessions?select=*&access_token_hash=eq.${accessTokenHash}&active=eq.true&limit=1`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[api/send-position] runtime_session_lookup_not_ok", {
        status: response.status,
        body: text?.slice?.(0, 300),
      });
      return null;
    }

    const rows = await response.json();

    if (Array.isArray(rows) && rows.length > 0) {
      const session = rows[0];

      const patchUrl = `${baseUrl}/rest/v1/tracker_runtime_sessions?id=eq.${session.id}`;
      await fetch(patchUrl, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });

      return session;
    }
  } catch (error) {
    console.warn("[api/send-position] runtime_session_lookup_error", {
      error: String(error?.message || error),
    });
  }

  return null;
}

export default async function handler(req, res) {
  console.log("[api/send-position] proxy_start", {
    method: req.method,
    hasAuth: !!getHeader(req, "authorization"),
  });

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ ok: false, error: "missing_supabase_env" });
    }

    const authHeader = getHeader(req, "authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing_bearer_token" });
    }

    const runtimeToken = authHeader.replace("Bearer ", "").trim();
    const runtimeTokenHashPrefix = sha256Hex(runtimeToken).slice(0, 12);
    const body = await readBody(req);

    const session = await resolveRuntimeSession(runtimeToken);

    const trackerUserId =
      body.user_id ||
      body.tracker_user_id ||
      body.trackerUserId ||
      getHeader(req, "x-tracker-user-id") ||
      getHeader(req, "x-user-id") ||
      session?.tracker_user_id ||
      null;

    const orgId =
      body.org_id ||
      body.orgId ||
      getHeader(req, "x-org-id") ||
      session?.org_id ||
      null;

    const lat = body.lat ?? body.latitude;
    const lng = body.lng ?? body.longitude;

    if (!trackerUserId) {
      return res.status(400).json({ ok: false, error: "missing_user_id" });
    }

    if (!orgId) {
      return res.status(400).json({ ok: false, error: "missing_org_id" });
    }

    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      return res.status(400).json({ ok: false, error: "invalid_coordinates" });
    }

    const payload = {
      ...body,
      user_id: trackerUserId,
      tracker_user_id: trackerUserId,
      org_id: orgId,
      lat: Number(lat),
      lng: Number(lng),
      accuracy: body.accuracy == null ? null : Number(body.accuracy),
      speed: body.speed == null ? null : Number(body.speed),
      heading: body.heading == null ? null : Number(body.heading),
      battery: body.battery == null ? null : Number(body.battery),
      is_mock: body.is_mock ?? body.isMock ?? null,
      recorded_at:
        body.recorded_at ||
        body.recordedAt ||
        body.timestamp ||
        new Date().toISOString(),
      source: body.source || "tracker-native-android",
    };

    console.log("[api/send-position] proxy_payload", {
      has_runtime_token: true,
      token_hash_prefix: runtimeTokenHashPrefix,
      user_id: payload.user_id,
      tracker_user_id: payload.tracker_user_id,
      org_id: payload.org_id,
      lat: payload.lat,
      lng: payload.lng,
      source: payload.source,
      hasSession: !!session,
    });

    const edgeUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/send_position`;

    const edgeResponse = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-runtime-token": runtimeToken,
        "x-proxy-source": "vercel-api-send-position",
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