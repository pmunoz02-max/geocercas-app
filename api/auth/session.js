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

    // ✅ Necesitamos ANON KEY para ejecutar RPC con auth.uid() (contexto usuario)
    const anonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // (Opcional) Service key solo para validar/leer sin RLS si quisieras
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!url || !anonKey) {
      return res.status(500).json({
        authenticated: false,
        error: "Missing SUPABASE env vars (URL / ANON_KEY)",
      });
    }

    // Cookie HttpOnly del login
    const access_token = getCookie(req, "tg_at");
    if (!access_token) {
      return res.status(200).json({ authenticated: false });
    }

    // ✅ Cliente “autenticado” como el usuario (Bearer token)
    const sbUser = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    });

    // 1) Validar token y obtener user
    const { data: u, error: uerr } = await sbUser.auth.getUser();
    if (uerr || !u?.user) {
      return res.status(200).json({ authenticated: false });
    }

    const user = { id: u.user.id, email: u.user.email };

    // 2) 🔥 BOOTSTRAP UNIVERSAL en contexto del usuario (auth.uid() funciona)
    const { data: boot, error: berr } = await sbUser.rpc(
      "bootstrap_session_context"
    );

    if (berr) {
      // Fallback opcional: si tienes service key, podemos resolver rol/org a mano
      if (serviceKey) {
        const sbAdmin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // intenta leer org/rol mínimo desde tablas (no rompe si falla)
        const { data: prof } = await sbAdmin
          .from("profiles")
          .select("org_id,default_org_id,current_org_id,active_tenant_id")
          .eq("id", user.id)
          .maybeSingle();

        const current_org_id =
          prof?.active_tenant_id ||
          prof?.current_org_id ||
          prof?.default_org_id ||
          prof?.org_id ||
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
          warning: "bootstrap_session_context failed; served fallback",
        });
      }

      // sin serviceKey, reportamos el error
      return res.status(500).json({
        authenticated: false,
        error: berr.message || String(berr),
      });
    }

    if (!Array.isArray(boot) || !boot[0]?.org_id || !boot[0]?.role) {
      return res.status(500).json({
        authenticated: false,
        error: "bootstrap_session_context returned empty/incomplete",
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
