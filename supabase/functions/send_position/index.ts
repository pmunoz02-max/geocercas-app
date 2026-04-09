/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const build_tag = "send_position-v26_uuid_and_auth_preview_20260407";

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": [
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
      "x-proxy-ts",
      "x-proxy-signature",
      "x-tracker-ts",
      "x-tracker-nonce",
      "x-tracker-sig",
      "x-user-jwt",
    ].join(", "),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function hmacHex(secret: string, msg: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(msg));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pickBearer(h: string | null) {
  const s = String(h || "").trim();
  if (!s) return "";
  return /^bearer\s+/i.test(s) ? s : `Bearer ${s}`;
}

function getEnv() {
  return {
    SB_URL: Deno.env.get("SUPABASE_URL") || "",
    SB_SERVICE_ROLE: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    SB_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") || "",
    TRACKER_PROXY_SECRET: Deno.env.get("TRACKER_PROXY_SECRET") || "",
  };
}

function parseJsonSafely(raw: string) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

function pickIsoDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return Number.isNaN(Date.parse(s)) ? null : new Date(s).toISOString();
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return null;
}

function isValidUuid(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
}

function normalizeUuid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return isValidUuid(normalized) ? normalized : null;
}

function resolveRequiredUuid(value: unknown, fieldName: string): string {
  const valueText = value === null || value === undefined ? "" : String(value);
  const resolvedUuid = normalizeUuid(valueText);
  if (!resolvedUuid) {
    throw new Error(`send_position: resolved ${fieldName} is null`);
  }
  return resolvedUuid;
}

function buildPayloads(body: Record<string, unknown>, fallbackSource: string) {
  const nowIso = new Date().toISOString();

  const source =
    typeof body.source === "string" && body.source.trim()
      ? body.source.trim()
      : fallbackSource;

  const deviceRecordedAt =
    pickIsoDate(body.device_recorded_at) ??
    pickIsoDate(body.recorded_at) ??
    nowIso;

  const positionsRecordedAt =
    pickIsoDate(
      (body.positions_payload as Record<string, unknown> | undefined)?.recorded_at,
    ) ??
    pickIsoDate(body.recorded_at) ??
    deviceRecordedAt;

  const positionsPayload = {
    battery:
      normalizeInteger(
        (body.positions_payload as Record<string, unknown> | undefined)?.battery,
      ) ?? normalizeInteger(body.battery),
    is_mock:
      normalizeBoolean(
        (body.positions_payload as Record<string, unknown> | undefined)?.is_mock,
      ) ?? normalizeBoolean(body.is_mock),
    source:
      ((body.positions_payload as Record<string, unknown> | undefined)?.source as string | undefined) ||
      source,
    speed:
      normalizeNumber(
        (body.positions_payload as Record<string, unknown> | undefined)?.speed,
      ) ?? normalizeNumber(body.speed),
    heading:
      normalizeNumber(
        (body.positions_payload as Record<string, unknown> | undefined)?.heading,
      ) ?? normalizeNumber(body.heading),
    recorded_at: positionsRecordedAt,
  };

  const trackerLatestPayload = {
    permissions_ok:
      normalizeBoolean(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)
          ?.permissions_ok,
      ) ?? normalizeBoolean(body.permissions_ok),
    battery_optimized:
      normalizeBoolean(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)
          ?.battery_optimized,
      ) ?? normalizeBoolean(body.battery_optimized),
    background_allowed:
      normalizeBoolean(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)
          ?.background_allowed,
      ) ?? normalizeBoolean(body.background_allowed),
    service_running:
      normalizeBoolean(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)
          ?.service_running,
      ) ?? normalizeBoolean(body.service_running),
    source:
      ((body.tracker_latest_payload as Record<string, unknown> | undefined)?.source as string | undefined) ||
      source,
    battery:
      normalizeInteger(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)?.battery,
      ) ?? normalizeInteger(body.battery),
    is_mock:
      normalizeBoolean(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)?.is_mock,
      ) ?? normalizeBoolean(body.is_mock),
    speed:
      normalizeNumber(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)?.speed,
      ) ?? normalizeNumber(body.speed),
    heading:
      normalizeNumber(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)?.heading,
      ) ?? normalizeNumber(body.heading),
    device_recorded_at:
      pickIsoDate(
        (body.tracker_latest_payload as Record<string, unknown> | undefined)
          ?.device_recorded_at,
      ) ?? deviceRecordedAt,
  };

  return {
    positionsPayload,
    trackerLatestPayload,
    created_at: nowIso,
  };
}

