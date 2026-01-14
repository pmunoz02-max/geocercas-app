// api/auth/password.js
// auth-password-v6-form-redirect (WebView/TWA FINAL)

export default async function handler(req, res) {
  const version = "auth-password-v6-form-redirect-2026-01-13";

  // 🔒 Solo POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).end("Missing Supabase env");
  }

  // ─────────────────────────────────────────────
  // 1️⃣ Leer body (JSON o form-urlencoded)
  // ─────────────────────────────────────────────
  let body = {};
  try {
    if (req.headers["content-type"]?.includes("application/json")) {
      body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    } else {
      // form submit nativo
      const raw = await new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => resolve(data));
      });

      body = Object.fromEntries(new URLSearchParams(raw));
    }
  } catch {
    return res.status(400).end("Invalid body");
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const next = String(body.next || "/inicio");

  if (!email || !password) {
    return res.status(400).end("Email and password required");
  }

  // ─────────────────────────────────────────────
  // 2️⃣ Login en Supabase
  // ─────────────────────────────────────────────
  const r = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    }
  );

  const text = await r.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!r.ok || !data.access_token) {
    return res.status(401).end("Invalid credentials");
  }

  // ─────────────────────────────────────────────
  // 3️⃣ REDIRECT con tokens en HASH (clave)
  // ─────────────────────────────────────────────
  const hash =
    `#access_token=${encodeURIComponent(data.access_token)}` +
    `&refresh_token=${encodeURIComponent(data.refresh_token || "")}` +
    `&expires_in=${encodeURIComponent(data.expires_in || "")}` +
    `&token_type=bearer`;

  const location = `/auth/callback?next=${encodeURIComponent(next)}${hash}`;

  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}
