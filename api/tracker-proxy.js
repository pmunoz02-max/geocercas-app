// api/tracker-proxy.js
// Vercel Serverless (Node) - CommonJS safe
// v9: no ESM imports, no edge-only APIs, always returns JSON, strict allowlist + alias map,
//     forward user JWT when present, service-role fallback ONLY for send_position,
//     stable HMAC signature on exact body string sent upstream.

const crypto = require("crypto");

const BUILD_TAG = "tracker-proxy-v9_cjs_no_crash_20260224";

function safeJson(res, status, obj) {
  try {
    res.status(status).json(obj);
  } catch (e) {
    // last resort
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  }
}

function hostOf(url) {
  try {
    return new URL(String(url)).host;
  } catch {
    return "";
  }
}

function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || "").trim();
}

function hmacHex(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

// Only allow required fns (hardening)
const ALLOW = new Set(["send_position", "accept-tracker-invite"]);

// Map any incoming fn aliases to canonical Supabase function slugs
function normalizeFn(fn) {
  const raw = String(fn || "").trim();

  // common variants we saw in chat
  const map = {
    "accept-tracker-invite": "accept-tracker-invite",
    "accept-tracker-invite": "accept-tracker-invite", // tolerate old wrong name
    "accept-tracker-invite": "accept-tracker-invite",
    "send_position": "send_position",
  };

  return map[raw] || raw;
}

// Stable stringify (sorted keys) to avoid accidental reordering.
// NOTE: This is only for creating bodyStr we send upstream; function will see exactly this rawBody.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map((v) => stableStringify(v)).join(",") + "]";
  }

  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
  return "{" + parts.join(",") + "}";
}

module.exports = async (req, res) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-proxy-ts, x-proxy-signature");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      return res.status(200).send("ok");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Unify: prefer TRACKER_PROXY_SECRET; fall back to PROXY_SECRET only
    const PROXY_SECRET =
      process.env.TRACKER_PROXY_SECRET ||
      process.env.PROXY_SECRET ||
      "";

    // Diagnostics endpoint (GET)
    if (req.method === "GET") {
      return safeJson(res, 200, {
        ok: true,
        build_tag: BUILD_TAG,
        diag: {
          hasUrl: !!SUPABASE_URL,
          hasAnon: !!SUPABASE_ANON_KEY,
          hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY,
          hasProxySecret: !!PROXY_SECRET,
          supabase_host: hostOf(SUPABASE_URL),
          node: process.version,
        },
      });
    }

    if (req.method !== "POST") {
      return safeJson(res, 405, { ok: false, build_tag: BUILD_TAG, error: "METHOD_NOT_ALLOWED" });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !PROXY_SECRET) {
      return safeJson(res, 500, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing env",
        diag: {
          hasUrl: !!SUPABASE_URL,
          hasAnon: !!SUPABASE_ANON_KEY,
          hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY,
          hasProxySecret: !!PROXY_SECRET,
        },
      });
    }

    const fnIn = req.query?.fn;
    const fn = normalizeFn(fnIn);

    if (!ALLOW.has(fn)) {
      return safeJson(res, 400, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "FN_NOT_ALLOWED",
        fn_in: String(fnIn || ""),
        fn_canon: fn,
      });
    }

    // Body string we will send upstream AND sign (must match rawBody in Edge Function)
    const bodyObj = req.body ?? {};
    const bodyStr = stableStringify(bodyObj);

    // Decide authorization for upstream
    // - accept-tracker-invite: REQUIRE user JWT (avoid ghost onboarding)
    // - send_position: allow service fallback (tracker can operate without session)
    const userJwt = getBearerToken(req);

    let bearer;
    if (fn === "accept-tracker-invite") {
      if (!userJwt) {
        return safeJson(res, 401, {
          ok: false,
          build_tag: BUILD_TAG,
          error: "Missing Authorization for accept-tracker-invite",
        });
      }
      bearer = `Bearer ${userJwt}`;
    } else {
      // send_position
      bearer = userJwt ? `Bearer ${userJwt}` : (SUPABASE_SERVICE_ROLE_KEY ? `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` : null);
      if (!bearer) {
        return safeJson(res, 401, {
          ok: false,
          build_tag: BUILD_TAG,
          error: "Missing Authorization and no service role fallback",
        });
      }
    }

    // HMAC signature
    const ts = String(Date.now());
    const msg = `${fn}.${ts}.${bodyStr}`;
    const sig = hmacHex(PROXY_SECRET, msg);

    const upstreamUrl = String(SUPABASE_URL).replace(/\/$/, "") + `/functions/v1/${fn}`;

    const upstreamResp = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        apikey: String(SUPABASE_ANON_KEY),
        Authorization: bearer,
        "Content-Type": "application/json",
        "X-Proxy-Ts": ts,
        "X-Proxy-Signature": sig,
      },
      body: bodyStr,
    });

    const text = await upstreamResp.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text ? { raw: text } : null;
    }

    return safeJson(res, upstreamResp.status, {
      build_tag: BUILD_TAG,
      fn_in: String(fnIn || ""),
      fn: fn,
      upstream_status: upstreamResp.status,
      ...(payload || {}),
    });
  } catch (e) {
    return safeJson(res, 500, {
      ok: false,
      build_tag: BUILD_TAG,
      error: String(e && e.message ? e.message : e),
    });
  }
};