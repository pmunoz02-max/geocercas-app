/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const build_tag = "send_position-v20_enforcement_fixed";

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
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
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
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    TRACKER_PROXY_SECRET: Deno.env.get("TRACKER_PROXY_SECRET") || "",
  };
}

function pickTimestamps(body: any) {
  const nowIso = new Date().toISOString();
  const rec = String(body?.recorded_at || "").trim();
  const recorded_at = rec && !Number.isNaN(Date.parse(rec)) ? rec : nowIso;
  return { recorded_at, created_at: nowIso };
}

async function checkCanSend(admin: any, user_id: string, org_id: string, cors: any) {
  const { data, error } = await admin.rpc("rpc_tracker_can_send", { p_user_id: user_id });

  if (error) {
    console.error("[send_position] rpc_tracker_can_send error", error);
    return { ok: false, response: json({ error: "enforcement_check_failed" }, 500, cors) };
  }

  if (data !== true) {
    console.warn("[send_position] tracker_blocked_by_plan", { user_id, org_id });
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "tracker_limit_reached" }), {
        status: 403,
        headers: cors,
      }),
    };
  }

  return { ok: true };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, CORS);
  }

  try {
    const { SB_URL, SB_SERVICE_ROLE, TRACKER_PROXY_SECRET } = getEnv();

    if (!SB_URL || !SB_SERVICE_ROLE) {
      return json({ error: "Missing env" }, 500, CORS);
    }

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const { recorded_at, created_at } = pickTimestamps(body);

    const admin = createClient(SB_URL, SB_SERVICE_ROLE);

    // === PROXY MODE ===
    const ts = req.headers.get("x-proxy-ts");
    const signature = req.headers.get("x-proxy-signature");

    if (ts && signature) {
      const expected = await hmacHex(TRACKER_PROXY_SECRET, `send_position.${ts}.${rawBody}`);
      if (expected !== signature) {
        return json({ error: "Invalid signature" }, 401, CORS);
      }

      const { user_id, org_id, lat, lng } = body;

      const check = await checkCanSend(admin, user_id, org_id, CORS);
      if (!check.ok) return check.response;

      const { error } = await admin.from("positions").insert({
        user_id,
        org_id,
        lat,
        lng,
        source: "proxy_hmac",
        recorded_at,
        created_at,
      });

      if (error) {
        return json({ error: error.message }, 500, CORS);
      }

      return json({ ok: true }, 200, CORS);
    }

    // === WEB MODE ===
    const jwt = pickBearer(req.headers.get("x-user-jwt") || req.headers.get("authorization"));
    if (!jwt) return json({ error: "Missing JWT" }, 401, CORS);

    const userClient = createClient(SB_URL, SB_SERVICE_ROLE, {
      global: { headers: { Authorization: jwt } },
    });

    const { data: userData } = await userClient.auth.getUser();
    const user_id = userData?.user?.id;

    const { org_id, lat, lng } = body;

    const check = await checkCanSend(userClient, user_id, org_id, CORS);
    if (!check.ok) return check.response;

    const { error } = await userClient.from("positions").insert({
      user_id,
      org_id,
      lat,
      lng,
      source: "tracker-native-android",
      recorded_at,
      created_at,
    });

    if (error) {
      return json({ error: error.message }, 500, CORS);
    }

    return json({ ok: true }, 200, CORS);
  } catch (e) {
    return json({ error: String(e) }, 500, CORS);
  }
});
