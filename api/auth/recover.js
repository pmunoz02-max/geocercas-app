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

    const { email, redirectTo } = req.body || {};
    const emailClean = String(email || "").trim().toLowerCase();
    const redirectClean = String(redirectTo || "").trim();

    if (!emailClean || !redirectClean) {
      return res.status(400).json({ error: "Email and redirectTo required" });
    }

    const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email: emailClean,
        redirect_to: redirectClean,
      }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error_description || data?.msg || data?.error || "Could not send recovery email",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[api/auth/recover] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
