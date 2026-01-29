// api/invite-tracker.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }

    const {
      email,
      org_id,
      person_id,
      force_tracker_default = false,
    } = req.body || {};

    if (!email || !org_id || !person_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // 1) Validar invitador
    const { data: inviter, error: inviterErr } = await admin.auth.getUser();
    if (inviterErr || !inviter?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    // 2) Crear o recuperar usuario tracker
    let trackerUserId: string;

    const { data: existing } = await admin
      .from("auth.users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing?.id) {
      trackerUserId = existing.id;
    } else {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
        });

      if (createErr || !created?.user) {
        throw new Error("No se pudo crear el usuario tracker");
      }
      trackerUserId = created.user.id;
    }

    // 3) Asignar rol tracker / membership (si aplica en tu esquema)
    await admin
      .from("memberships")
      .upsert({
        user_id: trackerUserId,
        org_id,
        role: "tracker",
      });

    // 4) AUTO-ASIGNACIÓN (B)
    let assignment_id: string | null = null;

    if (force_tracker_default) {
      const { data: assignment, error: assignErr } = await admin.rpc(
        "upsert_tracker_assignment_auto",
        {
          p_org_id: org_id,
          p_tracker_email: email,
        }
      );

      if (!assignErr) {
        assignment_id = assignment ?? null;
      }
    }

    // 5) Generar magic link directo a tracker-gps
    const redirectTo =
      `${process.env.PUBLIC_APP_URL}/auth/callback` +
      `?next=/tracker-gps` +
      `&org_id=${org_id}` +
      `&tg_flow=tracker`;

    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });

    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error("No se pudo generar magic link");
    }

    return res.status(200).json({
      magic_link: linkData.properties.action_link,
      redirect_to: redirectTo,
      tracker_default: true,
      assignment_id,
    });
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || "Unexpected error",
    });
  }
}
