// api/auth/recover.js
export default async function handler(req, res) {
  const version = "auth-recover-v4-rawjson-2026-01-12";
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

    const raw = await readRawBody(req);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return send(400, { error: "Invalid JSON body", ...(debug ? { debug: { raw } } : {}) });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const redirectTo = String(body?.redirectTo || "").trim();

    if (!email || !redirectTo) {
      return send(400, { error: "Email and redirectTo required" });
    }

    // ✅ Endpoint correcto para recovery
    const url = `${SUPABASE_URL}/auth/v1/recover`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email,
        redirect_to: redirectTo,
      }),
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
        error: data?.error_description || data?.msg || data?.error || "Could not send recovery email",
        ...(debug ? { debug: { status: r.status, url, response: data } } : {}),
      });
    }

    return send(200, { ok: true });
  } catch (e) {
    console.error("[api/auth/recover] fatal:", e);
    return res.status(500).json({
      version,
      error: "Server error",
      ...(debug ? { debug: { message: String(e?.message || e), stack: String(e?.stack || "") } } : {}),
    });
  }
}
