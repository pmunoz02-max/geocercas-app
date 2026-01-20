// api/auth/password.js
// AUTH-V9 – No-crash universal (Vercel Node Serverless) + HttpOnly cookies + JSON/redirect modes

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

async function readBody(req) {
  const ct = String(req.headers["content-type"] || "").toLowerCase();

  // If body is already parsed by runtime/middleware
  if (req.body && typeof req.body === "object") return req.body;

  // If body is a string
  if (typeof req.body === "string" && req.body.trim()) {
    if (ct.includes("application/json")) return JSON.parse(req.body);
    return Object.fromEntries(new URLSearchParams(req.body));
  }

  // Raw stream
  const raw = await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

  if (!raw || !String(raw).trim()) return {};
  if (ct.includes("application/json")) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

function wantsJson(req) {
  const accept = String(req.headers["accept"] || "").toLowerCase();
  return accept.includes("application/json") || accept.includes("text/json");
}

module.exports = async (req, res) => {
  const version = "auth-password-v9-nocrash-2026-01-20";

  try {
    // ======================
    // CORS / preflight
    // ======================
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

    // ======================
    // Method guard (NO CRASH)
    // ======================
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,OPTIONS");
      res.statusCode = 405;
      return res.end("Method Not Allowed");
    }

    // ======================
    // Env vars
    // ======================
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(
        JSON.stringify({
          error: "Server misconfigured",
          details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
          version,
        })
      );
    }

    // ======================
    // Body
    // ======================
    let body = {};
    try {
      body = await readBody(req);
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Invalid request body", version }));
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const next = String(body.next || "/inicio");

    if (!email || !password) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(
        JSON.stringify({
          error: "Email and password required",
          required: ["email", "password"],
          version,
        })
      );
    }

    // ======================
    // Supabase password grant
    // ======================
    let r, data;
    try {
      r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, password }),
      });

      const text = await r.text();
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      console.error("[api/auth/password] fetch failed:", err);
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(
        JSON.stringify({
          error: "Authentication service unreachable",
          version,
        })
      );
    }

    if (!r.ok || !data?.access_token) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Invalid credentials", version }));
    }

    // ======================
    // Cookies (HttpOnly)
    // ======================
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token || "";
    const accessMaxAge = Number(data.expires_in || 3600);
    const refreshMaxAge = 30 * 24 * 60 * 60;

    res.setHeader("Set-Cookie", [
      makeCookie("tg_at", accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: accessMaxAge,
      }),
      makeCookie("tg_rt", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: refreshMaxAge,
      }),
    ]);

    // ======================
    // Response mode
    // ======================
    if (wantsJson(req) || body.json === true) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(
        JSON.stringify({
          ok: true,
          user_id: data.user?.id || null,
          expires_in: data.expires_in || null,
          next,
          version,
        })
      );
    }

    // Default: redirect for browser form login
    res.statusCode = 302;
    res.setHeader("Location", next);
    return res.end();
  } catch (fatal) {
    // 🔒 Nunca crash
    console.error("[api/auth/password] fatal:", fatal);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "Unexpected error", version }));
  }
};
