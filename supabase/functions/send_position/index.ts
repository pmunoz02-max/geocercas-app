// supabase/functions/send_position/index.ts
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

const BUILD_TAG = "send_position-v4-hmac-server-auth-20260220";

function cors(origin: string | null) {
  const o = origin ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, x-proxy-ts, x-proxy-signature",
  };
}

async function hmacHex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(msg)
  );

  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const C = cors(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: C });
  }

  try {
    const proxySecret = Deno.env.get("TRACKER_PROXY_SECRET");
    if (!proxySecret) {
      return new Response(
        JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: "Missing TRACKER_PROXY_SECRET" }),
        { status: 500, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    const ts = req.headers.get("x-proxy-ts") || "";
    const sig = req.headers.get("x-proxy-signature") || "";

    if (!ts || !sig) {
      return new Response(
        JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: "Missing proxy signature" }),
        { status: 401, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    const bodyText = await req.text();
    const msg = `send_position.${ts}.${bodyText}`;
    const expectedSig = await hmacHex(proxySecret, msg);

    if (expectedSig !== sig) {
      return new Response(
        JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: "Invalid proxy signature" }),
        { status: 401, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    // Anti replay simple (5 minutos)
    const now = Date.now();
    if (Math.abs(now - Number(ts)) > 5 * 60 * 1000) {
      return new Response(
        JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: "Expired proxy timestamp" }),
        { status: 401, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    const body = JSON.parse(bodyText || "{}");

    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(
        JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: "Invalid lat/lng" }),
        { status: 400, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    const admin = getAdminClient();

    const insert = await admin.from("tracker_positions").insert({
      lat,
      lng,
      recorded_at: new Date().toISOString(),
      source: "tracker-gps-web",
    });

    if (insert.error) {
      return new Response(
        JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: insert.error.message }),
        { status: 500, headers: { ...C, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, build_tag: BUILD_TAG }),
      { headers: { ...C, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});