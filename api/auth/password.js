// api/auth/password.js
export default async function handler(req, res) {
  const version = "auth-password-v5-safe-body-2026-01-12";
  const debug = process.env.AUTH_DEBUG === "1";

  const send = (status, payload) => res.status(status).json({ version, ...payload });

  const safeGetBody = async () => {
    // 1) Intentar req.body (puede existir o puede lanzar)
    try {
      if (req.body && typeof req.body === "object") return req.body;
      if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);
    } catch (e) {
      // si aquí falla, seguimos a raw
      if (debug) console.log("[password] req.body parse failed:", String(e?.message || e));
    }

    // 2) Si el stream ya terminó, no esperar (evita hang)
    if (req.readableEnded || req.complete) return {};

    // 3) Leer RAW con timeout corto (evita hang)
    const raw = await new Promise((resolve) => {
      let data = "";
      const timer = setTimeout(() => resolve("__TIMEOUT__"), 2500);

      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        clearTimeout(timer);
        resolve(data);
      });
      req.on("error", () => {
        clearTimeout(timer);
        resolve("__ERROR__");
      });
    });

    if (raw === "__TIMEOUT__") throw new Error("Body read timeout");
    if (raw === "__ERROR__") throw new Error("Body read error");
    if (!raw || !String(raw).trim()) return {};

    try {
      return JSON.parse(String(raw));
    } catch {
      throw new Error("Invalid JSON body");
    }
  };

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

    const body = await safeGetBody();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) return send(400, { error: "Email and password required" });

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
