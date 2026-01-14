// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  const hit = parts.find(p => p.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null;
}

export default async function handler(req, res) {
  try {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!url || !serviceKey) {
      return res.status(500).json({
        authenticated: false,
        error: "Missing SUPABASE env vars (URL / SERVICE_ROLE_KEY)"
      });
    }

    const sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Cookies del login NO-JS
    const access_token = getCookie(req, "tg_at");
    if (!access_token) {
      return res.status(200).json({ authenticated: false });
    }

    // Validar token y obtener user
    const { data: u, error: uerr } = await sb.auth.getUser(access_token);
    if (uerr || !u?.user) {
      return res.status(200).json({ authenticated: false });
    }
    const user = { id: u.user.id, email: u.user.email };

    // Leer profile (service role => no RLS)
    const { data: profile, error: perr } = await sb
      .from("profiles")
      .select("id,email,org_id,default_org_id,current_org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (perr) throw perr;

    let current_org_id =
      profile?.current_org_id || profile?.default_org_id || profile?.org_id || null;

    // 🔧 FIX DEFINITIVO: si sigue null => elegir y fijar
    if (!current_org_id) {
      const { data: chosen, error: cerr } = await sb.rpc(
        "ensure_current_org_for_user",
        { p_user: user.id }
      );
      if (cerr) throw cerr;
      current_org_id = chosen || null;
    }

    // Resolver rol para esa org
    let role = null;

    if (current_org_id) {
      // Preferir app_user_roles
      const { data: aur, error: aerr } = await sb
        .from("app_user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", current_org_id)
        .maybeSingle();

      if (aerr && aerr.code !== "PGRST116") throw aerr;
      role = aur?.role || null;

      // Fallback memberships
      if (!role) {
        const { data: mem, error: merr } = await sb
          .from("memberships")
          .select("role")
          .eq("user_id", user.id)
          .eq("org_id", current_org_id)
          .maybeSingle();

        if (merr && merr.code !== "PGRST116") throw merr;
        role = mem?.role || null;
      }
    }

    return res.status(200).json({
      authenticated: true,
      user,
      current_org_id,
      role
    });
  } catch (e) {
    // Importantísimo para evitar “FUNCTION_INVOCATION_FAILED” sin info
    console.error("[/api/auth/session] error:", e);
    return res.status(500).json({
      authenticated: false,
      error: e?.message || String(e)
    });
  }
}
