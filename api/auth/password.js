export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY" });
    }

    const { email, password } = req.body || {};
    const emailClean = String(email || "").trim().toLowerCase();
    const passwordClean = String(password || "");

    if (!emailClean || !passwordClean) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email: emailClean, password: passwordClean }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      // Propagar error legible sin filtrar demasiado
      return res.status(r.status).json({
        error: data?.error_description || data?.msg || data?.error || "Invalid login credentials",
      });
    }

    // Devuelve tokens para que el frontend haga supabase.auth.setSession()
    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
      user: data.user,
    });
  } catch (e) {
    console.error("[api/auth/password] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
