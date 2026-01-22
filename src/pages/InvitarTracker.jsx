// api/invite-tracker.js
// Proxy API-first: Browser -> Vercel (cookies tg_at/tg_rt) -> Supabase Edge Function invite_tracker
// Goals:
// - Never crash
// - Always return JSON (even on errors)
// - Preserve upstream status code
// - If upstream returns 401 and we have tg_rt, refresh once and retry
// - Surface a trace_id to correlate Vercel <-> Supabase logs

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function makeCookie(name, value, opts = {}) {
  const {
    httpOnly = true,
    secure = true,
    sameSite = "Lax",
    path = "/",
    maxAge,
  } = opts;

  let s = `${name}=${encodeURIComponent(value ?? "")}`;
  if (path) s += `; Path=${path}`;
  if (typeof maxAge === "number") s += `; Max-Age=${maxAge}`;
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += `; Secure`;
  if (httpOnly) s += `; HttpOnly`;
  return s;
}

async function readJsonBody(req) {
  // Vercel usually parses req.body for us, but keep a safe fallback.
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);

  const raw = await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

  if (!raw || !String(raw).trim()) return {};
  return JSON.parse(raw);
}

async function refreshAccessToken({ supabaseUrl, anonKey, refreshToken }) {
  const url = `${String(supabaseUrl).replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await r.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = text ? { raw: text } : {};
  }

  if (!r.ok || !json?.access_token) {
    const msg = json?.error_description || json?.error || "Failed to refresh token";
    const err = new Error(msg);
    err.status = 401;
    err.body = json || null;
    throw err;
  }

  return json; // {access_token, refresh_token, expires_in, user, ...}
}

async function callInviteTracker({ supabaseUrl, anonKey, accessToken, payload, traceId }) {
  const fnUrl = `${String(supabaseUrl).replace(/\/$/, "")}/functions/v1/invite_tracker`;

  const r = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "x-tg-trace": traceId,
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text ? { raw: text } : null;
  }

  return { r, json };
}

// Force Node.js runtime (avoid accidental edge runtime)
module.exports.config = { runtime: "nodejs" };

module.exports = async (req, res) => {
  const version = "invite-tracker-proxy-v2-2026-01-21";
  const traceId =
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `tg_${Date.now()}_${Math.random().toString(16).slice(2)}`);

  try {
    // CORS (same-origin recommended; still safe)
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("x-tg-proxy-version", version);
    res.setHeader("x-tg-trace", traceId);

    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, version, trace_id: traceId }));
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,OPTIONS");
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok: false, error: "Method Not Allowed", version, trace_id: traceId }));
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({
          ok: false,
          error: "Server misconfigured",
          details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
          version,
          trace_id: traceId,
        })
      );
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: "Invalid JSON body", version, trace_id: traceId }));
    }

    // Accept flexible payloads (future-proof):
    // - email: required
    // - org_id: required today (matches your proxy design)
    // - person_id: optional (in case you switch to deriving org_id server-side later)
    const email = String(body.email || "").trim().toLowerCase();
    const org_id = String(body.org_id || "").trim();
    const person_id = body.person_id ? String(body.person_id).trim() : undefined;

    if (!email || !email.includes("@")) {
      res.statusCode = 400;
      return res.end(JSON.stringify({
        ok: false,
        error: "Missing or invalid email",
        required: ["email", "org_id"],
        version,
        trace_id: traceId,
      }));
    }
    if (!org_id) {
      res.statusCode = 400;
      return res.end(JSON.stringify({
        ok: false,
        error: "Missing org_id (panel must send currentOrg.id)",
        required: ["email", "org_id"],
        version,
        trace_id: traceId,
      }));
    }

    const cookies = parseCookies(req.headers.cookie || "");
    let accessToken = cookies.tg_at || "";
    const refreshToken = cookies.tg_rt || "";

    // If we don't have access token, refresh (requires tg_rt)
    if (!accessToken) {
      if (!refreshToken) {
        res.statusCode = 401;
        return res.end(JSON.stringify({
          ok: false,
          error: "No session token (missing tg_at cookie). Please login again.",
          version,
          trace_id: traceId,
        }));
      }

      const refreshed = await refreshAccessToken({
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        refreshToken,
      });

      accessToken = refreshed.access_token;

      const accessMaxAge = Number(refreshed.expires_in || 3600);
      const refreshMaxAge = 30 * 24 * 60 * 60;

      res.setHeader("Set-Cookie", [
        makeCookie("tg_at", refreshed.access_token, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          maxAge: accessMaxAge,
        }),
        makeCookie("tg_rt", refreshed.refresh_token || refreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          maxAge: refreshMaxAge,
        }),
      ]);
    }

    const payload = { email, org_id };
    if (person_id) payload.person_id = person_id;

    // 1st attempt
    let { r: fnRes, json: fnJson } = await callInviteTracker({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken,
      payload,
      traceId,
    });

    // If unauthorized and we have refresh token, refresh once and retry
    if (fnRes.status === 401 && refreshToken) {
      try {
        const refreshed = await refreshAccessToken({
          supabaseUrl: SUPABASE_URL,
          anonKey: SUPABASE_ANON_KEY,
          refreshToken,
        });

        accessToken = refreshed.access_token;

        const accessMaxAge = Number(refreshed.expires_in || 3600);
        const refreshMaxAge = 30 * 24 * 60 * 60;

        res.setHeader("Set-Cookie", [
          makeCookie("tg_at", refreshed.access_token, {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            maxAge: accessMaxAge,
          }),
          makeCookie("tg_rt", refreshed.refresh_token || refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            maxAge: refreshMaxAge,
          }),
        ]);

        const retry = await callInviteTracker({
          supabaseUrl: SUPABASE_URL,
          anonKey: SUPABASE_ANON_KEY,
          accessToken,
          payload,
          traceId,
        });
        fnRes = retry.r;
        fnJson = retry.json;
      } catch (e) {
        // Refresh failed -> return that error
        res.statusCode = e?.status || 401;
        return res.end(JSON.stringify({
          ok: false,
          error: e?.message || "Refresh failed",
          details: e?.body || null,
          version,
          trace_id: traceId,
        }));
      }
    }

    // IMPORTANT: Preserve upstream status, but include upstream body + trace_id for debugging
    res.statusCode = fnRes.status;
    return res.end(JSON.stringify({
      ok: fnRes.ok,
      version,
      trace_id: traceId,
      upstream: fnJson,
    }));
  } catch (fatal) {
    console.error("[api/invite-tracker] fatal:", fatal);
    res.statusCode = fatal?.status || 500;
    return res.end(JSON.stringify({
      ok: false,
      error: fatal?.message || "Unexpected error",
      details: fatal?.body || null,
      version: "invite-tracker-proxy-v2-2026-01-21",
      trace_id: traceId,
    }));
  }
};
