// api/invite-tracker.js
// Proxy API-first: Browser -> Vercel (cookies tg_at/tg_rt) -> Supabase Edge Function invite_tracker
// Never crash, always JSON.
// Universal runtime: NO dependency on global fetch (works on Node 16/18/20).

const https = require("https");
const http = require("http");

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
  // Vercel sometimes gives req.body as object/string/buffer depending on runtime
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);
  if (Buffer.isBuffer(req.body) && req.body.length) return JSON.parse(req.body.toString("utf8"));

  const raw = await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

  if (!raw || !String(raw).trim()) return {};
  return JSON.parse(raw);
}

/**
 * Minimal fetch-like request using http/https (no external deps).
 * Returns { ok, status, headers, text():Promise<string> }.
 */
function nodeRequest(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;

    const opts = {
      method,
      hostname: u.hostname,
      port: u.port ? Number(u.port) : isHttps ? 443 : 80,
      path: `${u.pathname}${u.search || ""}`,
      headers: {
        ...headers,
      },
    };

    const req2 = lib.request(opts, (r) => {
      let data = "";
      r.on("data", (chunk) => (data += chunk));
      r.on("end", () => {
        resolve({
          ok: r.statusCode >= 200 && r.statusCode < 300,
          status: r.statusCode || 0,
          headers: r.headers || {},
          text: async () => data,
        });
      });
    });

    req2.on("error", reject);

    if (body !== undefined && body !== null) {
      req2.write(typeof body === "string" ? body : String(body));
    }
    req2.end();
  });
}

function safeJsonParse(text) {
  if (!text || !String(text).trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function refreshAccessToken({ supabaseUrl, anonKey, refreshToken }) {
  const url = `${String(supabaseUrl).replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;

  const r = await nodeRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await r.text();
  const json = safeJsonParse(text) || {};

  if (!r.ok || !json?.access_token) {
    const msg = json?.error_description || json?.error || "Failed to refresh token";
    const err = new Error(msg);
    err.status = 401;
    err.body = json || null;
    throw err;
  }

  return json; // {access_token, refresh_token, expires_in, user, ...}
}

module.exports = async (req, res) => {
  const version = "invite-tracker-proxy-v2-node-http-2026-01-21";

  try {
    // CORS (same-origin recommended; still safe)
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");

    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      return res.end();
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,OPTIONS");
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ ok: false, error: "Method Not Allowed", version }));
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(
        JSON.stringify({
          ok: false,
          error: "Server misconfigured",
          details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
          version,
        })
      );
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (e) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ ok: false, error: "Invalid JSON body", details: String(e?.message || e), version }));
    }

    const email = String(body.email || "").trim().toLowerCase();
    const org_id = String(body.org_id || "").trim();

    if (!email || !email.includes("@") || !org_id) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(
        JSON.stringify({
          ok: false,
          error: "Missing or invalid fields",
          required: ["email", "org_id"],
          version,
        })
      );
    }

    // Read cookies from browser request
    const cookies = parseCookies(req.headers.cookie || "");
    let accessToken = cookies.tg_at || "";
    const refreshToken = cookies.tg_rt || "";

    if (!accessToken) {
      // Try refresh if we at least have refresh token
      if (!refreshToken) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(
          JSON.stringify({
            ok: false,
            error: "No session token (missing tg_at cookie). Please login again.",
            version,
          })
        );
      }

      const refreshed = await refreshAccessToken({
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        refreshToken,
      });

      accessToken = refreshed.access_token;

      // Update cookies (keep refresh token too)
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

    // Call Supabase Edge Function using Authorization as the user
    const fnUrl = `${String(SUPABASE_URL).replace(/\/$/, "")}/functions/v1/invite_tracker`;

    let fnRes;
    try {
      fnRes = await nodeRequest(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email, org_id }),
      });
    } catch (e) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(
        JSON.stringify({
          ok: false,
          error: "Network error calling invite_tracker",
          details: String(e?.message || e),
          version,
        })
      );
    }

    // Pass-through response
    const text = await fnRes.text();
    const json = safeJsonParse(text);

    res.statusCode = fnRes.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(
      JSON.stringify({
        ok: fnRes.ok,
        status: fnRes.status,
        data: json,
        version,
      })
    );
  } catch (fatal) {
    console.error("[api/invite-tracker] fatal:", fatal);
    res.statusCode = fatal?.status || 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(
      JSON.stringify({
        ok: false,
        error: fatal?.message || "Unexpected error",
        details: fatal?.body || null,
        stack: fatal?.stack || null,
        version,
      })
    );
  }
};