async function checkCanSend(
  client: any,
  params: {
    user_id: string;
    org_id: string;
    body: Record<string, unknown>;
  },
  cors: Record<string, string>,
) {
  const { user_id, org_id, body } = params;

  console.log("[send_position][enforcement][before-rpc]", {
    build_tag,
    requested_org_id: org_id,
    resolved_org_id: org_id,
    resolved_user_id: user_id,
    role: null,
    tracker_id: null,
    assignment_active: null,
    payload_org_id: body?.org_id ?? null,
    enforcement_inputs: {
      rpc: "rpc_tracker_can_send",
      args: {},
      resolved_user_id: user_id,
      resolved_org_id: org_id,
    },
  });

  const { data, error } = await client.rpc("rpc_tracker_can_send");

  console.log("[send_position][enforcement][after-rpc]", {
    build_tag,
    requested_org_id: org_id,
    resolved_org_id: org_id,
    resolved_user_id: user_id,
    payload_org_id: body?.org_id ?? null,
    rpc_result: data,
    rpc_error_message: error?.message ?? null,
    rpc_error_details: error?.details ?? null,
    rpc_error_hint: error?.hint ?? null,
    rpc_error_code: error?.code ?? null,
  });

  if (error) {
    console.error("[send_position] rpc_tracker_can_send error", error);
    return {
      ok: false,
      response: json(
        {
          ok: false,
          error: "enforcement_check_failed",
          detail: error.message,
          code: error.code ?? null,
          build_tag,
        },
        500,
        cors,
      ),
    };
  }

  if (data !== true) {
    console.warn("[send_position] tracker_blocked_by_plan_or_enforcement", {
      user_id,
      org_id,
      rpc_result: data,
    });
    return {
      ok: false,
      response: json(
        {
          ok: false,
          error: "tracker_limit_reached",
          build_tag,
        },
        403,
        cors,
      ),
    };
  }

  return { ok: true };
}

