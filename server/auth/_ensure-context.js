// api/auth/ensure-context.js
import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const cookie = req.headers?.cookie || "";
  const parts = cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return "";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    const tg_at = getCookie(req, "tg_at");
    if (!tg_at) {
      return res.status(401).json({ ok: false, error: "missing tg_at cookie" });
    }

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      return res.status(500).json({
        ok: false,
        error: "missing SUPABASE_URL/ANON_KEY",
        hasUrl: Boolean(url),
        hasAnon: Boolean(anon),
      });
    }

    const sb = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${tg_at}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await sb.rpc("bootstrap_user_context");

    if (error) {
      return res.status(400).json({
        ok: false,
        error: error.message,
        code: error.code,
        details: error.details ?? null,
        hint: error.hint ?? null,
      });
    }

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "server_error" });
  }
}
