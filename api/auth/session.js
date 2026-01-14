// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null;
}

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!url || !serviceKey) {
      return res.status(500).json({
        authenticated: false,
        error: "Missing SUPABASE env vars (URL / SERVICE_ROLE_KEY)",
      });
    }

    const sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Cookie HttpOnly del login
    const access_token = getCookie(req, "tg_at");
    if (!access_token) {
      return res.status(200).json({ authenticated: false });
    }

    // Validar token
    const { data: u, error: uerr } = await sb.auth.getUser(access_token);
    if (uerr || !u?.user) {
      return res.status(200).json({ authenticated: false });
    }

    const user = { id: u.user.id, email: u.user.email };

    // 🔥 BOOTSTRAP UNIVERSAL (LA CLAVE)
    const { data: boot, error: berr } = await sb.rpc(
      "bootstrap_session_context"
    );

    if (berr) throw berr;

    if (!Array.isArray(boot) || !boot[0]) {
      return res.status(500).json({
        authenticated: false,
        error: "bootstrap_session_context returned empty",
      });
    }

    const { org_id, role } = boot[0];

    return res.status(200).json({
      authenticated: true,
      user,
      current_org_id: org_id,
      role,
    });
  } catch (e) {
    console.error("[/api/auth/session] error:", e);
    return res.status(500).json({
      authenticated: false,
      error: e?.message || String(e),
    });
  }
}
