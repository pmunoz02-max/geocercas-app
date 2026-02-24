// api/auth/password.js
// AUTH-V8 – Robust password login (no crashes) + HttpOnly cookies + redirect

function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach((part) => {
    const p = part.trim();
    if (!p) return;
    const i = p.indexOf("=");
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  });
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
  const version = "auth-password-v8-safe-2026-01-18";

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
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).end("Method Not Allowed");
    }

    // ======================
    // Env vars
    // ======================
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error: "Server misconfigured",
        details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
        version,
      });
    }

    // ======================
    // Body
    // ======================
    let body = {};
    try {
      body = await readBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const next = String(body.next || "/inicio");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
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
        error: "Authentication service unreachable",
      });
    }

    if (!r.ok || !data?.access_token) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // ======================
    // Cookies
    // ======================
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token || "";

    const accessMaxAge = Number(data.expires_in || 3600);
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
    // Redirect
    // ======================
    res.statusCode = 302;
    res.setHeader("Location", next);
    res.end();
  } catch (fatal) {
    // 🔒 Nunca crash
    console.error("[auth/password] fatal:", fatal);
    res.status(500).json({
      error: "Unexpected authentication error",
      version,
    });
  }
}