async function updateTrackerLatestOperationalState(
  admin: any,
  params: {
    org_id: string;
    user_id: string;
    trackerLatestPayload: Record<string, unknown>;
  },
) {
  const { org_id, user_id, trackerLatestPayload } = params;

  const updatePayload = {
    ...trackerLatestPayload,
    user_id,
    org_id,
  };

  const { data, error } = await admin
    .from("tracker_latest")
    .update(updatePayload)
    .eq("org_id", org_id)
    .eq("user_id", user_id)
    .select("org_id,user_id")
    .maybeSingle();

  if (error) {
    console.error("[send_position] tracker_latest_update_error", {
      org_id,
      user_id,
      message: error.message,
    });
    return { ok: false, reason: "update_error", error };
  }

  if (!data) {
    console.warn("[send_position] tracker_latest_row_not_found_after_positions_insert", {
      org_id,
      user_id,
    });
    return { ok: false, reason: "row_not_found" };
  }

  return { ok: true };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed", build_tag }, 405, CORS);
  }

  try {
    const { SB_URL, SB_SERVICE_ROLE, SB_ANON_KEY, TRACKER_PROXY_SECRET } = getEnv();

    if (!SB_URL || !SB_SERVICE_ROLE || !SB_ANON_KEY) {
      return json({ ok: false, error: "missing_env", build_tag }, 500, CORS);
    }

    const rawBody = await req.text();
    const body = parseJsonSafely(rawBody);

    if (!body || typeof body !== "object") {
      return json({ ok: false, error: "invalid_json", build_tag }, 400, CORS);
    }

    const admin = createClient(SB_URL, SB_SERVICE_ROLE);

    const ts = req.headers.get("x-proxy-ts");
    const signature = req.headers.get("x-proxy-signature");

    // =========================================================
    // PROXY MODE
    // =========================================================
    if (ts && signature) {
      if (!TRACKER_PROXY_SECRET) {
        return json({ ok: false, error: "missing_proxy_secret", build_tag }, 500, CORS);
      }

      const expected = await hmacHex(TRACKER_PROXY_SECRET, `send_position.${ts}.${rawBody}`);
      if (expected !== signature) {
        return json({ ok: false, error: "invalid_signature", build_tag }, 401, CORS);
      }

      const user_id = resolveRequiredUuid(body.user_id, "user_id");
      const org_id = resolveRequiredUuid(body.org_id, "org_id");
      const lat = normalizeNumber(body.lat);
      const lng = normalizeNumber(body.lng);
      const accuracy = normalizeNumber(body.accuracy);

      if (!org_id || lat === null || lng === null) {
        return json({ ok: false, error: "missing_required_fields", build_tag }, 400, CORS);
      }


      // LOG: Pasó rpc_tracker_can_send, intentando insert en positions
      console.log("[send_position][positions][proxy] passed rpc, inserting", {
        user_id,
        org_id,
        lat,
        lng,
        accuracy,
        created_at,
        positionsPayload,
      });

      const { error: positionError } = await admin.from("positions").insert({
        user_id,
        org_id,
        lat,
        lng,
        accuracy,
        created_at,
        ...positionsPayload,
      });

      if (positionError) {
        console.error("[send_position][positions][proxy] insert_error", positionError);
        return json(
          { ok: false, error: positionError.message, build_tag },
          500,
          CORS,
        );
      }

      const latestResult = await updateTrackerLatestOperationalState(admin, {
        org_id,
        user_id,
        trackerLatestPayload,
      });

      return json(
        {
          ok: true,
          build_tag,
          tracker_latest_updated: latestResult.ok,
          tracker_latest_reason: latestResult.ok ? null : latestResult.reason,
        },
        200,
        CORS,
      );
    }

    // =========================================================
    // WEB / APP MODE
    // =========================================================
    const jwt = pickBearer(req.headers.get("x-user-jwt") || req.headers.get("authorization"));
    if (!jwt) {
      console.warn("[send_position][auth][missing_token]", {
        build_tag,
        has_jwt: false,
        reason: "No JWT provided in x-user-jwt or authorization header"
      });
      return json({ ok: false, error: "missing_jwt", build_tag }, 401, CORS);
    }

    const authClient = createClient(SB_URL, SB_ANON_KEY, {
      global: { headers: { Authorization: jwt } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    // Extract JWT sub if possible
    let jwtSub = null;
    try {
      const jwtParts = jwt.split(".");
      if (jwtParts.length === 3) {
        const payload = JSON.parse(atob(jwtParts[1]));
        jwtSub = payload.sub || null;
      }
    } catch (e) {
      jwtSub = null;
    }

    if (userError || !userData?.user?.id) {
      let authReason = "invalid_token";
      let authDetail = "";
      if (userError?.message?.toLowerCase().includes("expired")) {
        authReason = "expired_token";
        authDetail = userError.message;
      } else if (userError?.message?.toLowerCase().includes("invalid")) {
        authReason = "invalid_token";
        authDetail = userError.message;
      } else if (!jwt) {
        authReason = "missing_token";
        authDetail = "No JWT provided";
      } else {
        authReason = "unknown_auth_error";
        authDetail = userError?.message || "Unknown error";
      }
      console.warn("[send_position][auth][fail]", {
        build_tag,
        has_jwt: Boolean(jwt),
        jwt_length: jwt?.length ?? 0,
        user_error_message: userError?.message ?? null,
        user_error_status: userError?.status ?? null,
        user_error_name: userError?.name ?? null,
        user_id: userData?.user?.id ?? null,
        jwt_sub: jwtSub,
        auth_reason: authReason,
        auth_detail: authDetail,
      });
      return json({ ok: false, error: "invalid_user", build_tag }, 401, CORS);
    }

    // Fallback user id (from body, if present and valid)
    let fallbackUserId = null;
    if (body.user_id && isValidUuid(body.user_id)) {
      fallbackUserId = String(body.user_id);
    }

    const user_id = resolveRequiredUuid(userData.user.id, "user_id");
    const org_id = resolveRequiredUuid(body.org_id, "org_id");
    const lat = normalizeNumber(body.lat);
    const lng = normalizeNumber(body.lng);
    const accuracy = normalizeNumber(body.accuracy);

    // Log all user id sources
    console.log("[send_position][user_id_resolution]", {
      jwt_sub: jwtSub,
      fallback_user_id: fallbackUserId,
      effective_user_id: user_id,
    });

    if (!org_id || lat === null || lng === null) {
      return json({ ok: false, error: "missing_required_fields", build_tag }, 400, CORS);
    }

    // LOG: Pasó rpc_tracker_can_send, intentando insert en positions
    console.log("[send_position][positions][web] passed rpc, inserting", {
      user_id,
      org_id,
      lat,
      lng,
      accuracy,
      created_at,
      positionsPayload,
    });

    const { error: positionError } = await admin.from("positions").insert({
      user_id,
      org_id,
      lat,
      lng,
      accuracy,
      created_at,
      ...positionsPayload,
    });

    if (positionError) {
      console.error("[send_position][positions][web] insert_error", positionError);
      return json(
        { ok: false, error: positionError.message, build_tag },
        500,
        CORS,
      );
    }

    // Log again for tracker_latest write
    console.log("[send_position][tracker_latest][web] writing", {
      user_id,
      org_id,
      jwt_sub: jwtSub,
      fallback_user_id: fallbackUserId,
      effective_user_id: user_id,
    });

    const latestResult = await updateTrackerLatestOperationalState(admin, {
      org_id,
      user_id,
      trackerLatestPayload,
    });

    return json(
      {
        ok: true,
        build_tag,
        tracker_latest_updated: latestResult.ok,
        tracker_latest_reason: latestResult.ok ? null : latestResult.reason,
      },
      200,
      CORS,
    );
  } catch (e) {
    console.error("[send_position] unhandled_error", e);
    return json(
      {
        ok: false,
        error: "internal_error",
        message: e instanceof Error ? e.message : String(e),
        build_tag,
      },
      500,
      CORS,
    );
  }
});