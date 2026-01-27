// api/invite-tracker.ts
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { email, org_id } = req.body || {};
    if (!email || !org_id) {
      return res.status(400).json({ error: "Missing params" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const emailNorm = email.trim().toLowerCase();

    // 1️⃣ Buscar usuario existente
    const { data: usersResp } = await sb.auth.admin.listUsers({
      email: emailNorm,
    });

    let userId = usersResp?.users?.[0]?.id || null;

    // 2️⃣ Crear usuario si no existe
    if (!userId) {
      const { data: created, error: createErr } =
        await sb.auth.admin.createUser({
          email: emailNorm,
          email_confirm: true,
        });

      if (createErr) throw createErr;
      userId = created.user.id;
    }

    // 3️⃣ Crear / asegurar rol tracker (SIN person_id)
    const { error: roleErr } = await sb
      .from("app_user_roles")
      .upsert(
        {
          user_id: userId,
          org_id,
          role: "tracker",
        },
        { onConflict: "user_id,org_id" }
      );

    if (roleErr) throw roleErr;

    // 4️⃣ Enviar magic link
    const { error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: emailNorm,
      options: {
        redirectTo: "https://app.tugeocercas.com/auth/callback",
      },
    });

    if (linkErr) throw linkErr;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[invite-tracker] error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}
