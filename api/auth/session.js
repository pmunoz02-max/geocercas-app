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

    const anonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!url) {
      return res.status(500).json({ authenticated: false, error: "Missing SUPABASE_URL" });
    }

    const access_token = getCookie(req, "tg_at");
    if (!access_token) return res.status(200).json({ authenticated: false });

    // --- Cliente usuario (para que auth.uid() funcione en RPC) ---
    let sbUser = null;
    if (anonKey) {
      sbUser = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      });
    }

    // Validar usuario (con sbUser si existe, sino con service)
    let user = null;

    if (sbUser) {
      const { data, error } = await sbUser.auth.getUser();
      if (!error && data?.user) user = { id: data.user.id, email: data.user.email };
    }

    if (!user) {
      if (!serviceKey) return res.status(200).json({ authenticated: false });
      const sbAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: u, error: uerr } = await sbAdmin.auth.getUser(access_token);
      if (uerr || !u?.user) return res.status(200).json({ authenticated: false });
      user = { id: u.user.id, email: u.user.email };
    }

    // --- Intento BOOTSTRAP ---
    let boot = null;
    let bootstrap_error = null;

    if (sbUser) {
      const { data, error } = await sbUser.rpc("bootstrap_session_context");
      if (error) {
        bootstrap_error = {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        };
      } else {
        boot = data;
      }
    } else {
      bootstrap_error = { message: "Missing SUPABASE_ANON_KEY (cannot run user-context RPC)" };
    }

    // Si bootstrap ok:
    if (Array.isArray(boot) && boot[0]?.org_id && boot[0]?.role) {
      return res.status(200).json({
        authenticated: true,
        user,
        current_org_id: boot[0].org_id,
        role: boot[0].role,
        bootstrapped: true,
      });
    }

    // --- Fallback con service role (para no tumbar login) ---
    if (!serviceKey) {
      return res.status(200).json({
        authenticated: true,
        user,
        current_org_id: null,
        role: null,
        bootstrapped: false,
        bootstrap_error,
        warning: "bootstrap failed and no serviceKey for fallback",
      });
    }

    const sbAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await sbAdmin
      .from("profiles")
      .select("org_id,default_org_id,current_org_id,active_tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    const current_org_id =
      profile?.active_tenant_id ||
      profile?.current_org_id ||
      profile?.default_org_id ||
      profile?.org_id ||
      null;

    let role = null;
    if (current_org_id) {
      const { data: aur } = await sbAdmin
        .from("app_user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", current_org_id)
        .maybeSingle();
      role = aur?.role || null;
    }

    return res.status(200).json({
      authenticated: true,
      user,
      current_org_id,
      role,
      bootstrapped: false,
      bootstrap_error,
      warning: "bootstrap_session_context failed; served fallback",
    });
  } catch (e) {
    console.error("[/api/auth/session] error:", e);
    return res.status(500).json({
      authenticated: false,
      error: e?.message || String(e),
    });
  }
}
