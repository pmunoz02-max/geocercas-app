// api/auth/password.js
// AUTH-V7 – Form/JSON login + HttpOnly cookies + redirect (WebView/TWA-safe)

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
    maxAge, // seconds
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
  // JSON o form-urlencoded (submit nativo)
  const ct = String(req.headers["content-type"] || "").toLowerCase();

  // 1) si Vercel ya parseó body
  try {
    if (req.body && typeof req.body === "object") return req.body;
    if (typeof req.body === "string" && req.body.trim()) {
      if (ct.includes("application/json")) return JSON.parse(req.body);
      return Object.fromEntries(new URLSearchParams(req.body));
    }
  } catch {}

  // 2) raw stream
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
  const version = "auth-password-v7-cookies-2026-01-13";

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).end("Missing SUPABASE_URL / SUPABASE_ANON_KEY");
  }

  let body = {};
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).end("Invalid body");
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const next = String(body.next || "/inicio");

  if (!email || !password) {
    return res.status(400).end("Email and password required");
  }

  // Login contra Supabase
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await r.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!r.ok || !data.access_token) {
    // No pongas detalles (seguridad)
    return res.status(401).end("Invalid credentials");
  }

  // Cookies HttpOnly (persisten aunque el WebView recargue)
  // - access token corto
  // - refresh token largo
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token || "";

  // TTLs
  const accessMaxAge = Number(data.expires_in || 3600); // seconds
  const refreshMaxAge = 30 * 24 * 60 * 60; // 30 días

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

  // Redirect directo al destino (sin callback)
  res.statusCode = 302;
  res.setHeader("Location", next);
  res.end();
}
