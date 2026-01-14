// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null;
}

export default async function handler(req, res) {
  const build_tag = "session-v11-bootstrap-bearer";

  try {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) {
      return res.status(500).json({
        build_tag,
        authenticated: false,
        error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
      });
    }

    const access_token = getCookie(req, "tg_at");
    if (!access_token) {
      return res.status(200).json({ build_tag, authenticated: false });
    }

    // ✅ Cliente en contexto del usuario (auth.uid() funciona en RPC)
    const sbUser = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${access_token}` } },
    });

    // 1) Validar sesión con el JWT del usuario
    const { data: u1, error: uerr1 } = await sbUser.auth.getUser();
    const user = u1?.user
      ? { id: u1.user.id, email: u1.user.email }
      : null;

    if (!user || uerr1) {
      return res.status(200).json({
        build_tag,
        authenticated: false,
      });
    }

    // 2) 🔥 BOOTSTRAP UNIVERSAL (acepta invites, crea org, crea rol, etc.)
    const { data: boot, error: berr } = await sbUser.rpc(
      "bootstrap_session_context"
    );

    if (!berr && Array.isArray(boot) && boot[0]?.org_id && boot[0]?.role) {
      return res.status(200).json({
        build_tag,
        authenticated: true,
        bootstrapped: true,
        user,
        current_org_id: boot[0].org_id,
        role: boot[0].role,
      });
    }

    // 3) Fallback (para no tumbar la app si algo raro pasa)
    //    Importante: aquí devolvemos el error real para que no quedes a ciegas.
    let fallback = {
      current_org_id: null,
      role: null,
    };

    if (serviceKey) {
      const sbAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // intenta org desde organizations via app_user_roles (más fiable que profiles)
      const { data: r1 } = await sbAdmin
        .from("app_user_roles")
        .select("org_id, role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      fallback.current_org_id = r1?.org_id || null;
      fallback.role = r1?.role || null;
    }

    return res.status(200).json({
      build_tag,
      authenticated: true,
      bootstrapped: false,
      user,
      current_org_id: fallback.current_org_id,
      role: fallback.role,
      bootstrap_error: berr
        ? {
            message: berr.message,
            code: berr.code,
            details: berr.details,
            hint: berr.hint,
          }
        : null,
      warning: "bootstrap_session_context failed; served fallback",
    });
  } catch (e) {
    console.error("[/api/auth/session] fatal:", e);
    return res.status(500).json({
      build_tag,
      authenticated: false,
      error: e?.message || String(e),
    });
  }
}
