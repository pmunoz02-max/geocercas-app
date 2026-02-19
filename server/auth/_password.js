// api/auth/password.js
// AUTH-V10 – Password login + HttpOnly cookies tg_at + tg_rt + JSON response (no 302)
// Universal/permanent for TWA/WebView and browsers: avoid redirect 302 so cookies persist reliably.

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

  try {
    if (req.body && typeof req.body === "object") return req.body;
    if (typeof req.body === "string" && req.body.trim()) {
      if (ct.includes("application/json")) return JSON.parse(req.body);
      return Object.fromEntries(new URLSearchParams(req.body));
    }
  } catch {}

  const raw = await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

  if (!raw || !String(raw).trim()) return {};
  if (ct.includes("application/json")) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req, res) {
  const build_tag = "auth-password-v10-json-sets-tg_rt-20260214";

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

    // Never cache auth responses
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, build_tag, error: "Method Not Allowed" });
    }

    // ======================
    // Env vars
    // ======================
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        ok: false,
        build_tag,
        error: "Server misconfigured",
        details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
        hasUrl: !!SUPABASE_URL,
        hasAnon: !!SUPABASE_ANON_KEY,
      });
    }

    // ======================
    // Body
    // ======================
    let body = {};
    try {
      body = await readBody(req);
    } catch {
      return res.status(400).json({ ok: false, build_tag, error: "Invalid request body" });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const next = String(body.next || "/inicio");

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        build_tag,
        error: "Email and password required",
      });
    }

    // ======================
    // Supabase login
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
      console.error("[auth/password] fetch failed:", err);
      return res.status(502).json({
        ok: false,
        build_tag,
        error: "Authentication service unreachable",
      });
    }

    if (!r.ok) {
      return res.status(401).json({ ok: false, build_tag, error: "Invalid credentials" });
    }

    const accessToken = String(data?.access_token || "");
    const refreshToken = String(data?.refresh_token || "");

    // ✅ REQUIRED: tg_rt must exist or server-side refresh cannot work reliably
    if (!accessToken || !refreshToken) {
      return res.status(500).json({
        ok: false,
        build_tag,
        error: "Auth provider did not return refresh_token",
        diag: {
          has_access_token: !!accessToken,
          has_refresh_token: !!refreshToken,
          returned_keys: Object.keys(data || {}),
        },
      });
    }

    // ======================
    // Cookies
    // ======================
    const accessMaxAge = Number(data?.expires_in || 3600);
    const refreshMaxAge = 30 * 24 * 60 * 60;

    const cookies = [
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
    ];

    res.setHeader("Set-Cookie", cookies);

    // ======================
    // Response (NO 302)
    // Frontend should redirect with window.location
    // ======================
    return res.status(200).json({
      ok: true,
      build_tag,
      redirect_to: next,
    });
  } catch (fatal) {
    console.error("[auth/password] fatal:", fatal);
    return res.status(500).json({
      ok: false,
      build_tag,
      error: "Unexpected authentication error",
    });
  }
}
