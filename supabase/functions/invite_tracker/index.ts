// supabase/functions/invite_tracker/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * App Geocercas — Edge Function (Preview)
 * Function: invite_tracker
 *
 * Role: Secure proxy that validates HMAC and forwards to:
 *   send-tracker-invite-brevo
 *
 * FIX: When calling another Supabase Edge Function you MUST send:
 *   - apikey: SUPABASE_ANON_KEY
 *   - Authorization: Bearer SUPABASE_ANON_KEY
 *
 * Otherwise Supabase gateway returns:
 *   401 Missing authorization header
 *
 * Build tag: invite_tracker_v31_AUTH_HEADERS_20260223
 */
const BUILD_TAG = "invite_tracker_v31_AUTH_HEADERS_20260223";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-edge-ts, x-edge-sig, x-user-jwt, x-app-lang",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

function isUuid(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return toHex(sig);
}

function timingSafeEqualHex(a: string, b: string) {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return diff === 0;
}

function buildFnUrl(params: { supabaseUrl: string; fnName: string }) {
  const base = params.supabaseUrl.replace(/\/$/, "");
  return `${base}/functions/v1/${params.fnName}`;
}

function sanitizeLang(v: unknown) {
  const raw = String(v ?? "").trim().toLowerCase().slice(0, 2);
  return ["es", "en", "fr"].includes(raw) ? raw : "es";
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const INVITE_HMAC_SECRET = Deno.env.get("INVITE_HMAC_SECRET") || "";

    // Target function (the one that sends Brevo email + generates PKCE verify link)
    const TARGET_FN = "send-tracker-invite-brevo";

    if (!SUPABASE_URL) return jsonResponse(500, { ok: false, error: "Missing SUPABASE_URL", build_tag: BUILD_TAG });
    if (!SUPABASE_ANON_KEY) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing SUPABASE_ANON_KEY",
        build_tag: BUILD_TAG,
        hint: "Required to call Supabase Edge Functions (Authorization/apikey).",
      });
    }
    if (!INVITE_HMAC_SECRET) {
      return jsonResponse(500, { ok: false, error: "Missing INVITE_HMAC_SECRET", build_tag: BUILD_TAG });
    }

    const fnUrl = buildFnUrl({ supabaseUrl: SUPABASE_URL, fnName: TARGET_FN });

    // Health GET (optional)
    if (req.method === "GET") {
      return jsonResponse(200, {
        ok: true,
        build_tag: BUILD_TAG,
        target_fn: TARGET_FN,
        target_url: fnUrl,
      });
    }

    if (req.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method not allowed", build_tag: BUILD_TAG });
    }

    const body = await req.json().catch(() => ({} as any));

    const org_id = String(body?.org_id || "").trim();
    const email = normEmail(body?.email);
    const name = String(body?.name || "").trim();
    const lang = sanitizeLang(body?.lang || req.headers.get("x-app-lang") || "es");
    const caller_jwt = String(body?.caller_jwt || "").trim();

    if (!isUuid(org_id)) return jsonResponse(400, { ok: false, error: "Invalid org_id", build_tag: BUILD_TAG });
    if (!email || !email.includes("@")) return jsonResponse(400, { ok: false, error: "Invalid email", build_tag: BUILD_TAG });
    if (!caller_jwt) return jsonResponse(401, { ok: false, error: "Missing caller_jwt", build_tag: BUILD_TAG });

    // ---------- HMAC validation ----------
    const ts = String(req.headers.get("x-edge-ts") || "").trim();
    const sig = String(req.headers.get("x-edge-sig") || "").trim();

    if (!ts || !sig) {
      return jsonResponse(401, { ok: false, error: "Missing x-edge-ts/x-edge-sig", build_tag: BUILD_TAG });
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
      return jsonResponse(401, { ok: false, error: "Invalid x-edge-ts", build_tag: BUILD_TAG });
    }

    // 5 minutes window
    const drift = Math.abs(Date.now() - tsNum);
    if (drift > 5 * 60 * 1000) {
      return jsonResponse(401, { ok: false, error: "Expired x-edge-ts", build_tag: BUILD_TAG, drift_ms: drift });
    }

    const msg = `${ts}\n${org_id}\n${email}`;
    const expected = await hmacSha256Hex(INVITE_HMAC_SECRET, msg);
    if (!timingSafeEqualHex(expected, sig)) {
      return jsonResponse(401, { ok: false, error: "Invalid signature", build_tag: BUILD_TAG });
    }

    // ---------- Forward to send-tracker-invite-brevo ----------
    const started = Date.now();
    const forwardResp = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",

        // ✅ CRITICAL FIX (gateway auth):
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,

        // business auth:
        "x-user-jwt": caller_jwt,
        "x-app-lang": lang,
        "x-edge-ts": ts,
        "x-edge-sig": sig,
      },
      body: JSON.stringify({ org_id, email, name, lang }),
    });

    const ms = Date.now() - started;
    const text = await forwardResp.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    // pass-through with proxy diagnostics
    return jsonResponse(forwardResp.status, {
      ...(json || { raw: text }),
      _proxy: {
        ok: forwardResp.ok,
        build: BUILD_TAG,
        target_fn: TARGET_FN,
        target_url: fnUrl,
        edge_status: forwardResp.status,
        edge_ms: ms,
        lang,
      },
    });
  } catch (e) {
    return jsonResponse(500, {
      ok: false,
      error: "Unhandled",
      detail: String((e as any)?.message || e),
      build_tag: BUILD_TAG,
    });
  }
});