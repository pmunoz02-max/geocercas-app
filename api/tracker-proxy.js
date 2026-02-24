// api/tracker-proxy.js
// Universal Tracker proxy for Vercel -> Supabase Edge Functions
// v8: fn alias mapping + strict allowlist + always-forward user Authorization + stable HMAC payload
//
// Goals:
// - Never call arbitrary edge functions (allowlist only)
// - Support legacy/typo fn names from older frontends (alias map)
// - Forward the browser user's JWT if present (Authorization: Bearer <access_token>)
// - Optionally fall back to Service Role ONLY when explicitly allowed (send_position can work without user session)
// - Produce consistent HMAC signature based on the exact JSON payload we send upstream

import crypto from "crypto";

const BUILD_TAG = "tracker-proxy-v8_fnmap_auth_forward_20260224";

// ---- helpers ----
const toStr = (v) => String(v ?? "");
const safeHost = (url) => {
  try {
    return new URL(String(url)).host;
  } catch {
    return "";
  }
};
const hmacHex = (secret, msg) =>
  crypto.createHmac("sha256", secret).update(msg).digest("hex");

function getAuthorizationHeader(req) {
  // Preserve original header value if present
  return (
    req.headers?.authorization ||
    req.headers?.Authorization ||
    req.headers?.AUTHORIZATION ||
    ""
  );
}

function getBearerToken(req) {
  const h = getAuthorizationHeader(req);
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || "").trim();
}

// ---- fn allowlist + alias mapping ----
// Canonical function names (as deployed in Supabase)
const FN_CANON = {
  SEND_POSITION: "send_position",
  ACCEPT_TRACKER_INVITE: "accept-tracker-invite", // <-- canonical in your PROD list
};

// Accept legacy names from older builds and map them to canonical slugs
const FN_MAP = {
  // canonical passthrough
  [FN_CANON.SEND_POSITION]: FN_CANON.SEND_POSITION,
  [FN_CANON.ACCEPT_TRACKER_INVITE]: FN_CANON.ACCEPT_TRACKER_INVITE,

  // common legacy/typo variants observed in this project
  "accept-tracker-invite": FN_CANON.ACCEPT_TRACKER_INVITE,
  "accept_tracker_invite": FN_CANON.ACCEPT_TRACKER_INVITE,
  "accept-tracker-invite": FN_CANON.ACCEPT_TRACKER_INVITE,
};

function normalizeFn(fnInput) {
  const raw = toStr(fnInput).trim();
  return FN_MAP[raw] || null;
}

// For safety: only these canonical slugs can be called
const ALLOWED_CANON = new Set([FN_CANON.SEND_POSITION, FN_CANON.ACCEPT_TRACKER_INVITE]);

// Whether service-role fallback is allowed when browser has no Bearer JWT
// - send_position: allowed (tracker may be a public page with no supabase session)
// - accept-tracker-invite: NOT allowed (must come from a real signed-in user)
function serviceFallbackAllowed(canonFn) {
  return canonFn === FN_CANON.SEND_POSITION;
}

async function readUpstream(upstream) {
  const text = await upstream.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export default async function handler(req, res) {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "content-type, authorization, x-proxy-ts, x-proxy-signature"
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      return res.status(200).send("ok");
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const proxySecret =
      process.env.TRACKER_PROXY_SECRET ||
      process.env.PROXY_SECRET ||
      process.env.INVITE_PROXY_SECRET; // tolerate env naming drift

    // Simple health/diag endpoint
    if (req.method === "GET") {
      const fnIn = req.query?.fn;
      const canon = normalizeFn(fnIn);
      return res.status(200).json({
        ok: true,
        build_tag: BUILD_TAG,
        diag: {
          hasUrl: !!supabaseUrl,
          hasAnon: !!anonKey,
          hasServiceRole: !!serviceRole,
          hasProxySecret: !!proxySecret,
          supabase_host: safeHost(supabaseUrl),
          auth_header_present: !!getAuthorizationHeader(req),
          bearer_present: !!getBearerToken(req),
          fn_in: fnIn ?? null,
          fn_canon: canon,
          fn_allowed: canon ? ALLOWED_CANON.has(canon) : false,
        },
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, build_tag: BUILD_TAG, error: "METHOD_NOT_ALLOWED" });
    }

    if (!supabaseUrl || !anonKey || !proxySecret) {
      return res.status(500).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing env",
        diag: { hasUrl: !!supabaseUrl, hasAnon: !!anonKey, hasProxySecret: !!proxySecret },
      });
    }

    // Normalize / validate fn
    const canonFn = normalizeFn(req.query?.fn);
    if (!canonFn || !ALLOWED_CANON.has(canonFn)) {
      return res.status(400).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "FN_NOT_ALLOWED",
        fn_in: req.query?.fn ?? null,
        fn_canon: canonFn,
      });
    }

    // Body: Vercel already parsed JSON for us (for content-type application/json).
    // We'll re-stringify to a deterministic payload we send upstream,
    // and we will sign EXACTLY that string.
    const bodyObj = req.body ?? {};
    const bodyStr = JSON.stringify(bodyObj);

    // Authorization: ALWAYS prefer the incoming browser JWT (if any)
    const incomingAuth = getAuthorizationHeader(req);
    const bearerToken = getBearerToken(req);

    let upstreamAuth = "";
    if (bearerToken) {
      upstreamAuth = incomingAuth; // keep the original 'Bearer <jwt>'
    } else if (serviceRole && serviceFallbackAllowed(canonFn)) {
      // Only allowed for certain functions
      upstreamAuth = `Bearer ${serviceRole}`;
    } else {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing Authorization",
        hint: {
          required: "Authorization: Bearer <access_token>",
          fn: canonFn,
          service_fallback_allowed: serviceFallbackAllowed(canonFn),
        },
      });
    }

    // HMAC signature header (used by send_position hardening)
    const ts = String(Date.now());
    const msg = `${canonFn}.${ts}.${bodyStr}`;
    const sig = hmacHex(proxySecret, msg);

    const url =
      String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${canonFn}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        apikey: String(anonKey),
        Authorization: upstreamAuth,
        "Content-Type": "application/json",
        "X-Proxy-Ts": ts,
        "X-Proxy-Signature": sig,
      },
      body: bodyStr,
    });

    const payload = await readUpstream(upstream);

    return res.status(upstream.status).json({
      build_tag: BUILD_TAG,
      fn: canonFn,
      upstream_status: upstream.status,
      ...(payload ?? {}),
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: String(e?.message || e),
    });
  }
}
