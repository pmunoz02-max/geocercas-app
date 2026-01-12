// api/auth/password.js
export default async function handler(req, res) {
  const version = "auth-password-v4-rawjson-2026-01-12";
  const debug = process.env.AUTH_DEBUG === "1";

  function send(status, payload) {
    return res.status(status).json({ version, ...payload });
  }

  async function readRawBody(req) {
    return await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
      req.on("error", (err) => reject(err));
    });
  }

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(405, { error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return send(500, { error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY" });
    }

    // ✅ Leer body RAW y parsear nosotros (evita Invalid JSON del runtime)
    const raw = await readRawBody(req);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return send(400, {
        error: "Invalid JSON body",
        ...(debug ? { debug: { raw } } : {}),
      });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return send(400, { error: "Email and password required" });
    }

    const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

    const r = await fetch(url, {
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
      data = { raw: text };
    }

    if (!r.ok) {
      return res.status(r.status).json({
        version,
        error: data?.error_description || data?.msg || data?.error || "Auth error",
        ...(debug ? { debug: { status: r.status, url, response: data } } : {}),
      });
    }

    return send(200, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
      user: data.user,
    });
  } catch (e) {
    console.error("[api/auth/password] fatal:", e);
    return res.status(500).json({
      version,
      error: "Server error",
      ...(debug ? { debug: { message: String(e?.message || e), stack: String(e?.stack || "") } } : {}),
    });
  }
}
