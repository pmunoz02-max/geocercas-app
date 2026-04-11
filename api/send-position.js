import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars for send-position");
}

const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
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
    } = body || {};

    console.log("[send-position] payload", {
      org_id,
      lat,
      lng,
      accuracy,
      timestamp,
    });

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing_bearer_token" });
    }

    if (!org_id || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({
        ok: false,
        error: "invalid_payload",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json({ ok: false, error: "empty_token" });
    }

    const tokenHash = sha256Hex(token);

    console.log("[send-position] token hash computed", {
      org_id,
      tokenHashPrefix: tokenHash.slice(0, 12),
    });

    // 1) Resolver token opaco contra tracker_invites
    const nowIso = new Date().toISOString();

    const { data: inviteRow, error: inviteError } = await adminClient
      .from("tracker_invites")
      .select(
        "id, org_id, email, is_active, expires_at, used_at, used_by_user_id, accepted_at, invite_token_hash"
      )
      .eq("org_id", org_id)
      .eq("invite_token_hash", tokenHash)
      .eq("is_active", true)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (inviteError) {
      console.error("[send-position] tracker invite lookup error", inviteError);
      return res.status(500).json({
        ok: false,
        error: "tracker_lookup_failed",
        detail: inviteError.message,
      });
    }

    if (!inviteRow) {
      console.warn("[send-position] invalid tracker token");
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const tracker_user_id = inviteRow.used_by_user_id;

    if (!tracker_user_id) {
      console.warn("[send-position] invite accepted without bound tracker user");
      return res.status(403).json({
        ok: false,
        error: "tracker_not_bound_to_user",
      });
    }

    console.log("[send-position] tracker resolved", {
      tracker_user_id,
      invite_id: inviteRow.id,
    });

    // 2) Validar assignment activo real
    const { data: assignmentRow, error: assignmentError } = await adminClient
      .from("tracker_assignments")
      .select("id, tracker_user_id, org_id, active, start_date, end_date")
      .eq("tracker_user_id", tracker_user_id)
      .eq("org_id", org_id)
      .eq("active", true)
      .maybeSingle();

    if (assignmentError) {
      console.error("[send-position] assignment lookup error", assignmentError);
      return res.status(500).json({
        ok: false,
        error: "assignment_lookup_failed",
        detail: assignmentError.message,
      });
    }

    if (!assignmentRow) {
      console.warn("[send-position] tracker has no active assignment", {
        tracker_user_id,
        org_id,
      });
      return res.status(403).json({
        ok: false,
        error: "tracker_not_assigned",
      });
    }

    const recordedAt = timestamp || new Date().toISOString();

    // 3) Insert histórico en tracker_positions
    const trackerPositionPayload = {
      org_id,
      user_id: tracker_user_id,
      asignacion_id: assignmentRow.id,
      lat: Number(lat),
      lng: Number(lng),
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      heading: heading ?? null,
      battery: battery ?? null,
      is_mock: is_mock ?? false,
      source: "tracker_webview",
      recorded_at: recordedAt,
    };

    console.log("[send-position] tracker_positions insert payload", {
      org_id,
      user_id: tracker_user_id,
      asignacion_id: assignmentRow.id,
      lat: Number(lat),
      lng: Number(lng),
      recorded_at: recordedAt,
    });

    const { data: positionRow, error: positionError } = await adminClient
      .from("tracker_positions")
      .insert([trackerPositionPayload])
      .select()
      .single();

    if (positionError || !positionRow) {
      console.error("[send-position] tracker_positions insert error", positionError);
      return res.status(500).json({
        ok: false,
        error: "tracker_positions_insert_failed",
        detail: positionError?.message || "no insert result",
      });
    }

    // 4) Upsert estado actual en tracker_latest
    const trackerLatestPayload = {
      org_id,
      user_id: tracker_user_id,
      lat: Number(lat),
      lng: Number(lng),
      accuracy: accuracy ?? null,
      ts: recordedAt,
      source: "tracker_webview",
      battery: battery ?? null,
      is_mock: is_mock ?? false,
      speed: speed ?? null,
      heading: heading ?? null,
      device_recorded_at: recordedAt,
    };

    console.log("[send-position] tracker_latest upsert payload", {
      org_id,
      user_id: tracker_user_id,
      lat: Number(lat),
      lng: Number(lng),
      ts: recordedAt,
    });

    const { data: latestRow, error: latestError } = await adminClient
      .from("tracker_latest")
      .upsert([trackerLatestPayload], { onConflict: "org_id,user_id" })
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

    console.log("[send-position] success", {
      tracker_user_id,
      tracker_position_id: positionRow.id,
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

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);


export default async function handler(req, res) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  console.log("[send-position] request started", { method: req.method, url: req.url, hasAuth: !!authHeader });

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    let body = req.body;
    if (!body) {
      console.error("[send-position] body is undefined");
      return res.status(400).json({ ok: false, error: "empty_body" });
    }
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error("[send-position] JSON parse error", body);
        return res.status(400).json({ ok: false, error: "invalid_json" });
      }
    }

    const { org_id, lat, lng, accuracy, timestamp } = body;
    console.log("[send-position] payload", { org_id, lat, lng, accuracy, timestamp });

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[send-position] missing bearer token");
      return res.status(401).json({ ok: false, error: "missing_bearer_token" });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      console.warn("[send-position] empty bearer token");
      return res.status(401).json({ ok: false, error: "empty_token" });
    }

    // Obtener token
    // (ya extraído arriba como 'token')

    // Resolver tracker desde token
    console.log("[send-position] tracker lookup: tabla=tracker_assignments, columnas=[user_id, org_id], org_id=", org_id, ", token presente=", !!token);
    const { data: trackerRow, error: trackerError } = await adminClient
      .from("tracker_assignments")
      .select("user_id, org_id")
      .eq("tracker_access_token", token)
      .eq("org_id", org_id)
      .maybeSingle();

    if (trackerError) {
      console.error("[send-position] tracker lookup error", {
        message: trackerError.message,
        code: trackerError.code,
        details: trackerError.details,
        org_id,
        token_present: !!token,
        table: "tracker_assignments",
        columns: ["user_id", "org_id"]
      });
      return res.status(500).json({ ok: false, error: "tracker_lookup_failed" });
    }

    if (!trackerRow) {
      console.warn("[send-position] invalid tracker token", {
        org_id,
        token_present: !!token,
        table: "tracker_assignments",
        columns: ["user_id", "org_id"]
      });
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const tracker_user_id = trackerRow.user_id;

    console.log("[send-position] tracker resolved", { tracker_user_id });

    // 2. Verificar que el tracker pertenezca o esté asignado a la org enviada
    // Primero, buscar en org_members
    let membership = null;
    let membershipError = null;
    try {
      const { data: member, error: memberError } = await adminClient
        .from("org_members")
        .select("user_id, org_id, role")
        .eq("org_id", org_id)
        .eq("user_id", tracker_user_id)
        .maybeSingle();
      membership = member;
      membershipError = memberError;
    } catch (e) {
      membershipError = e;
    }

    // Si no está en org_members, buscar en tracker_assignments
    if (!membership && !membershipError) {
      try {
        const { data: assignment, error: assignmentError } = await adminClient
          .from("tracker_assignments")
          .select("user_id, org_id, tracker_user_id")
          .eq("org_id", org_id)
          .eq("tracker_user_id", tracker_user_id)
          .maybeSingle();
        if (assignment) membership = assignment;
      } catch (e) {
        // ignore
      }
    }

    if (membershipError) {
      return res.status(500).json({ ok: false, error: "membership_check_failed" });
    }

    if (!membership) {
      return res.status(403).json({ ok: false, error: "tracker_not_allowed_for_org" });
    }

    const ts = timestamp ?? new Date().toISOString();

    // 3. Insertar en positions con adminClient
    const insertPayload = {
      org_id,
      user_id: tracker_user_id,
      lat,
      lng,
      accuracy: accuracy ?? null,
      ts,
    };
    console.log("[send-position] insert payload", insertPayload);
    const { data: insertResult, error: insertError } = await adminClient
      .from("positions")
      .insert([insertPayload])
      .select()
      .single();
    if (insertError || !insertResult) {
      console.error("[send-position] positions insert error", insertError || "no insert result");
      return res.status(500).json({ ok: false, error: "positions_insert_failed", detail: insertError?.message || "no insert result" });
    }
    console.log("[send-position] positions insert result", insertResult);

    // 4. Upsert/update tracker_latest con adminClient
    const latestPayload = {
      org_id,
      user_id: tracker_user_id,
      lat,
      lng,
      accuracy: accuracy ?? null,
      ts,
    };
    console.log("[send-position] tracker_latest upsert payload", latestPayload);
    const { data: latestResult, error: latestError } = await adminClient
      .from("tracker_latest")
      .upsert([latestPayload], { onConflict: ["org_id", "user_id"] })
      .select()
      .single();
    if (latestError || !latestResult) {
      console.error("[send-position] tracker_latest upsert error", latestError || "no upsert result");
      return res.status(500).json({ ok: false, error: "tracker_latest_upsert_failed", detail: latestError?.message || "no upsert result" });
    }
    console.log("[send-position] tracker_latest upsert result", latestResult);

    return res.status(200).json({
      ok: true,
      tracker_user_id,
      position: insertResult,
      latest: latestResult,
    });

  } catch (error) {
    console.error("[send-position] error", error);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      detail: String(error)
    });
  }
}