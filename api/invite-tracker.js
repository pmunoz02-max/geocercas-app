// api/invite-tracker.js
export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization, x-client-info, apikey, content-type"
      );
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(200).send("ok");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)tg_at=([^;]+)/);
    const tgAt = m ? decodeURIComponent(m[1]) : "";

    if (!tgAt) {
      return res.status(401).json({ ok: false, error: "Missing tg_at cookie" });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({
        ok: false,
        error: "Server missing SUPABASE env (URL/ANON)",
      });
    }

    const url = String(supabaseUrl).replace(/\/$/, "") + "/functions/v1/invite_tracker";

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${tgAt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);

    try {
      const json = text ? JSON.parse(text) : null;
      return res.json(json);
    } catch {
      return res.send(text);
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
