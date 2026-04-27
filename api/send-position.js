
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
function getTrackerRuntimeJwtSecret() {
  const secret =
    process.env.TRACKER_RUNTIME_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "";
  if (!secret) throw new Error("Missing tracker runtime JWT secret");
  return secret;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars for send-position");
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function todayUtcDateString() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildPointWkt(lng, lat) {
  return `SRID=4326;POINT(${Number(lng)} ${Number(lat)})`;
}

export default async function handler(req, res) {

  const authHeader = req.headers.authorization || req.headers.Authorization;

  console.log("[send-position] request started", {
    method: req.method,
    hasAuth: !!authHeader,
  });

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ ok: false, error: "invalid_json" });
      }
    }

    const {
      org_id,
      lat,
      lng,
      accuracy,
      speed,
      heading,
      battery,
      is_mock,
      timestamp,
      recorded_at,
      device_recorded_at,
      source,
      permissions_ok,
      battery_optimized,
      background_allowed,
      service_running,
    } = body || {};


    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing_bearer_token" });
    }

    if (!org_id || !isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }


    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json({ ok: false, error: "empty_token" });
    }


    // Verify and decode tracker runtime JWT
    let decodedJwt = null;
    try {
      decodedJwt = jwt.verify(token, getTrackerRuntimeJwtSecret());
    } catch (e) {
      console.warn("[send-position] invalid tracker runtime JWT", e?.message || e);
      return res.status(401).json({ ok: false, error: "invalid_token_jwt", detail: String(e?.message || e) });
    }

    // Extract tracker_user_id and org_id from JWT
    const tracker_user_id = decodedJwt.sub || decodedJwt.tracker_user_id;
    const org_id_from_jwt = decodedJwt.org_id;
    if (!tracker_user_id || !org_id_from_jwt) {
      return res.status(401).json({ ok: false, error: "missing_claims_in_jwt" });
    }

    // Prefer org_id from JWT for all logic below
    // Overwrite org_id from body with JWT value
    body.org_id = org_id_from_jwt;
    // ...existing code...

    const tokenHash = sha256Hex(token);
    const nowIso = new Date().toISOString();
    const todayUtc = todayUtcDateString();

    // ...existing code...

    const { data: assignmentRows, error: assignmentError } = await adminClient
      .from("tracker_assignments")
      .select("id, tracker_user_id, org_id, active, start_date, end_date")
      .eq("tracker_user_id", tracker_user_id)
      .eq("org_id", org_id)
      .eq("active", true);

    if (assignmentError) {
      console.error("[send-position] assignment lookup error", assignmentError);
      return res.status(500).json({
        ok: false,
        error: "assignment_lookup_failed",
        detail: assignmentError.message,
      });
    }

    const validAssignment = (assignmentRows || []).find((row) => {
      const start = row?.start_date ? String(row.start_date).slice(0, 10) : null;
      const end = row?.end_date ? String(row.end_date).slice(0, 10) : null;
      const startOk = !start || start <= todayUtc;
      const endOk = !end || end >= todayUtc;
      return startOk && endOk;
    });

    if (!validAssignment) {
      console.warn("[send-position] tracker not assigned", {
        org_id,
        tracker_user_id,
      });
      return res.status(403).json({
        ok: false,
        error: "tracker_not_assigned",
      });
    }

    const recordedAt =
      recorded_at ||
      device_recorded_at ||
      timestamp ||
      nowIso;

    const runtimeSource =
      typeof source === "string" && source.trim()
        ? source.trim()
        : "tracker_runtime";

    const numericLat = Number(lat);
    const numericLng = Number(lng);
    const geomWkt = buildPointWkt(numericLng, numericLat);



    // Forward to Supabase Edge Function
    try {
      const edgeRes = await fetch(
        `${process.env.SUPABASE_URL}/functions/v1/send_position`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_id: tracker_user_id,
            org_id: org_id_from_jwt,
            lat: numericLat,
            lng: numericLng,
            source: "tracker-native-android",
          }),
        }
      );
      const edgeJson = await edgeRes.json();
      if (!edgeRes.ok) {
        return res.status(edgeRes.status).json({
          ok: false,
          error: "edge_function_error",
          detail: edgeJson,
        });
      }
      return res.status(200).json({
        ok: true,
        edge: edgeJson,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "edge_function_request_failed",
        detail: String(err?.message || err),
      });
    }

    const latestPayload = {
      org_id,
      user_id: tracker_user_id,
      event: "POSITION",
      lat: numericLat,
      lng: numericLng,
      accuracy: accuracy ?? null,
      ts: recordedAt,
      geom: geomWkt,
      permissions_ok:
        permissions_ok === undefined ? true : !!permissions_ok,
      battery_optimized:
        battery_optimized === undefined ? null : !!battery_optimized,
      background_allowed:
        background_allowed === undefined ? true : !!background_allowed,
      service_running:
        service_running === undefined ? true : !!service_running,
      source: runtimeSource,
      battery: battery ?? null,
      is_mock: is_mock ?? false,
      speed: speed ?? null,
      heading: heading ?? null,
      device_recorded_at: device_recorded_at || recordedAt,
    };

    console.log("[send-position] tracker_latest upsert payload", {
      org_id,
      user_id: tracker_user_id,
      event: latestPayload.event,
      ts: latestPayload.ts,
      source: latestPayload.source,
    });

    const { data: latestRow, error: latestError } = await adminClient
      .from("tracker_latest")
      .upsert([latestPayload], { onConflict: "org_id,user_id" })
      .select()
      .single();

    if (latestError || !latestRow) {
      console.error("[send-position] tracker_latest upsert error", latestError);
      return res.status(500).json({
        ok: false,
        error: "tracker_latest_upsert_failed",
        detail: latestError?.message || "no upsert result",
      });
    }

    const { error: healthError } = await adminClient
      .from("tracker_health")
      .upsert(
        [
          {
            org_id,
            tracker_user_id,
            status: "active",
            last_position_at: recordedAt,
            last_seen_at: recordedAt,
            updated_at: nowIso,
            permissions_ok:
              permissions_ok === undefined ? true : !!permissions_ok,
            battery_optimized:
              battery_optimized === undefined ? null : !!battery_optimized,
            background_allowed:
              background_allowed === undefined ? true : !!background_allowed,
            service_running:
              service_running === undefined ? true : !!service_running,
            source: runtimeSource,
          },
        ],
        { onConflict: "org_id,tracker_user_id" }
      );

    if (healthError) {
      console.warn("[send-position] tracker_health upsert warning", healthError);
    }

    const { error: touchError } = await adminClient
      .from("tracker_runtime_sessions")
      .update({ last_seen_at: nowIso })
      .eq("id", runtimeSession.id);

    if (touchError) {
      console.warn("[send-position] runtime session touch warning", touchError);
    }

    console.log("[send-position] success", {
      tracker_user_id,
      position_id: positionRow.id,
    });

    return res.status(200).json({
      ok: true,
      tracker_user_id,
      position: positionRow,
      latest: latestRow,
    });
  } catch (error) {
    console.error("[send-position] fatal error", error);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      detail: String(error?.message || error),
    });
  }
}