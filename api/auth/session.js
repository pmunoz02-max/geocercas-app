// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

/**
 * session endpoint:
 * - NUNCA debe tumbar la app con 500 por casos normales (sin cookie / sin env).
 * - Si falta env: responde 503 controlado (y autenticado=false).
 * - Si no hay tg_at: responde 200 autenticado=false.
 * - Si hay tg_at: valida JWT y ejecuta bootstrap_session_context().
 */

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  // split seguro
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const hit = parts.find((p) => p.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null;
}

function isValidSupabaseUrl(url) {
  try {
    const u = new URL(url);
    // exige supabase.co
    if (!u.hostname.endsWith(".supabase.co")) return false;
    return true;
  } catch {
    return false;
  }
}

function sameProjectRef(url, expectedRef) {
  try {
    const u = new URL(url);
    // host: <ref>.supabase.co
    const ref = u.hostname.split(".")[0];
    return ref === expectedRef;
  } catch {
    return false;
  }
}

function safeError(err) {
  if (!err) return null;
  return {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
    status: err.status,
  };
}

export default async function handler(req, res) {
  const build_tag = "session-v12-never500-preview";

  // CORS/Preflight (por si el frontend pega desde otro origen)
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    return res.status(204).end();
  }

  try {
    // 🔒 Ref fijo del proyecto (para evitar dominios viejos)
    const PROJECT_REF = "mujwsfhkocsuuahlrssn";

    // ✅ Env principal (server)
    let url = process.env.SUPABASE_URL;
    let anonKey = process.env.SUPABASE_ANON_KEY;

    // ✅ Fallback CONTROLADO (solo si coincide project ref y dominio)
    // (Esto no es ambiguo: solo acepta el mismo ref y *.supabase.co)
    if ((!url || !anonKey) && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
      const candidateUrl = process.env.VITE_SUPABASE_URL;
      const candidateAnon = process.env.VITE_SUPABASE_ANON_KEY;

      if (isValidSupabaseUrl(candidateUrl) && sameProjectRef(candidateUrl, PROJECT_REF)) {
        url = url || candidateUrl;
        anonKey = anonKey || candidateAnon;
      }
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // ❗ Nunca 500 por env faltante: responde controlado
    if (!url || !anonKey) {
      return res.status(503).json({
        build_tag,
        authenticated: false,
        ok: false,
        error_code: "MISSING_ENV",
        missing: {
          SUPABASE_URL: !process.env.SUPABASE_URL,
          SUPABASE_ANON_KEY: !process.env.SUPABASE_ANON_KEY,
          VITE_SUPABASE_URL: !process.env.VITE_SUPABASE_URL,
          VITE_SUPABASE_ANON_KEY: !process.env.VITE_SUPABASE_ANON_KEY,
        },
        note:
          "Configura env vars en Vercel (Preview) o en tu entorno serverless. Este endpoint no debe devolver 500 por env faltante.",
      });
    }

    // ✅ Validación dura del URL: dominio + project ref
    if (!isValidSupabaseUrl(url) || !sameProjectRef(url, PROJECT_REF)) {
      return res.status(503).json({
        build_tag,
        authenticated: false,
        ok: false,
        error_code: "INVALID_SUPABASE_URL",
        url_used: url,
        note: `El SUPABASE_URL debe ser https://${PROJECT_REF}.supabase.co`,
      });
    }

    const access_token = getCookie(req, "tg_at");

    // Sin cookie = no autenticado (normal)
    if (!access_token) {
      return res.status(200).json({ build_tag, authenticated: false, ok: true });
    }

    // ✅ Cliente en contexto del usuario (auth.uid() funciona en RPC)
    const sbUser = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${access_token}` } },
    });

    // 1) Validar sesión con el JWT del usuario
    const { data: u1, error: uerr1 } = await sbUser.auth.getUser();
    const user = u1?.user ? { id: u1.user.id, email: u1.user.email } : null;

    if (!user || uerr1) {
      // token expirado / inválido / no corresponde
      return res.status(200).json({
        build_tag,
        authenticated: false,
        ok: true,
        reason: "INVALID_OR_EXPIRED_TOKEN",
        auth_error: safeError(uerr1),
      });
    }

    // 2) BOOTSTRAP UNIVERSAL
    const { data: boot, error: berr } = await sbUser.rpc("bootstrap_session_context");

    if (!berr && Array.isArray(boot) && boot[0]?.org_id && boot[0]?.role) {
      return res.status(200).json({
        build_tag,
        authenticated: true,
        ok: true,
        bootstrapped: true,
        user,
        current_org_id: boot[0].org_id,
        role: boot[0].role,
      });
    }

    // 3) Fallback controlado (NO tumba app)
    let fallback = { current_org_id: null, role: null };

    if (serviceKey) {
      const sbAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: r1, error: rerr1 } = await sbAdmin
        .from("app_user_roles")
        .select("org_id, role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!rerr1) {
        fallback.current_org_id = r1?.org_id || null;
        fallback.role = r1?.role || null;
      }
    }

    return res.status(200).json({
      build_tag,
      authenticated: true,
      ok: true,
      bootstrapped: false,
      user,
      current_org_id: fallback.current_org_id,
      role: fallback.role,
      bootstrap_error: safeError(berr),
      warning: "bootstrap_session_context failed; served fallback",
    });
  } catch (e) {
    // Aquí sí devolvemos 500: esto es un bug real (no env/cookie)
    console.error("[/api/auth/session] fatal:", e);
    return res.status(500).json({
      build_tag: "session-v12-never500-preview",
      authenticated: false,
      ok: false,
      error_code: "FATAL",
      error: e?.message || String(e),
    });
  }
}
