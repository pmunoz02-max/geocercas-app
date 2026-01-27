// api/invite-tracker.ts
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export default async function handler(req: any, res: any) {
  const build_tag = "invite-tracker-v2-send-otp-email";

  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ build_tag, ok: false, error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return res.status(500).json({
        build_tag,
        ok: false,
        error: "Missing env vars (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const email = normalizeEmail(body.email);
    const org_id = String(body.org_id || "").trim();

    if (!email || !email.includes("@")) return res.status(400).json({ build_tag, ok: false, error: "Email inválido" });
    if (!org_id) return res.status(400).json({ build_tag, ok: false, error: "org_id requerido" });

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
        email_confirm: true, // opcional
      });
      if (createErr) throw createErr;
      userId = created?.user?.id || null;
    }

    if (!userId) throw new Error("No se pudo determinar user_id");

    // 3) Asegurar rol tracker (SIN person_id)
    const { error: roleErr } = await sbAdmin
      .from("app_user_roles")
      .upsert({ user_id: userId, org_id, role: "tracker" }, { onConflict: "user_id,org_id" });

    if (roleErr) throw roleErr;

    // 4) Enviar email magic link (esto SÍ manda correo)
    const sbAnon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const redirectTo =
      process.env.AUTH_REDIRECT_TO?.trim() || "https://app.tugeocercas.com/auth/callback";

    const { error: otpErr } = await sbAnon.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false, // evita crear usuarios “fantasma”
      },
    });

    if (otpErr) throw otpErr;

    return res.status(200).json({ build_tag, ok: true, invited_email: email });
  } catch (e: any) {
    console.error("[api/invite-tracker] error:", e);
    return res.status(500).json({
      build_tag: "invite-tracker-v2-send-otp-email",
      ok: false,
      error: String(e?.message || e),
    });
  }
}
