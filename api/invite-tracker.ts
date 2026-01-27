import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    const { email, org_id, person_id } = req.body || {};
    if (!email || !org_id || !person_id) {
      return res.status(400).json({ error: "Missing params" });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // 1) Crear usuario (o reutilizar)
    const { data: userResp, error: userErr } =
      await sb.auth.admin.createUser({
        email,
        email_confirm: true,
      });

    if (userErr && !userErr.message.includes("already registered")) {
      throw userErr;
    }

    const userId =
      userResp?.user?.id ||
      (
        await sb.auth.admin.listUsers({ email })
      )?.data?.users?.[0]?.id;

    if (!userId) throw new Error("No user id");

    // 2) Insertar rol tracker
    await sb
      .from("app_user_roles")
      .upsert(
        {
          user_id: userId,
          org_id,
          role: "tracker",
          person_id,
        },
        { onConflict: "user_id,org_id" }
      );

    // 3) Enviar magic link
    await sb.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: "https://app.tugeocercas.com/auth/callback",
      },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("invite-tracker error:", e);
    return res.status(500).json({ error: e.message });
  }
}
