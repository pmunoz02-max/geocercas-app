// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default async function handler(req, res) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error: "Missing env",
        missing: {
          SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
        },
      });
    }

    // Cookies que ya viste en el browser: tg_at / tg_rt
    const access_token = getCookie(req, "tg_at");
    const refresh_token = getCookie(req, "tg_rt");

    if (!access_token) {
      return res.status(200).json({ authenticated: false });
    }

    // Cliente "server" usando el JWT del usuario en headers (respeta RLS como el usuario)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // Validar token y obtener usuario
    const { data: userData, error: userErr } = await supabase.auth.getUser(access_token);
    if (userErr || !userData?.user) {
      return res.status(200).json({ authenticated: false });
    }

    const user = { id: userData.user.id, email: userData.user.email };

    // Traer profile (current_org_id, default_org_id, etc.)
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id,email,role,org_id,default_org_id,current_org_id,tenant_id,active_tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    // Si RLS impide leer profile, NO reventamos: devolvemos lo mínimo para debug
    if (profErr) {
      return res.status(200).json({
        authenticated: true,
        user,
        profile_error: profErr.message,
      });
    }

    // Determinar org actual
    const current_org_id =
      profile?.current_org_id || profile?.default_org_id || profile?.org_id || null;

    // Determinar rol (preferimos app_user_roles si existe; si falla, usar profile.role)
    let role = profile?.role || null;

    if (current_org_id) {
      const { data: aur, error: aurErr } = await supabase
        .from("app_user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", current_org_id)
        .maybeSingle();

      if (!aurErr && aur?.role) role = aur.role;
    }

    return res.status(200).json({
      version: "auth-session-v1",
      authenticated: true,
      user,
      current_org_id,
      role,
      profile: profile || null,
      has_refresh_cookie: !!refresh_token,
    });
  } catch (e) {
    // Esto evita "FUNCTION_INVOCATION_FAILED" sin info
    return res.status(500).json({
      error: "session_handler_crash",
      message: e?.message || String(e),
      stack: e?.stack || null,
    });
  }
}
