import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function isUuid(v: any) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    // 1️⃣ Validar sesión del invitador
    const {
      data: { user: inviter },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !inviter) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const { email, org_id, force_tracker_default } = req.body || {};

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!isUuid(org_id)) {
      return res.status(400).json({ error: "Invalid org_id (must be UUID)" });
    }

    // 2️⃣ Construir redirect directo a tracker-gps
    const redirectTo =
      `${process.env.PUBLIC_SITE_URL}/auth/callback` +
      `?next=/tracker-gps&org_id=${org_id}&tg_flow=tracker`;

    // 3️⃣ Invitar usuario por email (SUPABASE ENVÍA EL CORREO)
    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });

    if (inviteErr) {
      return res.status(400).json({
        error: inviteErr.message || "Error sending invite email",
      });
    }

    const trackerUserId = inviteData?.user?.id;
    if (!trackerUserId) {
      return res.status(500).json({
        error: "Invite sent but tracker user id not returned",
      });
    }

    // 4️⃣ Asegurar membership como tracker
    await supabaseAdmin.from("memberships").upsert(
      {
        user_id: trackerUserId,
        org_id,
        role: "tracker",
      },
      { onConflict: "user_id,org_id" }
    );

    // 5️⃣ Auto-asignación (si se pidió)
    let assignment_id: string | null = null;

    if (force_tracker_default) {
      const { data: assignId, error: assignErr } =
        await supabaseAdmin.rpc("upsert_tracker_assignment_auto", {
          p_tenant_id: org_id,
          p_tracker_user_id: trackerUserId,
          p_frequency_minutes: 1,
        });

      if (!assignErr && assignId) {
        assignment_id = assignId;
      }
    }

    return res.status(200).json({
      ok: true,
      email_sent: true,
      tracker_user_id: trackerUserId,
      assignment_id,
      redirect_to: redirectTo,
    });
  } catch (e: any) {
    console.error("invite-tracker error", e);
    return res.status(500).json({
      error: e?.message || "Internal server error",
    });
  }
}
