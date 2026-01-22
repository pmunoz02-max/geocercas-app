// api/invite-tracker.js
// Proxy API-first: Browser -> Vercel (cookies tg_at/tg_rt) -> Supabase Edge Function invite_tracker
// Nunca crashea, siempre JSON.

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
    out[k] = decodeURIComponent(v);
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
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }

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
  const json = text ? JSON.parse(text) : {};

  if (!r.ok || !json?.access_token) {
    const err = new Error(json?.error_description || json?.error || "Failed to refresh token");
    err.status = 401;
    err.body = json || null;
    throw err;
  }

  return json;
}

module.exports = async (req, res) => {
  const version = "invite-tracker-proxy-v1-2026-01-22";

  try {
    // CORS
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");

    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      return res.end();
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,OPTIONS");
      res.statusCode = 405;
      return res.end("Method Not Allowed");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({
        ok: false,
        error: "Server misconfigured",
        details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
        version,
      }));
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ ok: false, error: "Invalid JSON body", version }));
    }

    const email = String(body.email || "").trim().toLowerCase();
    const org_id = String(body.org_id || "").trim();
    const person_id = String(body.person_id || "").trim();

    if (!email || !email.includes("@") || !org_id || !person_id) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({
        ok: false,
        error: "Missing or invalid fields",
        required: ["email", "org_id", "person_id"],
        version,
      }));
    }

    const cookies = parseCookies(req.headers.cookie || "");
    let accessToken = cookies.tg_at || "";
    const refreshToken = cookies.tg_rt || "";

    if (!accessToken) {
      if (!refreshToken) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(JSON.stringify({
          ok: false,
          error: "No session token (missing tg_at)",
          version,
        }));
      }

      const refreshed = await refreshAccessToken({
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        refreshToken,
      });

      accessToken = refreshed.access_token;

      res.setHeader("Set-Cookie", [
        makeCookie("tg_at", refreshed.access_token, {
          maxAge: Number(refreshed.expires_in || 3600),
        }),
        makeCookie("tg_rt", refreshed.refresh_token || refreshToken, {
          maxAge: 30 * 24 * 60 * 60,
        }),
      ]);
    }

    const fnUrl = `${String(SUPABASE_URL).replace(/\/$/, "")}/functions/v1/invite_tracker`;

    const fnRes = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, org_id, person_id }),
    });

    const text = await fnRes.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text ? { raw: text } : null;
    }

    res.statusCode = fnRes.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({
      ok: fnRes.ok,
      data,
      version,
    }));
  } catch (fatal) {
    console.error("[api/invite-tracker] fatal:", fatal);
    res.statusCode = fatal?.status || 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({
      ok: false,
      error: fatal?.message || "Unexpected error",
      details: fatal?.body || null,
      version,
    }));
  }
};
