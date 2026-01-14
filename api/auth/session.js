import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  const hit = parts.find(p => p.startsWith(name + "="));
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

    // Validar token
    const { data: u, error: uerr } = await sb.auth.getUser(access_token);
    if (uerr || !u?.user) {
      return res.status(200).json({ authenticated: false });
    }

    const user = { id: u.user.id, email: u.user.email };

    // Leer profile (service role => sin RLS)
    const { data: profile, error: perr } = await sb
      .from("profiles")
      .select(
        "id,email,org_id,default_org_id,current_org_id,active_tenant_id"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (perr) throw perr;

    let current_org_id =
      profile?.active_tenant_id ||
      profile?.current_org_id ||
      profile?.default_org_id ||
      profile?.org_id ||
      null;

    let ensured = false;

    // 🔧 MODELO C – FIX DEFINITIVO
    if (!current_org_id) {
      const { data: chosen, error: cerr } = await sb.rpc(
        "ensure_current_org_for_user",
        { p_user: user.id }
      );
      if (cerr) throw cerr;

      current_org_id = chosen || null;
      ensured = true;
    }

    // Resolver rol
    let role = null;

    if (current_org_id) {
      // 1) app_user_roles (role)
      const { data: aur, error: aerr } = await sb
        .from("app_user_roles")
        .select("role, role_name")
        .eq("user_id", user.id)
        .eq("org_id", current_org_id)
        .maybeSingle();

      if (aerr && aerr.code !== "PGRST116") throw aerr;

      role = aur?.role || aur?.role_name || null;

      // 2) memberships fallback
      if (!role) {
        const { data: mem, error: merr } = await sb
          .from("memberships")
          .select("role, role_name")
          .eq("user_id", user.id)
          .eq("org_id", current_org_id)
          .maybeSingle();

        if (merr && merr.code !== "PGRST116") throw merr;

        role = mem?.role || mem?.role_name || null;
      }
    }

    // 🛡️ GARANTÍA FINAL
    // Si acabamos de auto-crear org (ensure_current_org_for_user),
    // el rol DEBE existir. Si no vino por lectura, lo forzamos a owner.
    if (ensured && !role) {
      role = "owner";
    }

    return res.status(200).json({
      authenticated: true,
      user,
      current_org_id,
      role
    });
  } catch (e) {
    console.error("[/api/auth/session] error:", e);
    return res.status(500).json({
      authenticated: false,
      error: e?.message || String(e)
    });
  }
}
