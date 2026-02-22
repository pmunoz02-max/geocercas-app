// supabase/functions/send_position/index.ts
import { getAdminClient } from "../_shared/supabaseAdmin.ts";

const BUILD_TAG = "send_position-v6-hmac-orgid-required-20260222";

function cors(origin: string | null) {
  const o = origin ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-proxy-ts, x-proxy-signature",
  };
}

function j(C: Record<string, string>, status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...C, "Content-Type": "application/json" },
  });
}

function isUuid(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

async function hmacHex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const C = cors(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: C });
  if (req.method !== "POST") {
    return j(C, 405, { ok: false, build_tag: BUILD_TAG, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const proxySecret = (Deno.env.get("TRACKER_PROXY_SECRET") || "").trim();
    if (!proxySecret) {
      return j(C, 500, { ok: false, build_tag: BUILD_TAG, error: "Missing TRACKER_PROXY_SECRET" });
    }

    const ts = (req.headers.get("x-proxy-ts") || "").trim();
    const sig = (req.headers.get("x-proxy-signature") || "").trim();
    if (!ts || !sig) {
      return j(C, 401, { ok: false, build_tag: BUILD_TAG, error: "Missing proxy signature" });
    }

    const now = Date.now();
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > 5 * 60 * 1000) {
      return j(C, 401, { ok: false, build_tag: BUILD_TAG, error: "Expired proxy timestamp" });
    }

    const bodyText = await req.text();
    const msg = `send_position.${ts}.${bodyText}`;
    const expectedSig = await hmacHex(proxySecret, msg);
    if (expectedSig !== sig) {
      return j(C, 401, { ok: false, build_tag: BUILD_TAG, error: "Invalid proxy signature" });
    }

    let body: any = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return j(C, 400, { ok: false, build_tag: BUILD_TAG, error: "INVALID_JSON" });
    }

    const org_id = String(body.org_id || "").trim();
    if (!isUuid(org_id)) {
      return j(C, 400, { ok: false, build_tag: BUILD_TAG, error: "org_id is required" });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return j(C, 400, { ok: false, build_tag: BUILD_TAG, error: "Invalid lat/lng" });
    }

    // user_id opcional (si el proxy lo manda, lo guardamos; si no, no)
    const user_id = body.user_id && isUuid(body.user_id) ? String(body.user_id) : null;

    let admin;
    try {
      admin = getAdminClient();
    } catch (e) {
      return j(C, 500, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "ADMIN_CLIENT_INIT_FAILED",
        detail: String((e as any)?.message || e),
      });
    }

    const payload: Record<string, any> = {
      org_id,
      lat,
      lng,
      recorded_at: new Date().toISOString(),
      source: "tracker-gps-web",
    };
    if (user_id) payload.user_id = user_id;

    const insert = await admin.from("tracker_positions").insert(payload);

    if (insert.error) {
      return j(C, 500, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "DB_INSERT_FAILED",
        detail: insert.error.message,
      });
    }

    return j(C, 200, { ok: true, build_tag: BUILD_TAG });
  } catch (e) {
    return j(C, 500, {
      ok: false,
      build_tag: BUILD_TAG,
      error: "Unhandled",
      detail: String((e as any)?.message || e),
    });
  }
});