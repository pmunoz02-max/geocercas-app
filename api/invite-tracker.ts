// api/invite-tracker.ts
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const BUILD_TAG = "invite-tracker-v3-default-tracker";

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function isTruthy(x: any) {
  return x === true || x === "true" || x === 1 || x === "1";
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ build_tag: BUILD_TAG, ok: false, error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return res.status(500).json({
        build_tag: BUILD_TAG,
        ok: false,
        error: "Missing env vars (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const email = normalizeEmail(body.email);
    const org_id = String(body.org_id || "").trim();
    const forceTrackerDefault = isTruthy(body.force_tracker_default); // opcional

    if (!email || !email.includes("@")) return res.status(400).json({ build_tag: BUILD_TAG, ok: false, error: "Email inválido" });
    if (!org_id) return res.status(400).json({ build_tag: BUILD_TAG, ok: false, error: "org_id requerido" });

    // 1) Service client: DB + admin user ops
    const sbAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2) Encontrar usuario (o crearlo si no existe)
    const { data: usersResp, error: listErr } = await sbAdmin.auth.admin.listUsers({ email });
    if (listErr) throw listErr;

    let userId = usersResp?.users?.[0]?.id || null;

    if (!userId) {
      const { data: created, error: createErr } = await sbAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      userId = created?.user?.id || null;
    }

    if (!userId) throw new Error("No se pudo determinar user_id");

    // 3) Decidir si este tracker debe quedar como "default"
    //    Regla segura:
    //    - Si el usuario NO tiene ningún is_default=true => ponemos tracker como default.
    //    - Si fuerza explícitamente => ponemos tracker como default.
    //    - Si ya existe default, NO lo pisamos (evita romper owners/admins existentes).
    let shouldSetDefault = false;

    {
      const { data: existingDefaults, error: defErr } = await sbAdmin
        .from("memberships")
        .select("org_id, role, is_default")
        .eq("user_id", userId)
        .eq("is_default", true);

      if (defErr) throw defErr;

      const hasAnyDefault = Array.isArray(existingDefaults) && existingDefaults.length > 0;
      shouldSetDefault = forceTrackerDefault || !hasAnyDefault;
    }

    // 4) Crear/actualizar membership tracker
    const { error: upErr } = await sbAdmin
      .from("memberships")
      .upsert({ org_id, user_id: userId, role: "tracker", is_default: shouldSetDefault }, { onConflict: "org_id,user_id" });

    if (upErr) throw upErr;

    // 5) Si lo vamos a dejar default, apagamos otros defaults del usuario (solo si no son esta org)
    //    Esto garantiza que bootstrap_session_context devuelva tracker y no "owner" por un default viejo.
    if (shouldSetDefault) {
      const { error: offErr } = await sbAdmin
        .from("memberships")
        .update({ is_default: false })
        .eq("user_id", userId)
        .neq("org_id", org_id)
        .eq("is_default", true);

      if (offErr) throw offErr;
    }

    // 6) Enviar email magic link (esto SÍ manda correo)
    const sbAnon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const redirectTo = process.env.AUTH_REDIRECT_TO?.trim() || "https://app.tugeocercas.com/auth/callback";

    const { error: otpErr } = await sbAnon.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false, // evita crear usuarios “fantasma”
      },
    });

    if (otpErr) throw otpErr;

    return res.status(200).json({
      build_tag: BUILD_TAG,
      ok: true,
      invited_email: email,
      user_id: userId,
      org_id,
      tracker_default: shouldSetDefault,
    });
  } catch (e: any) {
    console.error("[api/invite-tracker] error:", e);
    return res.status(500).json({
      build_tag: BUILD_TAG,
      ok: false,
      error: String(e?.message || e),
    });
  }
}
