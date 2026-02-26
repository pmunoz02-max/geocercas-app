/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUILD_TAG = "send_position-v11_env_fallback_20260226";
const FN_NAME = "send_position";

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-proxy-ts, x-proxy-signature, x-tracker-ts, x-tracker-nonce, x-tracker-sig",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
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

function looksLikeJwt(token: string | null) {
  const t = String(token || "");
  return t.split(".").length === 3;
}

/**
 * ✅ Universal: primero variables estándar de Supabase,
 * luego fallback a tus variables legacy (SB_URL / SB_SERVICE_ROLE).
 */
function getEnv() {
  const SB_URL =
    Deno.env.get("SUPABASE_URL") ||
    Deno.env.get("SB_URL") ||
    "";

  const SB_SERVICE_ROLE =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE") ||
    Deno.env.get("SB_SERVICE_ROLE") ||
    "";

  const TRACKER_PROXY_SECRET =
    Deno.env.get("TRACKER_PROXY_SECRET") ||
    "";

  return { SB_URL, SB_SERVICE_ROLE, TRACKER_PROXY_SECRET };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method === "GET") {
    const { SB_URL, SB_SERVICE_ROLE, TRACKER_PROXY_SECRET } = getEnv();
    return json(
      {
        ok: true,
        build_tag: BUILD_TAG,
        now: new Date().toISOString(),
        env: {
          has_url: Boolean(SB_URL),
          has_service_role: Boolean(SB_SERVICE_ROLE),
          has_tracker_proxy_secret: Boolean(TRACKER_PROXY_SECRET),
          url_source: Deno.env.get("SUPABASE_URL") ? "SUPABASE_URL" : Deno.env.get("SB_URL") ? "SB_URL" : "missing",
          srk_source: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
            ? "SUPABASE_SERVICE_ROLE_KEY"
            : Deno.env.get("SUPABASE_SERVICE_ROLE")
              ? "SUPABASE_SERVICE_ROLE"
              : Deno.env.get("SB_SERVICE_ROLE")
                ? "SB_SERVICE_ROLE"
                : "missing",
        },
        headers_seen: {
          has_authorization: Boolean(req.headers.get("authorization")),
          has_x_proxy_ts: Boolean(req.headers.get("x-proxy-ts")),
          has_x_proxy_signature: Boolean(req.headers.get("x-proxy-signature")),
          has_x_tracker_ts: Boolean(req.headers.get("x-tracker-ts")),
          has_x_tracker_nonce: Boolean(req.headers.get("x-tracker-nonce")),
          has_x_tracker_sig: Boolean(req.headers.get("x-tracker-sig")),
        },
        hint: "POST with either web auth (Authorization: Bearer <user_jwt>) OR proxy HMAC headers.",
      },
      200,
      CORS,
    );
  }

  if (req.method !== "POST") {
    return json({ ok: false, build_tag: BUILD_TAG, error: "Method not allowed" }, 405, CORS);
  }

  try {
    const { SB_URL, SB_SERVICE_ROLE, TRACKER_PROXY_SECRET } = getEnv();

    if (!SB_URL || !SB_SERVICE_ROLE) {
      return json(
        { ok: false, build_tag: BUILD_TAG, error: "Missing required env vars (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) or (SB_URL/SB_SERVICE_ROLE)" },
        500,
        CORS,
      );
    }

    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ ok: false, build_tag: BUILD_TAG, error: "Invalid JSON body" }, 400, CORS);
    }

    // ─────────────────────────────────────────────
    // MODO PROXY (retrocompatible)
    // ─────────────────────────────────────────────
    const xTrackerTs = req.headers.get("x-tracker-ts") || "";
    const xTrackerNonce = req.headers.get("x-tracker-nonce") || "";
    const xTrackerSig = req.headers.get("x-tracker-sig") || "";

    const xProxyTs = req.headers.get("x-proxy-ts") || "";
    const xProxySig = req.headers.get("x-proxy-signature") || "";

    const hasTrackerHmac = Boolean(xTrackerTs && xTrackerNonce && xTrackerSig);
    const hasProxyHmac = Boolean(xProxyTs && xProxySig);

    if ((hasTrackerHmac || hasProxyHmac) && !TRACKER_PROXY_SECRET) {
      return json(
        { ok: false, build_tag: BUILD_TAG, error: "TRACKER_PROXY_SECRET not configured but proxy headers were provided" },
        500,
        CORS,
      );
    }

    if (hasTrackerHmac || hasProxyHmac) {
      let valid = false;

      if (hasTrackerHmac) {
        const expectedA = await hmacHex(TRACKER_PROXY_SECRET!, `${xTrackerTs}.${xTrackerNonce}.${rawBody}`);
        valid = expectedA === xTrackerSig;
      }

      if (!valid && hasProxyHmac) {
        const expectedB = await hmacHex(TRACKER_PROXY_SECRET!, `${FN_NAME}.${xProxyTs}.${rawBody}`);
        valid = expectedB === xProxySig;
      }

      if (!valid) {
        return json(
          { ok: false, build_tag: BUILD_TAG, error: "Invalid proxy signature" },
          401,
          CORS,
        );
      }

      const { user_id, org_id, lat, lng, accuracy, at, source } = body ?? {};
      if (!user_id || !org_id || typeof lat !== "number" || typeof lng !== "number") {
        return json(
          { ok: false, build_tag: BUILD_TAG, error: "Missing/invalid fields (proxy mode)" },
          400,
          CORS,
        );
      }

      const admin = createClient(SB_URL, SB_SERVICE_ROLE);

      const { error } = await admin.from("positions").insert({
        user_id,
        org_id,
        lat,
        lng,
        accuracy: typeof accuracy === "number" ? accuracy : null,
        at: typeof at === "string" ? at : new Date().toISOString(),
        source: typeof source === "string" ? source : "tracker-proxy",
      });

      if (error) {
        return json({ ok: false, build_tag: BUILD_TAG, error: error.message }, 500, CORS);
      }

      return json({ ok: true, build_tag: BUILD_TAG, mode: "proxy_hmac" }, 200, CORS);
    }

    // ─────────────────────────────────────────────
    // MODO WEB AUTH (functions.invoke)
    // ─────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json(
        { ok: false, build_tag: BUILD_TAG, error: "Missing Authorization (web mode) or proxy HMAC headers" },
        401,
        CORS,
      );
    }

    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!looksLikeJwt(token)) {
      return json(
        { ok: false, build_tag: BUILD_TAG, error: "Authorization is not a JWT (web mode expects user JWT)" },
        401,
        CORS,
      );
    }

    const admin = createClient(SB_URL, SB_SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return json(
        { ok: false, build_tag: BUILD_TAG, error: "Invalid JWT (web mode user token)" },
        401,
        CORS,
      );
    }

    const user_id = userData.user.id;
    const { org_id, lat, lng, accuracy, at, source } = body ?? {};

    if (!org_id || typeof lat !== "number" || typeof lng !== "number") {
      return json(
        { ok: false, build_tag: BUILD_TAG, error: "Missing/invalid fields (web mode)" },
        400,
        CORS,
      );
    }

    const { error } = await admin.from("positions").insert({
      user_id,
      org_id,
      lat,
      lng,
      accuracy: typeof accuracy === "number" ? accuracy : null,
      at: typeof at === "string" ? at : new Date().toISOString(),
      source: typeof source === "string" ? source : "tracker-gps-web",
    });

    if (error) {
      return json({ ok: false, build_tag: BUILD_TAG, error: error.message }, 500, CORS);
    }

    return json({ ok: true, build_tag: BUILD_TAG, mode: "web_auth" }, 200, CORS);
  } catch (err: any) {
    return json(
      { ok: false, build_tag: BUILD_TAG, error: err?.message ?? String(err) },
      500,
      CORS,
    );
  }
});