/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUILD_TAG = "send_position-v10_dual_hmac_diag_20260226";
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

serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = buildCorsHeaders(origin);

  // ✅ Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // ✅ GET diagnóstico (para confirmar build + headers presentes)
  if (req.method === "GET") {
    return json(
      {
        ok: true,
        build_tag: BUILD_TAG,
        now: new Date().toISOString(),
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
    const SB_URL = Deno.env.get("SB_URL");
    const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE");
    const TRACKER_PROXY_SECRET = Deno.env.get("TRACKER_PROXY_SECRET");

    if (!SB_URL || !SB_SERVICE_ROLE) {
      return json(
        { ok: false, build_tag: BUILD_TAG, error: "Missing required env vars (SB_URL / SB_SERVICE_ROLE)" },
        500,
        CORS,
      );
    }

    // Leemos body raw para HMAC exacto
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ ok: false, build_tag: BUILD_TAG, error: "Invalid JSON body" }, 400, CORS);
    }

    // ─────────────────────────────────────────────
    // MODO PROXY: aceptar 2 esquemas (retrocompatible)
    //   A) x-tracker-ts / x-tracker-nonce / x-tracker-sig  => HMAC(secret, `${ts}.${nonce}.${rawBody}`)
    //   B) x-proxy-ts / x-proxy-signature                 => HMAC(secret, `${fn}.${ts}.${rawBody}`)
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

    // Si llega HMAC, validamos y entramos a modo proxy
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
          {
            ok: false,
            build_tag: BUILD_TAG,
            error: "Invalid proxy signature",
            scheme: hasTrackerHmac ? "tracker_hmac" : "proxy_hmac",
          },
          401,
          CORS,
        );
      }

      // Proxy mode requiere user_id explícito
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
    // MODO WEB AUTH: supabase.functions.invoke
    // Requiere Authorization: Bearer <user_jwt>
    // ─────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json(
        {
          ok: false,
          build_tag: BUILD_TAG,
          error: "Missing Authorization (web mode) or proxy HMAC headers",
        },
        401,
        CORS,
      );
    }

    // Diagnóstico suave (sin exponer token)
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!looksLikeJwt(token)) {
      return json(
        {
          ok: false,
          build_tag: BUILD_TAG,
          error: "Authorization is not a JWT (web mode expects user JWT). Did you accidentally send service-role/anon?",
        },
        401,
        CORS,
      );
    }

    // Service role para insertar, pero usamos Authorization del usuario para getUser()
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